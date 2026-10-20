import unittest

from scraper import build, events

PAGE = """{{AbnoInfo
| title=Drunkard
| egogift=Blood, Sweat, and Tears
| egogift2=Wobbling Keg
}}
==Mirror Dungeon Event==
{{AbEvent
|eventname=Mirror Dungeon Event
|story=You there! You like booze?
<!--Choice 1-->
|choice1={{Choice|id=1
|choice=I do.
|story={{SkillCheck|id=1
|sin1=Sloth|sin2=Gluttony
|adv=11|disadv=22
|specidentity1=[[:Category:Limbus Company Identities|Limbus Company Identities]]|specmod1=+12
|passresult=The Selected Identity healed for {{StatCon|allheal|20}}.<br>Cost 100 gained
|failresult=The Selected Identity took {{StatCon|alllose|25}} damage!
}}}}
|choice2={{Choice|id=2
|choice=I don't.
|result=E.G.O Gift {{StatCon|giftsloth|Blood, Sweat, and Tears}} obtained!
}}
|choice3={{Choice|id=3
|prev=2|nestlevel=1
|choice=Ask for more.
|result={{StatCon|combat}}<br>{{EnBox|1}}<br>Win the battle to gain E.G.O Gift "{{StatCon|giftpride|Wobbling Keg}}"
}}
}}

The following event is only available within the Example Theme Pack.
{{AbEvent
|eventname=Other Event
|choice1={{Choice|id=4
|choice=Leave.
|result=Nothing happened.
}}
}}
"""

GIFTS = [{"id": "blood-sweat-and-tears", "name": "Blood, Sweat, and Tears"}, {"id": "wobbling-keg", "name": "Wobbling Keg"}]


class EventTests(unittest.TestCase):
    def setUp(self):
        evs, self.warnings = events.build_events(
            {"Drunkard": {"content": PAGE}}, GIFTS, build.fold, build.slugify, build.wiki_url)
        self.ev = evs[0]

    def test_choices_checks_and_results(self):
        main = self.ev["variants"][0]
        self.assertEqual([c["label"] for c in main["choices"]], ["I do.", "I don't."])
        do = main["choices"][0]
        self.assertEqual(do["check"]["sins"], ["sloth", "gluttony"])
        self.assertEqual((do["check"]["adv"], do["check"]["disadv"]), (11, 22))
        self.assertEqual(do["check"]["bonuses"], [{"who": "Limbus Company Identities", "mod": 12}])
        self.assertEqual(do["pass"]["cost"], 100)
        self.assertTrue(do["fail"]["hurts"])
        self.assertEqual(main["choices"][1]["result"]["gifts"], ["blood-sweat-and-tears"])

    def test_follow_ups_nest_under_prev(self):
        dont = self.ev["variants"][0]["choices"][1]
        self.assertEqual(dont["next"][0]["label"], "Ask for more.")
        fight = dont["next"][0]["result"]
        self.assertTrue(fight["combat"])
        self.assertEqual(fight["gifts"], ["wobbling-keg"])

    def test_variants_keep_their_note(self):
        other = self.ev["variants"][1]
        self.assertIn("Example Theme Pack", other["note"])
        self.assertTrue(other["choices"][0]["result"]["nothing"])
        self.assertEqual(self.ev["gifts"], ["blood-sweat-and-tears", "wobbling-keg"])


NESTED = """{{AbEvent
|eventname=Mirror Dungeon Event
|choice1={{Choice|id=2-1
|choice=Approach the bed.
|story={{SkillCheck|id=2-1
|sin1=Sloth|sin2=Gluttony
|adv=12|disadv=24
|passtext={{SkillCheck|id=2-1
|passprob=50
|passtext=Nothing lives under the bed.
|passresult=E.G.O Gift {{StatCon|giftsloth|Snuffed Lantern}} obtained!
|failtext=Nothing lives under the bed.
|failresult=E.G.O Gift {{StatCon|giftgloom|Snuffed Candlestick}} obtained!}}
|failtext={{SkillCheck|id=2
|condition=Cumulative Checks Failed < 3
|passtext=Ouch.
|passresult=The Sinner who failed the check takes {{StatCon|splose|12}} damage!<br>''(Return to previous choice)''
|failtext=Run.
|failresult={{StatCon|combat}}<br>Win the battle to gain E.G.O Gift "{{StatCon|giftgloom|Snuffed Candlestick}}"
}}}}}}
}}
"""


class NestedCheckTests(unittest.TestCase):
    """Finley: Cozy Bed's pass is a second roll: win it for Snuffed Lantern, lose it for Snuffed Candlestick."""

    def setUp(self):
        gifts = [{"id": "snuffed-lantern", "name": "Snuffed Lantern"}, {"id": "snuffed-candlestick", "name": "Snuffed Candlestick"}]
        evs, _ = events.build_events({"Cozy Bed": {"content": NESTED}}, gifts, build.fold, build.slugify, build.wiki_url)
        self.c = evs[0]["variants"][0]["choices"][0]

    def test_coin_flip_after_a_pass(self):
        t = self.c["pass"]["then"]
        self.assertEqual((t["chance"], t["check"], t["retry"]), (0.5, None, False))
        self.assertEqual(t["pass"]["gifts"], ["snuffed-lantern"])
        self.assertEqual(t["fail"]["gifts"], ["snuffed-candlestick"])

    def test_retry_after_a_fail(self):
        t = self.c["fail"]["then"]
        self.assertTrue(t["retry"])
        self.assertEqual(t["condition"], "Cumulative Checks Failed < 3")
        self.assertIn("Return to previous choice", t["pass"]["text"])
        self.assertTrue(t["fail"]["combat"])


if __name__ == "__main__":
    unittest.main()
