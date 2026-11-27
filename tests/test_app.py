import base64
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest

from app import Store, create_server, spreadsheet
from backup import backup


RECORD = {"address": "42 Example Street", "city": "Pleasant Hope", "county": "Polk",
          "parcel": "012-345", "ask": 110000, "status": "Active", "watch": True,
          "source": "Owner example", "source_url": "https://example.test/property",
          "verified": "2026-01-01", "confidence": "user-entered"}


class StoreTests(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory()
        self.addCleanup(workspace.cleanup)
        self.path = Path(workspace.name) / "test.sqlite"
        self.store = Store(self.path)

    def test_persistence_duplicate_history_and_alert(self):
        record_id = self.store.save_property(RECORD)
        with self.assertRaises(FileExistsError):
            self.store.save_property(RECORD | {"address": "42 Example St."})
        with self.assertRaises(FileExistsError):
            self.store.save_property(RECORD | {"address": "43 Example St.", "parcel": "012345"})
        self.store.save_property(RECORD | {"version": 1, "ask": 99000}, record_id)
        self.store.save_property(RECORD | {"version": 2, "ask": 99000}, record_id)
        with self.assertRaises(FileExistsError):
            self.store.save_property(RECORD | {"version": 1, "watch": False}, record_id)
        self.store.save_settings({"minimum_cash_flow": 400})
        reloaded = Store(self.path)
        state = reloaded.state()
        self.assertEqual(state["settings"]["minimum_cash_flow"], 400)
        self.assertEqual(state["properties"][0]["ask"], 99000)
        self.assertTrue(state["properties"][0]["watch"])
        self.assertEqual([v["record"]["ask"] for v in reloaded.history(record_id)], [99000, 110000])
        self.assertTrue(state["changes"][0]["alert"])

    def test_backup_is_restorable_and_preserves_existing_snapshot(self):
        record_id = self.store.save_property(RECORD)
        destination = self.path.with_name("backup.sqlite")
        backup(self.path, destination)
        self.store.save_property(RECORD | {"version": 1, "ask": 99000}, record_id)
        with self.assertRaises(FileExistsError):
            backup(self.path, destination)
        self.assertEqual(Store(destination).state()["properties"][0]["ask"], 110000)

    def test_demo_isolation_and_csv_formula_escape(self):
        self.store.save_property(RECORD | {"demo": True})
        self.store.save_property(RECORD | {"address": "=42 Example Street"})
        state = self.store.state()
        self.assertEqual(len(state["changes"]), 1)
        self.assertEqual(sum(p["demo"] for p in state["properties"]), 1)
        with self.assertRaises(ValueError):
            self.store.save_property(RECORD | {"demo": False, "version": 1}, 1)
        rows = spreadsheet(state).splitlines()
        self.assertEqual(len(rows), 2)
        self.assertIn("'=42 Example Street", rows[1])

    def test_score_weights_update_rank_without_clearing_gates(self):
        self.store.save_property(RECORD | {"inputs": {"price":100000, "rehab":0, "rent":1500}})
        original = self.store.state()["properties"][0]
        self.store.save_settings({"rental_weight_cash_flow": 35, "rental_weight_demand": 0})
        updated = self.store.state()["properties"][0]
        self.assertGreater(updated["scores"]["hold"], original["scores"]["hold"])
        self.assertIsNone(updated["analysis"]["recommended"])
        with self.assertRaises(ValueError):
            self.store.save_settings({"rental_weight_cash_flow": 100})

    def test_evidence_validation_and_rehab_fallback(self):
        for invalid in [{"source_url": "javascript:alert(1)"}, {"verified": "2026-02-30"},
                        {"confidence": "verified", "source_url": ""}, {"latitude": 91},
                        {"comps": [{"kind": "Verified closed sale"}]}]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.store.save_property(RECORD | invalid)
        self.store.save_property(RECORD | {"rehab": [{"system":"Roofing", "basis":"Visible",
            "low":1000, "expected":2000, "high":3000}], "inputs":{"price":100000,"rent":1400}})
        self.assertAlmostEqual(self.store.state()["properties"][0]["analysis"]["hold"]["cash"], 102200)


class HttpTests(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory()
        self.addCleanup(workspace.cleanup)
        self.origin = "https://edge.example.test"
        self.password = "temporary-test-value"
        self.server = create_server(Path(workspace.name) / "test.sqlite", self.password, self.origin, 0)
        worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        worker.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(worker.join)
        self.addCleanup(self.server.shutdown)

    def request(self, path, method="GET", data=None, auth=True, origin=None):
        client = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            headers = {}
            if auth:
                headers["Authorization"] = "Basic " + base64.b64encode(f"owner:{self.password}".encode()).decode()
            if data is not None:
                headers.update({"Origin": origin or self.origin, "Content-Type":"application/json"})
            client.request(method, path, json.dumps(data) if data is not None else None, headers)
            response = client.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            client.close()

    def test_private_routes_and_static_assets(self):
        for path in ("/", "/api/state", "/api/export", "/api/properties/1/history"):
            with self.subTest(path=path):
                self.assertEqual(self.request(path, auth=False)[0], 401)
        for path in ("/", "/style.css", "/app.js", "/sw.js", "/icon.png", "/manifest.webmanifest"):
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(headers["Cache-Control"], "no-store")
                self.assertTrue(body)

    def test_authenticated_workflow_and_origin(self):
        self.assertEqual(self.request("/api/properties", "POST", RECORD, origin="https://other.test")[0], 403)
        self.assertEqual(self.request("/api/properties", "POST", RECORD, auth=False)[0], 401)
        status, _, body = self.request("/api/properties", "POST", RECORD)
        self.assertEqual(status, 201)
        path = "/api/properties/" + str(json.loads(body)["id"])
        self.assertEqual(self.request(path, "PUT", RECORD | {"version": 1, "watch": False})[0], 200)
        self.assertFalse(json.loads(self.request("/api/state")[2])["properties"][0]["watch"])
        self.assertEqual(len(json.loads(self.request(path + "/history")[2])), 2)
        self.assertEqual(self.request("/api/settings", "PUT", {"minimum_dscr": 1.3})[0], 200)
        self.assertEqual(self.request("/api/analyze", "POST", {"price": -1})[0], 400)
        self.assertEqual(self.request("/api/analyze", "POST", {"price": 100000,"rehab":0,"rent":1200})[0], 200)
        self.assertIn(b"42 Example Street", self.request("/api/export")[2])


if __name__ == "__main__":
    unittest.main()
