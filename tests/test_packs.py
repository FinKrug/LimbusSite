import unittest
from pathlib import Path

from scraper import build, packs

FIX = Path(__file__).parent / "fixtures"
FINDER = packs.NameFinder({
    "Hellterfly's Dream": "hellterfly-s-dream",
    "Frozen Cries": "frozen-cries",
    "Haunted Shoes": "haunted-shoes",
    "Ebony Brooch": "ebony-brooch-md",
    "Chains of Bond": "chains-of-bond",
    "WB Flask": "wb-flask-md",
})


class PackPageTests(unittest.TestCase):
    def test_new_heading_markup(self):
        page = packs.parse_pack_page("The Outcast Theme Pack",
                                     (FIX / "pack_page_new.html").read_text(encoding="utf-8"), FINDER)
        self.assertEqual(page.floors, {"normal": [1, 2], "hard": [1, 1], "extreme": None})
        self.assertEqual(page.unique, ["ebony-brooch-md"])
        # Only the icons themselves count: gifts named or shown inside a tooltip
        # (Haunted Shoes, Chains of Bond) and the Navigation box are ignored.
        self.assertEqual(page.featured, ["hellterfly-s-dream", "frozen-cries", "wb-flask-md"])  # Coin: not in FINDER
        self.assertEqual(page.gift_pool, ["hellterfly-s-dream", "frozen-cries", "wb-flask-md", "ebony-brooch-md"])
        self.assertEqual(page.unresolved, ["Coin", "Mystery Story"])
        self.assertEqual(page.warnings, [])

    def test_old_heading_markup_and_missing_floor(self):
        page = packs.parse_pack_page("X Theme Pack",
                                     (FIX / "pack_page_old.html").read_text(encoding="utf-8"), FINDER)
        self.assertEqual(page.floors, {"normal": None, "hard": [4, 10], "extreme": None})
        self.assertEqual(page.gift_pool, ["haunted-shoes"])

    def test_missing_sections_warn(self):
        page = packs.parse_pack_page("Y Theme Pack", "<p>nothing</p>", FINDER)
        self.assertEqual(page.gift_pool, [])
        self.assertEqual(len(page.warnings), 2)

    def test_floor_theme_list(self):
        listed = packs.parse_floor_theme_list((FIX / "floor_themes.html").read_text(encoding="utf-8"))
        self.assertEqual(listed, [
            ("The Outcast Theme Pack", "Canto Themes"),
            ("Automated factory Theme Pack", "Canto Themes"),
            ("Season of the Flame Theme Pack", "Status Keyword Themes"),
        ])
        self.assertEqual(packs.pack_name("The Outcast Theme Pack"), "The Outcast")

    def test_parse_floor_cells(self):
        self.assertEqual(packs.parse_floor_cell("3F"), [3, 3])
        self.assertEqual(packs.parse_floor_cell("2F - 3F"), [2, 3])
        self.assertEqual(packs.parse_floor_cell("5F–10F"), [5, 10])
        self.assertEqual(packs.parse_floor_cell("1F, 3F"), [1, 3])
        self.assertIsNone(packs.parse_floor_cell("—"))
        self.assertIsNone(packs.parse_floors("<p>no infobox</p>"))
        self.assertEqual(packs.parse_floors('<td class="pi-data-value" data-source="extreme"><code>11F-15F</code></td>'),
                         {"normal": None, "hard": None, "extreme": [11, 15]})


class TraitTests(unittest.TestCase):
    TRAITS = ["Heishou Pack", "Heishou Pack - Mao Branch", "Heishou Pack - Wu Branch", "The Thumb", "W Corp."]

    def test_specific_branch_beats_parent(self):
        text = "When a Heishou Pack - Mao Branch Identity enters the Encounter for the first time"
        self.assertEqual(build.find_trait_mentions(text, self.TRAITS), ["Heishou Pack - Mao Branch"])

    def test_short_alias_and_quotes(self):
        self.assertEqual(build.find_trait_mentions("prioritizes Heishou - Wu Identities", self.TRAITS),
                         ["Heishou Pack - Wu Branch"])
        self.assertEqual(build.find_trait_mentions('when there are 3 or more "The Thumb" Identities', self.TRAITS),
                         ["The Thumb"])

    def test_needs_identity_context(self):
        self.assertEqual(build.find_trait_mentions("A lighter once owned by The Thumb.", self.TRAITS), [])

    def test_identity_traits(self):
        ident = build.parse_identity("Heishou Pack - Mao Branch Outis", [
            "Outis Identities", "3-Star Identities", "Gloom Affinity", "Heishou Pack - Mao Branch Identities",
            "Heishou Pack Identities", "Event Reward Identities and E.G.O", "Identities with Strider -Mao-",
        ])
        self.assertEqual(ident["traits"], ["Heishou Pack - Mao Branch", "Heishou Pack"])
        self.assertIn("Strider -Mao-", ident["status_effects"])


if __name__ == "__main__":
    unittest.main()
