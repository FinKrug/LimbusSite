import json
import tempfile
import unittest
from pathlib import Path

from scraper import tiers


def ident(id_, name, sinner):
    return {"id": id_, "name": f"{name} {sinner}", "sinner": sinner}


class TierTests(unittest.TestCase):
    def test_norm_matches_spelling_variants(self):
        self.assertEqual(tiers.norm("Zwei. Assoc. West Section 3 Ishmael"), tiers.norm("Zwei Association West Section 3 Ishmael"))
        self.assertEqual(tiers.norm("Blade of the House of Spiders Ryoshu"), tiers.norm("Blade of the House of Spiders Ryōshū"))
        self.assertEqual(tiers.norm("N Corp. Groẞhammer Meursault"), tiers.norm("N Corp. Großhammer Meursault"))
        self.assertEqual(tiers.norm("The Pequod Harpooner Heathcliff"), tiers.norm("The Pequod Harpooneer Heathcliff"))
        self.assertEqual(tiers.norm("Lobotomy E.G.O:: Hornet【Alteration】 Meursault"), tiers.norm("Lobotomy E.G.O::Hornet (Alteration) Meursault"))

    def test_to_tier(self):
        self.assertEqual(tiers.to_tier(10), "SSS")
        self.assertEqual(tiers.to_tier(9.0), "SS")
        self.assertEqual(tiers.to_tier(8.5), "S+")
        self.assertEqual(tiers.to_tier(7.5), "S")
        self.assertEqual(tiers.to_tier(2.5), "D")

    def test_build_averages_and_boosts_status_specialists(self):
        ids = [ident("a", "Alpha", "Faust"), ident("b", "Beta", "Yi Sang"), ident("c", "Gamma", "Gregor"), ident("d", "New", "Rodion")]
        prydwen = [
            {"tier": "SSS", "role": "Damage", "name": "Alpha", "sinner": "Faust"},
            {"tier": "A", "role": "Status", "name": "Beta", "sinner": "Yi Sang"},
        ]
        gll = [
            {"tier": "SS", "role": None, "name": "Alpha", "sinner": "Faust"},
            {"tier": "A", "role": None, "name": "Beta", "sinner": "Yi Sang"},
            {"tier": "C", "role": None, "name": "Gamma", "sinner": "Gregor"},
        ]
        out, report = tiers.build(ids, prydwen, gll)
        self.assertEqual(out["a"]["score"], 9.5)
        self.assertEqual(out["a"]["tier"], "SSS")
        self.assertEqual(out["b"]["score"], 7.5)  # A (7) + 0.5 for Status
        self.assertEqual(out["b"]["tier"], "S")
        self.assertEqual(out["c"], {"tier": "C", "score": 4.0, "gll": "C"})
        self.assertNotIn("d", out)
        self.assertIn("  unrated (on neither list): New Rodion", report)

    def test_real_lists_cover_the_roster(self):
        root = Path(tiers.__file__).resolve().parent.parent
        identities = json.loads((root / "data" / "identities.json").read_text(encoding="utf-8"))
        p = tiers.read_list(tiers.TIER_DIR / "prydwen.txt", with_role=True)
        g = tiers.read_list(tiers.TIER_DIR / "gll.txt", with_role=False)
        out, report = tiers.build(identities, p, g)
        self.assertGreaterEqual(len(out), len(identities) - 3)
        self.assertFalse([line for line in report if "no match" in line or "duplicate" in line], report)
        self.assertEqual(out["heishou-pack-mao-branch-adept-faust"]["tier"], "SSS")

    def test_main_writes_json(self):
        root = Path(tiers.__file__).resolve().parent.parent
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "t.json"
            self.assertEqual(tiers.main(["--out", str(out)]), 0)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertIn("tiers", data)
            self.assertEqual(len(data["sources"]), 2)


if __name__ == "__main__":
    unittest.main()
