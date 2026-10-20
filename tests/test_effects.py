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


class GrantedStatusTests(unittest.TestCase):
    """Passive and "gain" wording: the gift gives the status, it doesn't need it (Finley: Special Contract)."""

    def test_inflicted_with_is_given(self):
        r = analyze(f"Enemies Staggered by taking Skill damage also receive fixed damage by 33% of their Max HP, "
                    f"and are inflicted with 2 {S('Fragile')} next turn. (Once per Encounter)")
        self.assertEqual(r["needs"], [])
        self.assertEqual(r["applies"], [{"status": "Fragile", "when": "always"}])

    def test_allies_gain_poise_and_charge(self):
        r = analyze(f"First Turn Start of a wave: all allies gain 5 {S('Poise')} and +5 {S('Poise')} Count.<br><br>"
                    f"Turn End: 1 ally with the highest sum of {S('Poise')} Potency and Count gains 2 {S('Haste')}.")
        self.assertEqual(r["needs"], [])
        self.assertEqual(r["applies"], [{"status": "Poise", "when": "always"}])
        r = analyze(f"Encounter Start: all allies gain +3 {S('Charge')} Count.")
        self.assertEqual(r["applies"], [{"status": "Charge", "when": "always"}])

    def test_enemies_gain_is_inflicted_but_self_debuffs_are_not(self):
        r = analyze(f"Turn Start: All enemies that have {S('Bleed')} gain {S('Offense Level Down')} equal to Bind on themselves")
        self.assertEqual(r["needs"], ["Bleed"])
        self.assertEqual(r["applies"], [{"status": "Offense Level Down", "when": "always"}])
        r = analyze(f"Turn End: if this unit did take damage from enemy Attack Skills this turn, gain 2 {S('Bind')}")
        self.assertEqual((r["needs"], r["applies"]), ([], []))
        r = analyze(f"Gain 2 Attack Power Up and 1 {S('Fragile')} every turn")
        self.assertEqual((r["needs"], r["applies"]), ([], []))

    def test_team_conditions_with_gain_or_past_tense(self):
        r = analyze(f"Turn Start: This Gift activates for the whole Encounter when 5 or more Identities have Attack Skills "
                    f"that gain {S('Charge')} Count.")
        self.assertEqual(r["applies"], [])
        r = analyze(f"Identities that inflicted {S('Sinking')}, {S('Sinking')} Count, or 'Unique Sinking', "
                    f"gain 3 {S('Poise')} or +2 {S('Poise')} Count at Turn Start")
        self.assertEqual(r["applies"], [{"status": "Poise", "when": "keyword:Sinking"}])
