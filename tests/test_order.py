import unittest

from scraper import order

LORD = """{{IDPage
|skill3={{UptieSkills
|name=Heishou Keenclaw ['''黑獸利爪''']
|se=[Clashable Counter] <br> {{SkillCon|Combat Start}} If there are Backup Units, select 1 ally Heishou that has the least HP percentage.
}}
|passive={{Passive|The Heishou Lord|When other ally units Substitute in or Return to the battlefield, they heal 10 SP; then, at Combat Start, command them to use Skill 1 as an Unopposed Attack against a random enemy <br> - If the said ally is a [[:Category:Heishou Pack Identities|Heishou Pack]] or a [[:Category:Jia Family Identities|Jia Family]] unit, activate the following instead: heal 20 SP}}
"""

SINCLAIR = """{{IDPage
|passive={{Passive|Gamefowl|Cannot be Staggered or fall below 1 HP due to Burn damage. <br><br> Gain 3 {{StatusEffect|Bloodflame -血炎-|d}} in the same turn it Substitutes or Returns in}}
|passive2={{Passive|Bloodflame Blade|sin=Wrath|req=3|sin2=Gluttony|req2=3 Owned|When an ally with the fastest Speed inflicts Burn}}
"""

OTHERS = """{{IDPage
|skill1={{UptieSkills
|name=Charge Up
|se={{SkillCon|On Use}} apply +2 Charge Count next turn on allies with earlier Deployment order than this unit
|3se={{SkillCon|On Use}} this lower uptie line should be ignored: earliest Deployment order
}}
|passive={{Passive|Salsu|sin=Wrath|req=3|When the ally with the earliest Deployment order hits Critically using a Slash Skill, inflict 1 Defense Level Down}}
|passive2={{Passive|Healers|#1 and #2 Deployed allies heal +20% more HP}}
|passive3={{Passive|Spiders|Targets 1 The House of Spiders ally with the lattermost Deployment order}}
"""


class OrderNotesTests(unittest.TestCase):
    def test_substitute_self_vs_allies(self):
        s = order.order_notes(SINCLAIR)
        self.assertEqual([(n["kind"], n["source"]) for n in s], [("sub_self", "Gamefowl")])
        self.assertIn("Substitutes or Returns in", s[0]["text"])
        self.assertIn("Bloodflame -血炎-", s[0]["text"])
        lord = order.order_notes(LORD)
        self.assertEqual([n["kind"] for n in lord], ["sub_ally"])
        self.assertEqual(lord[0]["source"], "The Heishou Lord")

    def test_position_kinds(self):
        notes = order.order_notes(OTHERS)
        kinds = {n["source"]: (n["kind"], n.get("n", 1)) for n in notes}
        self.assertEqual(kinds["Charge Up"], ("before_self", 1))
        self.assertEqual(kinds["Salsu"], ("first", 1))
        self.assertEqual(kinds["Healers"], ("first", 2))
        self.assertEqual(kinds["Spiders"], ("last", 1))
        self.assertFalse(any("lower uptie" in n["text"] for n in notes))  # only max-uptie text

    def test_passive_params_in_any_order(self):
        src = "{{IDPage\n|passive={{Passive|sin=Sloth|req=3|sin3=Gloom|req3=1 Owned|As the Prescript Orders…|Effects apply to the Identity with the earliest Deployment order}}\n"
        notes = order.order_notes(src)
        self.assertEqual(notes, [{"kind": "first", "text": "Effects apply to the Identity with the earliest Deployment order", "source": "As the Prescript Orders…"}])

    def test_one_note_per_passive_and_kind(self):
        src = ("{{IDPage\n|passive={{Passive|Command|When the ally that was deployed last wins a Clash, gain 1 Haste}}\n"
               "|passive2={{Passive|Command|When the ally that was deployed last wins a Clash, gain +1 Poise Count}}\n")
        notes = order.order_notes(src)
        self.assertEqual(len(notes), 1)
        self.assertIn("Haste", notes[0]["text"])

    def test_nothing_positional(self):
        self.assertEqual(order.order_notes("{{IDPage\n|passive={{Passive|Plain|Gain 3 Poise}}\n"), [])


if __name__ == "__main__":
    unittest.main()
