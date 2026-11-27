"""Financial calculations. Rates are decimals, money is USD, terms are in months."""
from math import isfinite, expm1, log1p

DEFAULTS = {
    "vacancy": .05, "management": .08, "maintenance": .05, "capex": .05,
    "minimum_cash_flow": 300, "preferred_cash_flow": 500,
    "minimum_coc": .08, "preferred_coc": .12,
    "minimum_dscr": 1.25, "preferred_dscr": 1.40,
    "drive_minutes": 45, "target_profit": 25000, "opening_discount": .05,
    "price_drop_alert": .05, "maximum_refinance_ltv": .80,
}
GENERAL_WEIGHTS = {
    "return": 30, "discount": 20, "demand": 15, "condition": 15,
    "motivation": 10, "capital": 10,
}
RENTAL_WEIGHTS = {
    "cash_flow": 25, "cash_on_cash": 18, "dscr": 15, "demand": 10,
    "capital": 8, "condition": 8, "equity": 6, "resilience": 10,
}
SCORE_MODELS = {"general": GENERAL_WEIGHTS, "rental": RENTAL_WEIGHTS}
for model, weights in SCORE_MODELS.items():
    DEFAULTS.update({f"{model}_weight_{factor}": weight for factor, weight in weights.items()})

INPUTS = {
    "price": ("Purchase price", None), "rent": ("Monthly rent", None),
    "arv": ("Expected after-repair value", None), "as_is": ("As-is value", None),
    "rehab": ("Expected rehab", None), "contingency": ("Rehab contingency %", .10),
    "closing": ("Acquisition closing costs", 0), "tax": ("Monthly property tax", 0),
    "insurance": ("Monthly insurance", 0), "utilities": ("Monthly utilities", 0),
    "hoa": ("Monthly HOA", 0), "other": ("Other monthly operating costs", 0),
    "loan": ("Rental loan principal", 0), "rate": ("Rental interest %", .07),
    "term": ("Rental term in months", 360),
    "months": ("Flip holding months", 6), "flip_loan": ("Flip loan principal", 0),
    "flip_rate": ("Flip loan interest %", .10), "fees": ("Loan origination fees", 0),
    "heloc": ("HELOC principal", 0), "heloc_rate": ("HELOC interest %", .09),
    "holding": ("Additional monthly hold costs", 0),
    "selling": ("Commission and variable selling costs %", .07),
    "disposition": ("Fixed disposition costs", 0),
    "refi_ltv": ("Refinance LTV %", .70), "refi_rate": ("Refinance interest %", .075),
    "refi_term": ("Refinance term in months", 360),
    "refi_fees": ("Refinance costs", 0), "seasoning": ("Seasoning months", 6),
    "assignment": ("Expected assignment fee", None),
    "assignment_cost": ("Assignment expenses", 0),
}
RATES = {"contingency", "rate", "flip_rate", "heloc_rate", "selling", "refi_ltv", "refi_rate"}
CRITERIA_RATES = {"vacancy", "management", "maintenance", "capex", "opening_discount", "price_drop_alert", "maximum_refinance_ltv"}
GATES = {
    "valuation": "Sufficient valuation evidence", "title": "Title cleared",
    "financing": "Financing exposure approved", "reserves": "Cash reserves adequate",
    "rehab": "Rehab scope sufficiently verified", "downside": "Downside exposure approved",
    "availability": "Availability verified", "legal": "Legal and contractual review clear",
    "concentration": "Capital concentration acceptable", "appreciation": "Works without speculative appreciation",
    "assignment": "Assignment expressly permitted", "refinance": "Refinance terms and eligibility reviewed",
}


def number(value, key, low=0, high=1e9):
    if isinstance(value, (bool, str)) or not isinstance(value, (float, int)) or not isfinite(value) or not low <= value <= high:
        raise ValueError(f"Invalid {key}")
    return value


def normalize(raw, definitions, rates):
    result = {}
    for key, default in definitions.items():
        value = raw.get(key, default)
        if value is None and default is None:
            result[key] = None
            continue
        minimum = 1 if key in {"term", "months", "refi_term", "drive_minutes"} else 0
        maximum = .9999 if key == "selling" else 1 if key in rates else 1200 if key in {"term", "refi_term", "months", "seasoning"} else 1e9
        result[key] = number(value, key, minimum, maximum)
        if key in {"term", "refi_term", "months", "seasoning"} and value != int(value):
            raise ValueError(f"{key} must be a whole number")
    return result


def criteria(raw):
    settings = normalize(raw, DEFAULTS, CRITERIA_RATES)
    for key in ("cash_flow", "coc", "dscr"):
        if settings[f"preferred_{key}"] < settings[f"minimum_{key}"]:
            raise ValueError(f"Preferred {key} must meet or exceed minimum")
    if settings["maintenance"] + settings["management"] + settings["capex"] >= 1:
        raise ValueError("Management, maintenance and reserves must total less than 100%")
    for model, weights in SCORE_MODELS.items():
        total = sum(settings[f"{model}_weight_{factor}"] for factor in weights)
        if abs(total - 100) > 1e-8:
            raise ValueError(f"{model.title()} score weights must total 100")
    return settings


def payment(principal, rate, term):
    monthly = rate / 12
    return principal / term if not monthly else principal * monthly / -expm1(-term * log1p(monthly))


def ratio(numerator, denominator):
    return numerator / denominator if denominator > 0 else None


def rental(inputs, settings, cost, cash, loan, rate, term, rent=None):
    rent = inputs["rent"] if rent is None else rent
    if rent is None:
        return None
    effective = rent * (1 - settings["vacancy"])
    variable = settings["management"] + settings["maintenance"]
    fixed = sum(inputs[key] for key in ("tax", "insurance", "utilities", "hoa", "other"))
    expenses = fixed + effective * variable
    noi = effective - expenses
    reserve = effective * settings["capex"]
    debt = payment(loan, rate, term)
    cash_flow = noi - reserve - debt
    balance = loan
    for _ in range(min(int(term), 12)):
        balance = max(0, balance * (1 + rate / 12) - debt)
    value = inputs["as_is"]
    return dict(gross=rent, effective=effective, expenses=expenses, noi=noi, reserve=reserve,
                debt=debt, cash_flow=cash_flow, annual=cash_flow * 12, coc=ratio(cash_flow * 12, cash),
                cap=ratio(noi * 12, cost), dscr=ratio(noi, debt), cash=cash,
                break_even=ratio(fixed + debt, rent * (1 - variable - settings["capex"])),
                equity=value - loan if value is not None else None, principal=loan - balance,
                yield_=ratio(rent * 12, cost))


def rental_stress(i, c, cost, cash, loan, rate, term):
    stresses = {
        "Rent down 10%": ({}, {}, i["rent"] * .90),
        "Higher vacancy": ({}, {"vacancy": min(1, c["vacancy"] + .05)}, i["rent"]),
        "Taxes up 20%": ({"tax": i["tax"] * 1.2}, {}, i["rent"]),
        "Insurance up 25%": ({"insurance": i["insurance"] * 1.25}, {}, i["rent"]),
        "Unexpected maintenance": ({}, {"maintenance": c["maintenance"] + .05}, i["rent"]),
        "Rate up 2 points": ({}, {}, i["rent"]),
    }
    return {label: rental(i | changes, c | adjustments, cost, cash,
        loan, rate + (.02 if label == "Rate up 2 points" else 0), term, rent)["cash_flow"]
        for label, (changes, adjustments, rent) in stresses.items()}


def analysis(raw, options=None, gates=None, confidence="unverified", demo=False):
    i = normalize(raw, {key: item[1] for key, item in INPUTS.items()}, RATES)
    c = criteria(options or {})
    gates = gates or {}
    result = {"hold": None, "flip": None, "brrrr": None, "wholesale": None}
    price, rehab, arv = i["price"], i["rehab"], i["arv"]
    if price is not None and rehab is not None:
        reserve = rehab * i["contingency"]
        cost = price + i["closing"] + rehab + reserve
        if i["loan"] <= cost:
            hold = rental(i, c, cost, cost - i["loan"], i["loan"], i["rate"], i["term"])
            if hold is not None:
                hold["stress"] = rental_stress(i, c, cost, hold["cash"], i["loan"], i["rate"], i["term"])
                result["hold"] = hold
        monthly_hold = sum(i[key] for key in ("tax", "insurance", "utilities", "hoa", "other", "holding"))
        monthly_finance = (i["flip_loan"] * i["flip_rate"] + i["heloc"] * i["heloc_rate"]) / 12
        initial = cost + i["fees"] + (monthly_hold + monthly_finance) * i["months"]
        borrowed = i["flip_loan"] + i["heloc"]
        if arv is not None and arv > 0 and borrowed <= cost:
            sale_net = arv * (1 - i["selling"]) - i["disposition"]
            profit = sale_net - initial
            cash = initial - borrowed
            cash_return = ratio(profit, cash)
            max_offer = sale_net - (initial - price) - c["target_profit"]
            result["flip"] = dict(project=initial, total_cost=initial + arv * i["selling"] + i["disposition"],
                gross=arv - price - rehab - reserve, profit=profit,
                roi=ratio(profit, initial + arv * i["selling"] + i["disposition"]), cash_return=cash_return,
                annualized=(1 + cash_return) ** (12 / i["months"]) - 1
                    if cash_return is not None and cash_return > -1 and i["months"] >= 3 and cash >= 1 else None,
                break_even=(initial + i["disposition"]) / (1 - i["selling"]),
                max_offer=max(0, max_offer), opening=max(0, max_offer * (1 - c["opening_discount"])),
                rule70=.70 * arv - rehab - reserve,
                holding={str(m): sale_net - cost - i["fees"] - (monthly_hold + monthly_finance) * m for m in (3, 6, 9, 12)},
                resale_down=profit - .10 * arv * (1 - i["selling"]), rehab_overrun=profit - .20 * (rehab + reserve))
            seasoning_cost = max(i["months"], i["seasoning"]) * (monthly_hold + monthly_finance)
            total = cost + i["fees"] + seasoning_cost
            refi = arv * i["refi_ltv"]
            recovered = refi - borrowed - i["refi_fees"]
            invested = total - borrowed
            remaining = invested - recovered
            post = rental(i | {"as_is": arv}, c, total, remaining, refi, i["refi_rate"], i["refi_term"])
            if post is not None:
                post["stress"] = rental_stress(i, c, total, remaining, refi, i["refi_rate"], i["refi_term"])
                result["brrrr"] = dict(total=total, initial_cash=invested, value=arv, proceeds=refi,
                    payoff=borrowed, fees=i["refi_fees"], recovered=recovered, remaining=remaining,
                    efficiency=ratio(recovered, invested),
                    lower_appraisal_remaining=remaining + refi * .10, **post)
    if gates.get("assignment") is True and i["assignment"] is not None:
        result["wholesale"] = {"profit": i["assignment"] - i["assignment_cost"]}
    common = [label for key, label in GATES.items() if key not in {"assignment", "refinance"} and gates.get(key) is not True]
    if confidence != "verified":
        common.append("Evidence status requires verification")
    if demo:
        common.append("Demonstration record")
    result["qualification"] = {}
    for strategy in ("hold", "brrrr", "flip", "wholesale"):
        metric = result[strategy]
        blockers = common.copy()
        if metric is None:
            blockers.append("Underwriting inputs or applicability incomplete")
        elif strategy in {"hold", "brrrr"}:
            if metric["cash_flow"] < c["minimum_cash_flow"]:
                blockers.append("Cash flow below minimum")
            if metric["debt"] and metric["dscr"] < c["minimum_dscr"]:
                blockers.append("DSCR below minimum")
            if metric["coc"] is not None and metric["coc"] < c["minimum_coc"]:
                blockers.append("Cash-on-cash return below minimum")
            if min(metric.get("stress", {"base": metric["cash_flow"]}).values()) < 0:
                blockers.append("Negative cash flow under downside conditions")
        elif metric["profit"] < (c["target_profit"] if strategy == "flip" else 0):
            blockers.append("Profit below minimum")
        if strategy == "brrrr":
            if gates.get("refinance") is not True:
                blockers.append(GATES["refinance"])
            if metric and i["refi_ltv"] > c["maximum_refinance_ltv"]:
                blockers.append("Refinance LTV exceeds the configured limit")
        result["qualification"][strategy] = blockers
    ready = [key for key, blockers in result["qualification"].items() if not blockers]
    result["recommended"] = next(iter(ready), None)
    return result
