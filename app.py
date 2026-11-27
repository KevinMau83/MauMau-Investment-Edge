"""Private single-owner application. Start behind a TLS reverse proxy for remote access."""
import base64
import csv
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import sqlite3
from contextlib import closing, contextmanager
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from finance import DEFAULTS, INPUTS, GATES, CRITERIA_RATES, RATES, SCORE_MODELS, analysis, criteria, number

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
MARKETS = "Pleasant Hope,Springfield,Bolivar,Buffalo,Fair Grove,Brighton,Morrisville,Willard,Ash Grove,Walnut Grove,Strafford,Republic,Marshfield,Humansville".split(",")
TEXT_FIELDS = {"address": 250, "city": 100, "county": 100, "zip": 12, "parcel": 100,
    "status": 50, "type": 80, "source": 150, "source_url": 1000, "verified": 10,
    "notes": 8000, "photo": 1000, "acquisition": 80, "description": 8000}
CONFIDENCE = {"verified", "estimated", "user-entered", "unverified", "illustrative"}
MOTIVATION = {"extended": 15, "reductions": 10, "discount": 10, "vacant": 10, "bank": 10,
    "motivated": 5, "failed": 5, "as_is": 5, "cash": 5, "foreclosure": 10, "estate": 10, "liquidation": 5}
REHAB_TYPES = ["Roofing", "Foundation", "Structure", "Siding", "Windows and doors", "Electrical",
    "Plumbing", "HVAC", "Kitchen", "Bathroom", "Flooring", "Drywall", "Painting",
    "Insulation", "Landscaping", "Driveway", "Water damage", "Other"]


def clean_url(value):
    if value:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Use an HTTP(S) source URL without credentials")
    return value


def short(raw, key, limit):
    value = raw.get(key, "")
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f"Invalid {key}")
    return value.strip()


def flag(raw, key):
    value = raw.get(key, False)
    if not isinstance(value, bool):
        raise ValueError(f"Invalid {key}")
    return value


def normalized_address(address):
    words = re.findall(r"[^\W_]+|#", address.casefold().replace("#", " # "), re.UNICODE)
    aliases = {"street": "st", "road": "rd", "avenue": "ave", "drive": "dr", "lane": "ln",
        "court": "ct", "boulevard": "blvd", "highway": "hwy", "place": "pl",
        "north": "n", "south": "s", "east": "e", "west": "w", "apartment": "#", "unit": "#", "apt": "#"}
    return " ".join(aliases.get(word, word) for word in words)


def date_field(value):
    if value and date.fromisoformat(value).isoformat() != value:
        raise ValueError("Use YYYY-MM-DD dates")
    return value


def clean_property(raw):
    result = {key: short(raw, key, size) for key, size in TEXT_FIELDS.items()}
    if not normalized_address(result["address"]) or not result["city"]:
        raise ValueError("Street address and city are required")
    for key in ("source_url", "photo"):
        clean_url(result[key])
    date_field(result["verified"])
    status = raw.get("confidence", "unverified")
    if status not in CONFIDENCE:
        raise ValueError("Invalid evidence status")
    result["demo"] = flag(raw, "demo") or status == "illustrative"
    result["confidence"] = "illustrative" if result["demo"] else status
    if status == "verified" and not result["demo"] and not all(result[key] for key in ("source", "source_url", "verified")):
        raise ValueError("Verified records require a source, link and date")
    result["watch"] = flag(raw, "watch")
    for key, bounds in {"ask": (0, 1e9), "original": (0, 1e9), "dom": (0, 100000),
        "beds": (0, 1000), "baths": (0, 1000), "sqft": (0, 1e7), "lot": (0, 1e9),
        "year": (0, 3000), "latitude": (-90, 90), "longitude": (-180, 180),
        "drive": (0, 10000), "distance": (0, 10000), "reductions_count": (0, 10000)}.items():
        value = raw.get(key)
        result[key] = None if value is None else number(value, key, *bounds)
    for key, size in {"occupancy": 80, "agent": 150, "contact": 250, "deadline": 10}.items():
        result[key] = short(raw, key, size)
    date_field(result["deadline"])
    result["inputs"] = {key: raw.get("inputs", {})[key] for key in INPUTS if key in raw.get("inputs", {})}
    result["gates"] = {key: flag(raw.get("gates", {}), key) for key in GATES}
    result["motivation"] = {key: flag(raw.get("motivation", {}), key) for key in MOTIVATION}
    for key in ("low_arv", "high_arv", "low_rent", "high_rent", "existing_rent"):
        value = raw.get(key)
        result[key] = None if value is None else number(value, key)
    for key in ("rehab", "comps"):
        items = raw.get(key, [])
        if not isinstance(items, list) or len(items) > 100:
            raise ValueError(f"Invalid {key} items")
        result[key] = []
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"Invalid {key} item")
            if key == "rehab":
                cleaned = {field: short(item, field, 1000) for field in ("system", "basis", "note")}
                if cleaned["system"] not in REHAB_TYPES or cleaned["basis"] not in {"Visible", "Suspected", "Assumed", "Inspection required"}:
                    raise ValueError("Invalid rehabilitation category or evidence basis")
                cleaned.update({field: number(item.get(field), field) for field in ("low", "expected", "high")})
                if not cleaned["low"] <= cleaned["expected"] <= cleaned["high"]:
                    raise ValueError("Rehab ranges must be ordered")
            else:
                cleaned = {field: short(item, field, 1000) for field in ("address", "kind", "date", "condition", "differences", "url")}
                if cleaned["kind"] not in {"Verified closed sale", "Asking sale", "Assessed value", "Automated estimate", "Unverified sale", "Verified rent", "Asking rent"}:
                    raise ValueError("Invalid comparable evidence type")
                if not cleaned["address"] or not cleaned["date"] or not cleaned["url"]:
                    raise ValueError("Comparable address, date and source URL are required")
                date_field(cleaned["date"])
                clean_url(cleaned["url"])
                cleaned["amount"] = number(item.get("amount"), "comparable amount")
                cleaned["sqft"] = number(item.get("sqft", 0), "comparable square feet")
            result[key].append(cleaned)
    analysis(underwriting_inputs(result), gates=result["gates"])
    return result


def underwriting_inputs(record):
    inputs = record["inputs"].copy()
    if inputs.get("rehab") is None and record.get("rehab"):
        inputs["rehab"] = sum(item["expected"] for item in record["rehab"])
    return inputs


def investment_score(result, settings, record):
    motivation = sum(points for key, points in MOTIVATION.items() if record.get("motivation", {}).get(key))
    inputs = record["inputs"]
    score = {}
    confidence_points = 1 if record["confidence"] == "verified" else .4 if record["confidence"] == "estimated" else 0
    def fraction(value, target):
        return min(1, max(0, value / target)) if value is not None and target > 0 else 0
    for key in ("hold", "brrrr", "flip", "wholesale"):
        model = result[key]
        if model is None:
            continue
        if key in {"hold", "brrrr"}:
            model_type = "rental"
            factors = {
                "cash_flow": fraction(model["cash_flow"], settings["preferred_cash_flow"]),
                "cash_on_cash": fraction(model["coc"], settings["preferred_coc"]),
                "dscr": 1 if not model["debt"] else fraction(model["dscr"], settings["preferred_dscr"]),
                "demand": confidence_points,
                "capital": fraction(model["efficiency"] if key == "brrrr" else model["cap"], 1 if key == "brrrr" else .08),
                "condition": bool(record["gates"].get("rehab")),
                "equity": fraction(model["equity"], (inputs.get("arv") or inputs.get("as_is") or 0) * .30),
                "resilience": fraction(min(model["stress"].values()), settings["minimum_cash_flow"]),
            }
        else:
            model_type = "general"
            value = inputs.get("as_is")
            price = inputs.get("price")
            discount = (value - price) / value if value and price is not None else 0
            factors = {
                "return": fraction(model["profit"], settings["target_profit"]),
                "discount": fraction(discount, .25),
                "demand": confidence_points,
                "condition": bool(record["gates"].get("rehab")),
                "motivation": motivation / 100,
                "capital": bool(record["gates"].get("financing")),
            }
        score[key] = round(sum(settings[f"{model_type}_weight_{factor}"] * value for factor, value in factors.items()))
    return score, motivation


class Store:
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode = WAL;
                CREATE TABLE IF NOT EXISTS properties (
                    id INTEGER PRIMARY KEY, demo INTEGER NOT NULL, address_key TEXT NOT NULL,
                    parcel_key TEXT, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(demo, address_key), UNIQUE(demo, parcel_key));
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY, property_id INTEGER NOT NULL REFERENCES properties(id),
                    version INTEGER NOT NULL, data TEXT NOT NULL,
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL);
            """)

    @contextmanager
    def connect(self):
        with closing(sqlite3.connect(self.path, timeout=10)) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys = ON")
            try:
                yield db
            except BaseException:
                db.rollback()
                raise
            else:
                db.commit()

    def get_settings(self, db):
        row = db.execute("SELECT data FROM settings WHERE key='criteria'").fetchone()
        return criteria(json.loads(row["data"])) if row else DEFAULTS.copy()

    def save_settings(self, raw):
        data = criteria(raw)
        with self.connect() as db:
            db.execute("INSERT INTO settings VALUES ('criteria', ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data", (json.dumps(data),))
        return data

    def state(self):
        with self.connect() as db:
            db.execute("BEGIN")
            settings = self.get_settings(db)
            records = []
            changes = []
            for row in db.execute("SELECT * FROM properties ORDER BY id DESC"):
                record = json.loads(row["data"])
                result = analysis(underwriting_inputs(record), settings, record["gates"], record["confidence"], record["demo"])
                scores, motivation = investment_score(result, settings, record)
                records.append(record | {"id": row["id"], "version": row["version"], "analysis": result,
                    "scores": scores, "motivation_score": motivation})
            for row in db.execute("""SELECT h.property_id, h.timestamp, h.data, prev.data AS previous
                 FROM history h LEFT JOIN history prev ON prev.property_id=h.property_id AND prev.version=h.version-1
                 JOIN properties p ON p.id=h.property_id WHERE p.demo=0 ORDER BY h.id DESC LIMIT 100"""):
                current = json.loads(row["data"])
                previous = json.loads(row["previous"]) if row["previous"] else None
                events = []
                if previous is None:
                    events.append(("New research record", False))
                else:
                    if current["ask"] is not None and previous["ask"] and current["ask"] < previous["ask"]:
                        drop = (previous["ask"] - current["ask"]) / previous["ask"]
                        events.append((f"Price reduced {drop:.1%}", drop >= settings["price_drop_alert"]))
                    if current["status"] != previous["status"]:
                        events.append(("Listing status changed", current["watch"]))
                changes.extend({"id": row["property_id"], "at": row["timestamp"], "address": current["address"],
                    "label": label, "alert": alert} for label, alert in events)
        return {"properties": records, "settings": settings, "changes": changes, "markets": MARKETS,
            "schema": {"text": TEXT_FIELDS, "inputs": INPUTS, "rates": sorted(RATES),
                       "criteria_rates": sorted(CRITERIA_RATES), "gates": GATES, "motivation": MOTIVATION,
                       "rehab": REHAB_TYPES, "score_models": SCORE_MODELS}}

    def save_property(self, raw, record_id=None):
        record = clean_property(raw)
        address_key = f"{normalized_address(record['address'])}|{normalized_address(record['city'])}"
        county = normalized_address(record["county"])
        parcel = re.sub(r"[^a-z0-9]", "", record["parcel"].lower())
        parcel_key = f"{county}|{parcel}" if county and parcel else None
        payload = json.dumps(record, sort_keys=True)
        try:
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                version = 1
                if record_id is None:
                    record_id = db.execute("INSERT INTO properties(demo,address_key,parcel_key,data) VALUES (?,?,?,?)",
                        (record["demo"], address_key, parcel_key, payload)).lastrowid
                else:
                    row = db.execute("SELECT demo,data,version FROM properties WHERE id=?", (record_id,)).fetchone()
                    if row is None:
                        raise LookupError("Property not found")
                    if raw.get("version") != row["version"]:
                        raise FileExistsError("The property changed. Reload before editing.")
                    if bool(row["demo"]) != record["demo"]:
                        raise ValueError("Record type cannot change after creation")
                    if row["data"] == payload:
                        return record_id
                    version = row["version"] + 1
                    db.execute("UPDATE properties SET address_key=?,parcel_key=?,data=?,version=? WHERE id=?",
                        (address_key, parcel_key, payload, version, record_id))
                db.execute("INSERT INTO history(property_id,version,data) VALUES (?,?,?)", (record_id, version, payload))
        except sqlite3.IntegrityError as exc:
            raise FileExistsError("A matching address or county parcel already exists") from exc
        return record_id

    def history(self, record_id):
        with self.connect() as db:
            return [{"version": row["version"], "at": row["timestamp"], "record": json.loads(row["data"])}
                for row in db.execute("SELECT version,timestamp,data FROM history WHERE property_id=? ORDER BY version DESC", (record_id,))]


def spreadsheet(state):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["Evidence", "Address", "City", "County", "Ask", "Cash flow", "DSCR",
        "Flip profit", "BRRRR cash remaining", "Strategy cleared", "Source", "Verification date"])
    def safe(value):
        if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
            return "'" + value
        return value
    for item in state["properties"]:
        if item["demo"]:
            continue
        calc = item["analysis"]
        writer.writerow(map(safe, [item["confidence"], item["address"], item["city"], item["county"],
            item["ask"], (calc["hold"] or {}).get("cash_flow"), (calc["hold"] or {}).get("dscr"),
            (calc["flip"] or {}).get("profit"), (calc["brrrr"] or {}).get("remaining"),
            calc["recommended"], item["source_url"], item["verified"]]))
    return output.getvalue()


class Handler(BaseHTTPRequestHandler):
    server_version = "InvestmentEdge"
    sys_version = ""

    def log_message(self, fmt, *args):
        # Avoid leaking request paths, headers or submitted data into logs.
        pass

    def respond(self, status, body=b"", mime="application/json", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' https:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, data):
        self.respond(status, json.dumps(data, allow_nan=False).encode())

    def authenticate(self):
        header = self.headers.get("Authorization", "")
        prefix, _, value = header.partition(" ")
        try:
            provided = base64.b64decode(value, validate=True) if prefix.lower() == "basic" else b""
        except ValueError:
            provided = b""
        actual = hashlib.sha256(provided).digest()
        if hmac.compare_digest(actual, self.server.credential_hash):
            return True
        self.respond(401, b"Owner sign-in required.", "text/plain; charset=utf-8",
            {"WWW-Authenticate": 'Basic realm="Investment Edge", charset="UTF-8"'})
        return False

    def do_GET(self):
        path = urlsplit(self.path).path
        # Assets are static and contain no owner data.
        assets = {"/style.css", "/app.js", "/manifest.webmanifest", "/icon.png", "/icon-512.png", "/sw.js"}
        if path not in assets and not self.authenticate():
            return
        if path == "/" or path in assets:
            name = "index.html" if path == "/" else path[1:]
            mime = "application/manifest+json" if name.endswith(".webmanifest") else mimetypes.guess_type(name)[0]
            self.respond(200, (STATIC / name).read_bytes(), mime or "application/octet-stream")
        elif path == "/api/state":
            self.send_json(200, self.server.store.state())
        elif path == "/api/export":
            self.respond(200, spreadsheet(self.server.store.state()).encode(), "text/csv; charset=utf-8",
                {"Content-Disposition": 'attachment; filename="investment-edge.csv"'})
        elif match := re.fullmatch(r"/api/properties/(\d+)/history", path):
            self.send_json(200, self.server.store.history(int(match[1])))
        else:
            self.send_json(404, {"error": "Page not found"})

    def do_POST(self):
        self.mutate()

    def do_PUT(self):
        self.mutate()

    def mutate(self):
        if not self.authenticate():
            return
        try:
            if self.headers.get("Origin") != self.server.origin or self.headers.get_content_type() != "application/json":
                self.send_json(403, {"error": "Request origin or content type rejected"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 262144:
                self.send_json(413, {"error": "Request size rejected"})
                return
            raw = json.loads(self.rfile.read(length))
            if not isinstance(raw, dict):
                raise ValueError("Expected a JSON object")
            path = urlsplit(self.path).path
            if path == "/api/settings" and self.command == "PUT":
                self.send_json(200, self.server.store.save_settings(raw))
            elif path == "/api/properties" and self.command == "POST":
                self.send_json(201, {"id": self.server.store.save_property(raw)})
            elif (match := re.fullmatch(r"/api/properties/(\d+)", path)) and self.command == "PUT":
                self.send_json(200, {"id": self.server.store.save_property(raw, int(match[1]))})
            elif path == "/api/analyze" and self.command == "POST":
                with self.server.store.connect() as db:
                    settings = self.server.store.get_settings(db)
                self.send_json(200, analysis(raw, settings))
            else:
                self.send_json(404, {"error": "Action not found"})
        except FileExistsError as exc:
            self.send_json(409, {"error": str(exc)})
        except LookupError:
            self.send_json(404, {"error": "Record not found"})
        except (ValueError, TypeError, AttributeError, OverflowError) as exc:
            self.send_json(400, {"error": str(exc) if type(exc) is ValueError else "Invalid input"})
        except sqlite3.Error:
            self.send_json(503, {"error": "Storage temporarily unavailable"})


def create_server(db_path, password, origin, port=8000):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.store = Store(db_path)
    server.origin = origin
    server.credential_hash = hashlib.sha256(f"owner:{password}".encode()).digest()
    return server


if __name__ == "__main__":
    os.umask(0o077)
    password = os.environ.get("EDGE_PASSWORD", "")
    if len(password) < 16:
        raise SystemExit("Set EDGE_PASSWORD to a strong password of at least 16 characters.")
    port = int(os.environ.get("EDGE_PORT", "8000"))
    origin = os.environ.get("EDGE_ORIGIN", f"http://127.0.0.1:{port}")
    if origin not in {f"http://127.0.0.1:{port}", f"http://localhost:{port}"} and not origin.startswith("https://"):
        raise SystemExit("Remote origins require HTTPS.")
    path = Path(os.environ.get("EDGE_DB", "runtime/edge.sqlite"))
    path.parent.mkdir(parents=True, exist_ok=True)
    with create_server(path, password, origin, port) as server:
        print(f"Investment Edge listening on 127.0.0.1:{port}", flush=True)
        server.serve_forever()
