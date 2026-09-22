import unittest
from pathlib import Path

from scraper.lua_table import LuaParseError, parse_module

FIX = Path(__file__).parent / "fixtures"


class LuaTableTests(unittest.TestCase):
    def test_return_table(self):
        data = parse_module((FIX / "EgoGift_data.lua").read_text(encoding="utf-8"))
        self.assertEqual(len(data), 11)
        h = data["Hellterfly's Dream"]
        self.assertEqual(h["tier"], "II")
        self.assertEqual(h["cost"], 198)
        self.assertEqual(h["upgrade"], 2)
        self.assertIn("'Unique Burn'", h["desc"])

    def test_long_bracket_and_concat(self):
        data = parse_module((FIX / "EgoGift_data.lua").read_text(encoding="utf-8"))
        self.assertEqual(
            data["Hoarfrost Footprint"]["desc"],
            "Long\nbracket {{StatusEffect|Sinking|d}} text joined",
        )

    def test_local_and_field_assignment(self):
        data = parse_module((FIX / "EgoGiftList_data.lua").read_text(encoding="utf-8"))
        self.assertEqual(data["MainGifts"][1], {"gift": "Little and To-be-Naughty Plushie"})
        self.assertEqual(data["EnchancableGifts"], ["Hellterfly's Dream", "Haunted Shoes"])
        self.assertEqual(data["FusionGifts"], {})

    def test_misc_syntax(self):
        src = """
        -- comment
        --[==[ block
        comment ]==]
        local base = 10
        local t = { 'a\\'b', "c\\n", -5, 0x1F, 1.5e1, true, false, nil, base }
        t[1] = "first"
        return { list = t, ["k"] = base .. "x"; nested = { a = { b = 1 } } }
        """
        data = parse_module(src)
        self.assertEqual(data["list"], ["first", "c\n", -5, 31, 15.0, True, False, None, 10])
        self.assertEqual(data["k"], "10x")
        self.assertEqual(data["nested"]["a"]["b"], 1)

    def test_errors_have_line_numbers(self):
        with self.assertRaises(LuaParseError) as ctx:
            parse_module("return {\n a = 1\n b = 2 }")
        self.assertIn("line 3", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
