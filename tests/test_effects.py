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


class TeamConditionTests(unittest.TestCase):
    """Gifts that only work for units with that keyword's skills (Finley: Chalice of Trickle-down on a Heishou team)."""

    def test_parenthetical_skill_condition_and_instead_variant(self):
        r = analyze(f"When an ally with Attack Skills(except E.G.O Skills) that inflict {S('Tremor')} Potency, Count, or "
                    f"'Unique Tremor' wins a Clash, inflict 2 {S('Tremor')} Potency and +2 {S('Tremor')} Count. (2 times per turn)<br><br>"
                    f"Yurodivy Identities: inflict 3 {S('Tremor')} Potency and +3 {S('Tremor')} Count instead (3 times per turn)")
        self.assertEqual(r["applies"], [{"status": "Tremor", "when": "keyword:Tremor"}])

    def test_doesnt_have_is_not_a_need(self):
        r = analyze(f"When winning a Clash using a Skill that inflicts {S('Rupture')} Potency or Count, inflict +2 {S('Rupture')} Count."
                    f"<br><br>If the target doesn't have {S('Rupture')}, inflict 3 {S('Rupture')} Potency and +2 {S('Rupture')} Count instead.")
        self.assertEqual(r["needs"], [])
        self.assertEqual(r["applies"], [{"status": "Rupture", "when": "keyword:Rupture"}])

    def test_enemies_gain_with_a_parenthesis(self):
        r = analyze(f"Turn Start: All enemies (for Abnormalities, all Parts) gain 1~2 {S('Burn')} Count")
        self.assertEqual(r["applies"], [{"status": "Burn", "when": "always"}])


class MechanicConditionTests(unittest.TestCase):
    """Finley: Interlinked Time needs a unit that triggers Amplitude Conversion / Entanglement."""

    def test_when_triggering_a_mechanic(self):
        r = analyze(f"When triggering {S('Amplitude Conversion')} or {S('Amplitude Entanglement')}, trigger "
                    f"{S('Tremor Burst')} on target (once per turn per Identity)")
        self.assertEqual(r["applies"], [{"status": "Tremor Burst", "when": "status:Amplitude Conversion|Amplitude Entanglement"}])
        r = analyze(f"Inflict 1 {S('Fragile')} when triggering {S('Amplitude Conversion')} or {S('Amplitude Entanglement')} (once per turn)")
        self.assertEqual(r["applies"], [{"status": "Fragile", "when": "status:Amplitude Conversion|Amplitude Entanglement"}])

    def test_ally_carrying_a_status_and_conversions(self):
        r = analyze(f"At Turn Start, for 1 Identity with the most {S('Tremor')} Count, trigger {S('Amplitude Entanglement')} "
                    f"to convert their {S('Tremor')} to {S('Tremor - Distribution')}")
        self.assertEqual((r["needs"], r["applies"]), ([], []))
        r = analyze(f"Turn Start: allies with {S('Poise')} gain 1 Power Up.")
        self.assertEqual(r["needs"], ["Poise"])  # gifts can give allies Poise, so this one stays


class AttackTypeTests(unittest.TestCase):
    """Finley: Pocket Flashcards does nothing for a Heishou team (Blunt skills, Dieci riders)."""

    def test_base_attack_skill_and_affiliation_riders(self):
        r = analyze(f"When winning a Clash with a Blunt Base Attack Skill, inflict 2 {S('Defense Level Down')} next turn against the target.<br>"
                    f"- For Dieci Association Identities: above effect applies to Slash and Pierce Base Attack Skills as well; inflict 1 additional {S('Defense Level Down')}")
        self.assertEqual(r["attack_types"], ["Blunt"])
        self.assertEqual(r["applies"], [{"status": "Defense Level Down", "when": "attack:Blunt"}])


class ActivationConditionTests(unittest.TestCase):
    """Finley: Respite only activates when a skill that inflicts Bleed is used."""

    def test_activation_line_covers_the_whole_gift(self):
        r = analyze(f"Activates upon Clash Win using a Skill that inflicts {S('Bleed')} Potency, Count, or 'Unique Bleed'<br><br>"
                    f"Inflict +(# of remaining Coins/2) {S('Bleed')} Count to the target, and gain "
                    f"{S('Offense Level Up')} equal to that value next turn")
        self.assertEqual(r["applies"], [{"status": "Bleed", "when": "keyword:Bleed"}])
        # Without the activation line, the same inflict line works for anyone.
        r = analyze(f"Inflict +(# of remaining Coins/2) {S('Bleed')} Count to the target")
        self.assertEqual(r["applies"], [{"status": "Bleed", "when": "always"}])
