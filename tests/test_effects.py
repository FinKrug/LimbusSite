import unittest

from scraper.effects import analyze

S = lambda name: "{{StatusEffect|" + name + "|d}}"  # noqa: E731


class EffectTests(unittest.TestCase):
    def test_self_applying_gift(self):
        r = analyze(f"Turn Start: Inflict (Current Turn Count x 2) {S('Tremor')} Potency and +2 {S('Tremor')} Count "
                    f"on all enemies.<br><br>Turn End: Trigger {S('Tremor Burst')} on all enemies.")
        self.assertEqual(r["needs"], [])
        self.assertEqual(r["applies"], [{"status": "Tremor", "when": "always"}, {"status": "Tremor Burst", "when": "always"}])

    def test_payoff_needs_status(self):
        r = analyze(f"Inflict 1 {S('Fragile')} this turn to enemies affected by {S('Tremor Burst')}. "
                    f"(Activates once per Attack Skill that triggers {S('Tremor Burst')})")
        self.assertEqual(r["needs"], ["Tremor Burst"])
        self.assertEqual(r["applies"], [{"status": "Fragile", "when": "always"}])
        r = analyze(f"When clashing against targets with {S('Rupture')}, gain Clash Power")
        self.assertEqual(r["needs"], ["Rupture"])

    def test_attack_type_grants_status(self):
        r = analyze(f"Blunt Skills deal +10% damage<br><br>Final Coin of Blunt Skills inflict 2 {S('Tremor')} Potency On Hit.")
        self.assertEqual(r["attack_types"], ["Blunt"])
        self.assertEqual(r["applies"], [{"status": "Tremor", "when": "attack:Blunt"}])

    def test_team_conditions_are_not_supply(self):
        r = analyze(f"When hitting an enemy with a Skill that inflicts {S('Bleed')} Potency, inflict 4 {S('Bleed')} Potency.")
        self.assertEqual(r["applies"], [{"status": "Bleed", "when": "keyword:Bleed"}])
        r = analyze(f"Whenever an ally inflicts {S('Sinking')} Potency on enemies, the ally gains 1 'Offense Level'.")
        self.assertEqual(r["applies"], [])
        r = analyze(f"Turn Start: This Gift activates for the whole Encounter when 5 or more Identities have "
                    f"Attack Skills that apply {S('Bleed')}.<br><br>On ally Clash Win: inflict 2 {S('Bleed')}")
        self.assertTrue(r["team_gate"])
        self.assertFalse(analyze(f"Turn Start: inflict 3 {S('Rupture')}")["team_gate"])

    def test_sins(self):
        r = analyze("Deal +10% damage with Envy, Wrath, and Gloom affinity Skills")
        self.assertEqual(sorted(r["sins"]), ["Envy", "Gloom", "Wrath"])
        r = analyze(f"inflict 3 {S('Sinking')} Potency.<br><br>If the Skill's Affinity was Gluttony, inflict 5 {S('Sinking')} Potency instead.")
        self.assertIn({"status": "Sinking", "when": "sin:Gluttony"}, r["applies"])


if __name__ == "__main__":
    unittest.main()
