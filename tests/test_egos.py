import unittest

from scraper import build, egos


CATS = ["E.G.O", "Yi Sang E.G.O", "ZAYIN Level E.G.O", "Sloth E.G.O",
        "E.G.O with Attack Power Down", "E.G.O with Bind", "E.G.O with Haste"]

# Shape guessed from the identity pages ({{IDPage}} / {{UptieSkills}}); the parser
# is deliberately loose so a slightly different template still works.
SOURCE = """{{EGOPage
|sinner=Yi Sang
|rank=ZAYIN
|sin=Sloth
|wrathcost=1
|slothcost=3
|wrathres=Endured
|sanity=10
|awakening={{EGOSkills
|sin=Sloth
|name=Crow's Eye View
|type=Pierce
|spower=18
|cpower=+ 6
|coin=1
|atkweight=1
|ce1={{SkillCon|On Hit}} Inflict 2 {{StatusEffect|Bind|d}} next turn
}}
}}"""


class EgoTests(unittest.TestCase):
    def test_categories(self):
        e = egos.parse_ego("Crow's Eye View Yi Sang", CATS, build.SINNERS, build.fold)
        self.assertEqual((e["name"], e["sinner"], e["grade"], e["sin"]), ("Crow's Eye View", "Yi Sang", "ZAYIN", "sloth"))
        self.assertIn("Bind", e["statuses"])
        self.assertIsNone(egos.parse_ego("E.G.O", ["E.G.O"], build.SINNERS, build.fold))

    def test_ryoshu(self):
        e = egos.parse_ego("Forest for the Flames Ryōshū", ["Ryōshū E.G.O", "ZAYIN Level E.G.O", "Wrath E.G.O"],
                           build.SINNERS, build.fold)
        self.assertEqual((e["sinner"], e["name"]), ("Ryōshū", "Forest for the Flames"))

    def test_details(self):
        d = egos.ego_details(SOURCE)
        self.assertEqual(d["cost"], {"wrath": 1, "sloth": 3})
        self.assertEqual(d["sanity"], 10)
        self.assertEqual((d["skill"]["base"], d["skill"]["coin_power"], d["skill"]["coins"]), (18, 6, 1))
        self.assertIn("Bind", d["skill"]["statuses"])

    def test_cost_as_text(self):
        d = egos.ego_details("{{EGOPage|cost={{Icons|Wrath}} x1 {{Icons|Sloth}} x3|sanity cost=15}}")
        self.assertEqual(d["cost"], {"wrath": 1, "sloth": 3})
        self.assertEqual(d["sanity"], 15)

    def test_missing(self):
        self.assertEqual(egos.ego_details(""), {"cost": None, "sanity": None, "skill": None, "base": False})

    def test_real_template(self):
        # {{EGPage}} as on the wiki (Branch of Knowledge Sinclair), comments between groups.
        src = ("{{EGPage\n|baseego=1\n|sinner=Sinclair\n|risk=ZAYIN\n<!--Cost-->\n|asanity=10\n|wrathcost=1\n"
               "|lustcost=\n|gluttonycost=3\n|envycost=2\n<!--Resistances-->\n|wrathres=Fatal\n"
               "<!--Awakening Skill-->\n|askill={{Skill\n|sin=Gluttony\n|spower=14\n|cpower=+ 15\n|coin=1\n}}\n}}")
        d = egos.ego_details(src)
        self.assertEqual(d["cost"], {"wrath": 1, "gluttony": 3, "envy": 2})
        self.assertEqual(d["sanity"], 10)
        self.assertTrue(d["base"])
        self.assertEqual(d["skill"]["base"], 14)

    def test_build(self):
        out, warnings = egos.build_egos(
            {"Crow's Eye View Yi Sang": CATS, "Not An EGO": ["E.G.O"]},
            {"Crow's Eye View Yi Sang": {"content": SOURCE}},
            build.SINNERS, build.fold, build.slugify, build.wiki_url)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["id"], "crow-s-eye-view-yi-sang")
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
