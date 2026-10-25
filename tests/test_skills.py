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
<!--Defense Skill-->
|defense={{UptieSkills
|slevel=1
|sin=Gluttony
|name=Strider. Unleashed. Heh
|type=Slash
|spower=5
|cpower=+ 8
|coin=1
|se={{SkillCon|Clashable Counter}} <br> {{SkillCon|On Use}} Gain 3 {{StatusEffect|Strider -Mao-|b}}
|ce1={{SkillCon|On Hit}} Inflict +1 {{StatusEffect|Rupture|d}} Count
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

    def test_conditional_atk_weight_bonus(self):
        src = """{{IDPage
|skill2={{UptieSkills
|slevel=2
|sin=Envy
|name=Sunset Blade
|spower=5
|cpower=+ 3
|coin=3
|atkweight=1
|amt=2
|se={{SkillCon|Before Attack}} When in a volatile E.G.O state, Atk Weight +1<br>- At 45 SP, Atk Weight +2 instead
|1se={{SkillCon|Before Attack}} When in a volatile E.G.O state, Atk Weight +1
}}
}}"""
        (s2,) = skills.identity_skills(src)
        self.assertEqual((s2["weight"], s2["weight_bonus"]), (1, 2))
        self.assertEqual(skills.identity_skills(PAGE)[0]["weight_bonus"], 0)

    def test_no_template(self):
        self.assertEqual(skills.identity_skills(""), [])


if __name__ == "__main__":
    unittest.main()


class DefenseTests(unittest.TestCase):
    def test_counter(self):
        d = skills.identity_defense(PAGE)
        self.assertEqual(d["sin"], "gluttony")
        self.assertEqual(d["kind"], "counter")
        self.assertEqual((d["base"], d["coin_power"], d["coins"]), (5, 8, 1))
        self.assertIn("Rupture", d["statuses"])
        # The defense skill isn't one of the deck's skills.
        self.assertEqual([x["slot"] for x in skills.identity_skills(PAGE)], [1, 2, 3])

    def test_guard_evade_and_missing(self):
        guard = "|defense={{UptieSkills\n|sin=Lust\n|name=Hold\n|type=Guard\n|spower=10\n|cpower=+ 5\n|coin=1\n}}"
        self.assertEqual(skills.identity_defense(guard)["kind"], "guard")
        self.assertEqual(skills.identity_defense(guard.replace("Guard", "evade"))["kind"], "evade")
        self.assertEqual(skills.identity_defense(guard.replace("Guard", "Defense"))["kind"], "guard")
        self.assertIsNone(skills.identity_defense("{{IDPage}}"))


class StatusTargetTests(unittest.TestCase):
    """Who a skill's statuses land on (Finley: Spicebush Yi Sang only gains Tremor himself)."""

    def test_inflicted_vs_self(self):
        enemy, own = skills.status_targets(
            "{{SkillCon|On Hit}} Inflict 2 {{StatusEffect|Sinking|d}} <br> "
            "{{SkillCon|On Use}} Gain +3 {{StatusEffect|Tremor|d}} Count")
        self.assertEqual(enemy, ["Sinking"])
        self.assertEqual(own, ["Tremor"])

    def test_on_self_and_this_unit(self):
        enemy, own = skills.status_targets(
            "Consume 6 {{StatusEffect|Tremor|d}} Count on self. "
            "If this unit has 10+ {{StatusEffect|Haste|d}}, Clash Power +1")
        self.assertEqual(enemy, [])
        self.assertEqual(own, ["Tremor", "Haste"])

    def test_trigger_and_target_mentions(self):
        enemy, own = skills.status_targets(
            "{{SkillCon|On Hit}} Trigger {{StatusEffect|Tremor Burst|d}} <br> "
            "Deal +5% damage for every 4 {{StatusEffect|Burn|d}} on the main target")
        self.assertEqual(enemy, ["Tremor Burst", "Burn"])
        self.assertEqual(own, [])

    def test_skills_carry_targets(self):
        s1 = skills.identity_skills(PAGE)[0]
        self.assertEqual(s1["enemy"], ["Gaze (Ryoshu)", "Tremor", "Bleed"])
        self.assertEqual(s1["self"], [])
