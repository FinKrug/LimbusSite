import unittest
from pathlib import Path

from scraper import build, wikitext
from scraper.lua_table import parse_module

FIX = Path(__file__).parent / "fixtures"


def load():
    src = (FIX / "EgoGift_data.lua").read_text(encoding="utf-8")
    data = parse_module(src)
    lst = parse_module((FIX / "EgoGiftList_data.lua").read_text(encoding="utf-8"))
    return build.build_gifts(data, lst, build.section_comments(src))


class WikitextTests(unittest.TestCase):
    def test_to_plain(self):
        self.assertEqual(
            wikitext.to_plain("Gain {{StatusEffect|Burn|d}}<br><br>[[A|B]] '''x''' &amp; [[C]]"),
            "Gain Burn\n\nB x & C",
        )

    def test_status_effects(self):
        self.assertEqual(
            wikitext.status_effects("{{StatusEffect|Burn|d}} {{StatusEffect|Bleed}} {{StatusEffect| Burn }}"),
            ["Burn", "Bleed"],
        )

    def test_split_ingredients_with_commas_in_names(self):
        known = ["Blood, Sweat, and Tears", "Green Spirit", "Lithograph"]
        self.assertEqual(
            wikitext.split_ingredients("Green Spirit, Blood, Sweat, and Tears, and Lithograph", known),
            ["Green Spirit", "Blood, Sweat, and Tears", "Lithograph"],
        )
        self.assertEqual(wikitext.split_ingredients("A, and B", []), ["A", "B"])
        # the wiki sometimes writes a comma where the gift name has a period
        self.assertEqual(
            wikitext.split_ingredients("Enh, Tattoos - The Middle, and X", ["Enh. Tattoos - The Middle"]),
            ["Enh. Tattoos - The Middle", "X"],
        )
        self.assertEqual(wikitext.split_ingredients("A and B", []), ["A", "B"])


class BuildTests(unittest.TestCase):
    def test_levels_grouped(self):
        gifts, *_ = load()
        by_id = {g["id"]: g for g in gifts}
        h = by_id["hellterfly-s-dream"]
        self.assertEqual([l["level"] for l in h["levels"]], [0, 1, 2])
        self.assertEqual(h["max_level"], 2)
        self.assertEqual(h["tier"], 2)
        self.assertEqual(h["keyword"], "Burn")
        self.assertEqual(h["status_effects"], ["Burn"])
        self.assertEqual(h["section"], "MD1 / Mirror of the Beginning")
        self.assertEqual(h["events"], [{"name": "Ardor Blossom Moth", "page": "Ardor Blossom Moth"}])
        self.assertEqual(h["pools"], ["main"])

    def test_theme_packs_and_md_suffix(self):
        gifts, packs, *_ = load()
        by_name = {p["name"]: p for p in packs}
        self.assertEqual(by_name["The Outcast"]["gifts"], ["ebony-brooch-md"])
        self.assertEqual(by_name["Automated Factory"]["gifts"], ["haunted-shoes"])
        self.assertEqual(by_name["Bearers of Weight"]["pool"], "extreme")
        self.assertEqual(by_name["Bearers of Weight"]["unknown_gifts"], ["Burning Fate"])
        self.assertFalse(any("Spicebush" in n for n in by_name))  # recipe text is not a pack
        by_id = {g["id"]: g for g in gifts}
        self.assertEqual(by_id["ebony-brooch-md"]["name"], "Ebony Brooch")

    def test_fusions(self):
        gifts, _, fusions, warnings = load()
        f = {x["result"]: x for x in fusions}
        self.assertEqual(f["hoarfrost-footprint"]["ingredients"], ["haunted-shoes", "frozen-cries"])
        self.assertTrue(any("Spicebush" in w for w in warnings))  # gift not in fixture data

    def test_fusion_comma_period_typo(self):
        _, _, fusions, warnings = load()
        f = {x["result"]: x for x in fusions}
        self.assertEqual(f["chains-of-bond"]["ingredients"], ["enh-tattoos-the-middle", "haunted-shoes"])
        self.assertEqual(f["chains-of-bond"]["unresolved"], [])
        self.assertFalse(any("'Enh'" in w for w in warnings))

    def test_mirror_dungeon_and_legacy_flags(self):
        gifts, *_ = load()
        by_key = {g["key"]: g for g in gifts}
        self.assertTrue(by_key["Hellterfly's Dream"]["mirror_dungeon"])
        self.assertFalse(by_key["Hellterfly's Dream"]["legacy"])
        old = by_key["Hellterfly's Dream (Legacy)"]
        self.assertTrue(old["legacy"])
        self.assertFalse(old["mirror_dungeon"])
        self.assertEqual(old["id"], "hellterfly-s-dream-legacy")
        self.assertFalse(by_key["Coin"]["mirror_dungeon"])  # story-only gift
        self.assertIsNone(by_key["Coin"]["tier"])

    def test_export_for_app(self):
        gifts, packs, fusions, _ = load()
        ident = build.parse_identity("LCB Sinner Yi Sang", ["Yi Sang Identities", "1-Star Identities", "Gloom Affinity"])
        event_only = build.parse_identity("Some Sinnerling Yi Sang", ["Yi Sang Identities"])
        data, warnings = build.export_for_app(
            gifts, packs, fusions, [ident, event_only],
            pack_pages={"The Outcast": "The Outcast Theme Pack"},
        )
        ids = {g["id"] for g in data["gifts"]}
        self.assertIn("hellterfly-s-dream", ids)
        self.assertNotIn("hellterfly-s-dream-legacy", ids)  # legacy dropped
        self.assertNotIn("coin", ids)  # story-only dropped
        h = next(g for g in data["gifts"] if g["id"] == "hellterfly-s-dream")
        self.assertNotIn("levels", h)
        self.assertTrue(h["effect"].startswith("When applying Burn Potency"))
        self.assertEqual(
            h["wiki_url"],
            "https://limbuscompany.wiki.gg/wiki/List_of_E.G.O_Gifts#:~:text=Hellterfly%27s%20Dream",
        )
        self.assertEqual(h["events"][0]["wiki_url"], "https://limbuscompany.wiki.gg/wiki/Ardor_Blossom_Moth")
        packs_by_name = {p["name"]: p for p in data["theme_packs"]}
        self.assertEqual(packs_by_name["The Outcast"]["wiki_url"],
                         "https://limbuscompany.wiki.gg/wiki/The_Outcast_Theme_Pack")
        self.assertIsNone(packs_by_name["Automated Factory"]["wiki_url"])
        self.assertNotIn("Bearers of Weight", packs_by_name)  # no obtainable gifts in fixture
        brooch = next(g for g in data["gifts"] if g["id"] == "ebony-brooch-md")
        self.assertEqual(brooch["theme_packs"], [packs_by_name["The Outcast"]["id"]])
        self.assertEqual([i["name"] for i in data["identities"]], ["LCB Sinner Yi Sang"])
        self.assertEqual(data["identities"][0]["wiki_url"],
                         "https://limbuscompany.wiki.gg/wiki/LCB_Sinner_Yi_Sang")
        self.assertIn({"result": "hoarfrost-footprint", "ingredients": ["haunted-shoes", "frozen-cries"]},
                      data["fusions"])
        self.assertTrue(any("Automated Factory" in w for w in warnings))

    def test_export_include_unobtainable(self):
        gifts, packs, fusions, _ = load()
        data, _ = build.export_for_app(gifts, packs, fusions, [], None, include_unobtainable=True)
        coin = next(g for g in data["gifts"] if g["id"] == "coin")
        self.assertFalse(coin["mirror_dungeon"])
        self.assertTrue(all(p["wiki_url"] is None for p in data["theme_packs"]))

    def test_gift_list_url_escapes_fragment(self):
        self.assertTrue(build.gift_list_url("T-1 Perpetual, Motion & Co").endswith(
            "#:~:text=T%2D1%20Perpetual%2C%20Motion%20%26%20Co"))

    def test_warnings_for_missing(self):
        *_, warnings = load()
        self.assertTrue(any("Made-to-Order" in w for w in warnings))
        self.assertTrue(any("Burning Fate" in w for w in warnings))

    def test_identity(self):
        ident = build.parse_identity("LCB Sinner Yi Sang", [
            "1-Star Identities", "Envy Affinity", "Gloom Affinity", "Identities",
            "Identities with Sinking", "Sloth Affinity", "Yi Sang Identities",
        ])
        self.assertEqual(ident["sinner"], "Yi Sang")
        self.assertEqual(ident["rarity"], 1)
        self.assertEqual(ident["affinities"], ["envy", "gloom", "sloth"])
        self.assertEqual(ident["status_effects"], ["Sinking"])
        self.assertEqual(ident["keywords"], ["Sinking"])
        self.assertFalse(ident["incomplete"])
        self.assertTrue(build.parse_identity("X", ["Yi Sang Identities"])["incomplete"])
        self.assertEqual(build.parse_identity("X", ["Ryoshu Identities"])["sinner"], "Ryōshū")


if __name__ == "__main__":
    unittest.main()
