import unittest

from scraper import adversities

PAGE = """==Mirror Dungeon Floors==
Some text.
===Parallel Superposition Mode (Infinity Mirror)===
====Mounting Adversities====
Mounting Adversities are a type of debuffs unique to Parallel Superposition EXTREME.

{| class="wikitable mw-collapsible mw-collapsed" style="width:100%"
|-
! colspan="3" style="color:white" align="center"|''{{Icons|MD7 Mounting Adversities|Size=30px}} Mounting Adversities''
|-
! width="15%" |'''Name'''
! width="75%" |'''Effect'''
! width="10%" |'''Adversity Score'''
|-
| colspan="3" style="color:white; text-align:center" |'''Floor 10'''
|-
|Level Boost||All Enemy Levels +3||1
|-
|Mark of Fire I||Turn End: all allies take 5 fixed HP damage. Fixed damage increases by 3 every turn. (max 20)||2
|-
| colspan="3" style="color:white; text-align:center" |'''Floor 13'''
|-
|Level Boost||All Enemy Levels +3||1
|-
|Mark of Fire II||Turn End: all allies take 10 fixed HP damage.<br>※ If a lower tier Adversity already exists, overwrite that effect||3
|-
|Psychological Elation||Turn Start: All enemies heal 20 SP<br>- If all Skills are Minus Coin Skills, lose 15 SP instead||2
|}

====Next section====
{| class="wikitable"
|Not an adversity||Nope||9
|}
"""


class ParseAdversitiesTest(unittest.TestCase):
    def setUp(self):
        self.rows, self.warnings = adversities.parse_adversities(PAGE)

    def test_rows_per_floor(self):
        self.assertEqual(self.warnings, [])
        self.assertEqual([(r["floor"], r["name"]) for r in self.rows], [
            (10, "Level Boost"), (10, "Mark of Fire I"),
            (13, "Level Boost"), (13, "Mark of Fire II"), (13, "Psychological Elation"),
        ])

    def test_tiers_and_families(self):
        mof = [r for r in self.rows if r["family_id"] == "mark-of-fire"]
        self.assertEqual([(r["id"], r["tier"], r["score"]) for r in mof], [("mark-of-fire-i", 1, 2), ("mark-of-fire-ii", 2, 3)])
        self.assertTrue(mof[1]["replaces_lower"])
        self.assertFalse(mof[0]["replaces_lower"])
        boost = self.rows[0]
        self.assertEqual((boost["id"], boost["family"], boost["tier"]), ("level-boost", "Level Boost", None))

    def test_effect_text_is_plain(self):
        mof2 = next(r for r in self.rows if r["id"] == "mark-of-fire-ii")
        self.assertEqual(mof2["effect"], "Turn End: all allies take 10 fixed HP damage.")
        elation = next(r for r in self.rows if r["id"] == "psychological-elation")
        self.assertIn("\n- If all Skills are Minus Coin Skills", elation["effect"])

    def test_other_tables_ignored(self):
        self.assertNotIn("Not an adversity", [r["name"] for r in self.rows])

    def test_missing_section_warns(self):
        rows, warnings = adversities.parse_adversities("==Nothing here==\ntext")
        self.assertEqual(rows, [])
        self.assertTrue(warnings)


if __name__ == "__main__":
    unittest.main()
