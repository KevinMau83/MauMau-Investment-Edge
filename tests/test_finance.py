import unittest

from finance import GATES, analysis, criteria, payment


class FinanceTests(unittest.TestCase):
    def setUp(self):
        self.inputs = {
            "price": 100000, "rehab": 10000, "contingency": .10, "closing": 2000,
            "arv": 175000, "as_is": 125000, "rent": 1800, "tax": 100, "insurance": 80,
            "loan": 80000, "rate": .06, "term": 360, "flip_loan": 70000,
            "flip_rate": .12, "heloc": 10000, "heloc_rate": .06, "fees": 1000,
            "months": 6, "holding": 120, "selling": .06, "disposition": 1000,
            "refi_ltv": .70, "refi_fees": 2500, "seasoning": 9,
        }

    def test_payment_at_zero_and_positive_rates(self):
        self.assertEqual(payment(12000, 0, 12), 1000)
        self.assertAlmostEqual(payment(80000, .06, 360), 479.6404201, places=5)
        self.assertAlmostEqual(payment(12000, 1e-14, 12), 1000, places=8)

    def test_flip_no_principal_double_count(self):
        flip = analysis(self.inputs)["flip"]
        self.assertEqual(flip["project"], 120300)
        self.assertEqual(flip["total_cost"], 131800)
        self.assertEqual(flip["gross"], 64000)
        self.assertEqual(flip["profit"], 43200)
        self.assertAlmostEqual(flip["roi"], 43200 / 131800)
        self.assertAlmostEqual(flip["cash_return"], 43200 / 40300)
        self.assertAlmostEqual(flip["annualized"], (1 + 43200 / 40300)**2 - 1)
        self.assertAlmostEqual(flip["break_even"], 121300 / .94)
        self.assertAlmostEqual(flip["max_offer"], 118200)
        self.assertAlmostEqual(flip["opening"], 112290)
        self.assertAlmostEqual(flip["rule70"], 111500)
        self.assertEqual(flip["holding"], {"3": 46350, "6": 43200, "9": 40050, "12": 36900})
        self.assertAlmostEqual(flip["resale_down"], 26750)
        self.assertEqual(flip["rehab_overrun"], 41000)

    def test_rental_operating_reserves_and_debt(self):
        hold = analysis(self.inputs)["hold"]
        self.assertAlmostEqual(hold["effective"], 1710)
        self.assertAlmostEqual(hold["expenses"], 402.30)
        self.assertAlmostEqual(hold["noi"], 1307.70)
        self.assertAlmostEqual(hold["reserve"], 85.50)
        self.assertAlmostEqual(hold["cash_flow"], 742.5595799, places=5)
        self.assertAlmostEqual(hold["annual"], hold["cash_flow"] * 12)
        self.assertAlmostEqual(hold["cap"], 1307.70 * 12 / 113000)
        self.assertAlmostEqual(hold["coc"], hold["annual"] / 33000)
        self.assertAlmostEqual(hold["dscr"], 1307.70 / hold["debt"])
        self.assertAlmostEqual(hold["break_even"], (180 + hold["debt"]) / (1800 * .82))
        self.assertAlmostEqual(hold["yield_"], 21600 / 113000)
        self.assertEqual(hold["equity"], 45000)
        self.assertAlmostEqual(hold["principal"], 982.4093698, places=5)
        self.assertEqual(len(hold["stress"]), 6)
        self.assertTrue(all(value < hold["cash_flow"] for value in hold["stress"].values()))

    def test_brrrr_seasoning_payoff_and_appraisal(self):
        brrrr = analysis(self.inputs)["brrrr"]
        expected = {"total": 123450, "initial_cash": 43450, "proceeds": 122500,
                    "payoff": 80000, "fees": 2500, "recovered": 40000, "remaining": 3450,
                    "equity": 52500, "lower_appraisal_remaining": 15700}
        for key, value in expected.items():
            self.assertAlmostEqual(brrrr[key], value)
        self.assertAlmostEqual(brrrr["efficiency"], 40000 / 43450)
        self.assertAlmostEqual(brrrr["debt"], payment(122500, .075, 360))
        self.assertAlmostEqual(brrrr["dscr"], brrrr["noi"] / brrrr["debt"])
        self.assertEqual(len(brrrr["stress"]), 6)

    def test_strategy_independence_and_zero_values(self):
        self.assertIsNone(analysis({})["hold"])
        hold = analysis({"price": 0, "rehab": 0, "rent": 0})["hold"]
        self.assertEqual(hold["cash_flow"], 0)
        for key in ("coc", "dscr", "cap", "break_even"):
            self.assertIsNone(hold[key])
        self.assertIsNotNone(analysis(self.inputs | {"rent": None, "loan": 900000})["flip"])
        self.assertIsNotNone(analysis(self.inputs | {"arv": None, "heloc": 900000})["hold"])
        self.assertIsNone(analysis(self.inputs | {"heloc": 900000})["flip"])
        self.assertIsNone(analysis({"assignment": 5000})["wholesale"])
        self.assertEqual(analysis({"assignment": 5000, "assignment_cost": 1000},
                         gates={"assignment": True})["wholesale"]["profit"], 4000)

    def test_qualification_and_adverse_cases(self):
        clear = dict.fromkeys(GATES, True)
        result = analysis(self.inputs, gates=clear, confidence="verified")
        self.assertEqual(result["recommended"], "hold")
        self.assertIn("Availability verified", analysis(self.inputs, gates=clear | {"availability": False})["qualification"]["hold"])
        self.assertIsNone(analysis(self.inputs, gates=clear, confidence="verified", demo=True)["recommended"])
        adverse = analysis(self.inputs | {"rent": 450, "refi_ltv": .95}, gates=clear)
        self.assertIn("Cash flow below minimum", adverse["qualification"]["hold"])
        self.assertIn("DSCR below minimum", adverse["qualification"]["hold"])
        self.assertIn("Refinance LTV exceeds the configured limit", adverse["qualification"]["brrrr"])
        self.assertIn("Cash flow below minimum", analysis(self.inputs, {"minimum_cash_flow": 900, "preferred_cash_flow": 1000})["qualification"]["hold"])

    def test_invalid_inputs(self):
        for key, value in [("rent", -1), ("price", True), ("loan", "12"), ("term", 0),
                           ("term", 9.5), ("rate", float("nan")), ("arv", float("inf")),
                           ("selling", 1), ("refi_ltv", 1.1)]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                analysis({key:value})
        for invalid in [{"vacancy": 1.1}, {"minimum_dscr": 2}, {"capex": .99}, {"drive_minutes": 0}]:
            with self.assertRaises(ValueError):
                criteria(invalid)


if __name__ == "__main__":
    unittest.main()
