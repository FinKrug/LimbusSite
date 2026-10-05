import unittest

from scraper import skills

PAGE = """{{IDPage
|sinner=Ryōshū
|stagger1=50
<!--Skill1-->
|skill1={{UptieSkills
|slevel=1
|sin=Envy
|name=Contemptuous Thing
|type=Pierce
|spower=3
|2spower=2
|cpower=+ 4
|coin=2
|amt=3
|atkweight=1
|se={{SkillCon|On Use}} If target has {{StatusEffect|Gaze (Ryoshu)|d}}, Clash Power +1
|ce1={{SkillCon|On Hit}} Inflict +1 {{StatusEffect|Tremor|d}} Count <br> {{SkillCon|On Hit}} Inflict +1 {{StatusEffect|Bleed|d}} Count
}}
|skill2={{UptieSkills
|slevel=2
|sin=Wrath
|name=Be Awed
|type=Pierce
|spower=4
|cpower=- 6
|coin=2
|amt=2
|ce2={{StatusEffect|Unbreakable Coin|r}}
}}
|skill3={{UptieSkills
|sin=Lust
|name=Awe, Contempt
|type=Pierce
|spower=5
|cpower=+ 4
|coin=3
|amt=1
}}
|skill3-2={{UptieSkills
|sin=Lust
|name=Cascading Gaze
|spower=14
|amt=0
}}
}}"""


class SkillTests(unittest.TestCase):
    def test_three_skills_with_deck_copies(self):
        out = skills.identity_skills(PAGE)
        self.assertEqual([s["slot"] for s in out], [1, 2, 3])
        s1, s2, s3 = out
        self.assertEqual((s1["name"], s1["sin"], s1["type"], s1["base"], s1["coin_power"], s1["coins"], s1["copies"]),
                         ("Contemptuous Thing", "envy", "Pierce", 3, 4, 2, 3))
        self.assertIn("Tremor", s1["statuses"])
        self.assertIn("Bleed", s1["statuses"])
        self.assertEqual(s2["coin_power"], -6)
        self.assertEqual((s3["name"], s3["copies"]), ("Awe, Contempt", 1))

    def test_no_template(self):
        self.assertEqual(skills.identity_skills(""), [])


if __name__ == "__main__":
    unittest.main()
