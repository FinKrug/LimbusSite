import unittest

from scraper import ego_art


class EgoArtTest(unittest.TestCase):
    def test_file_name_candidates(self):
        self.assertEqual(ego_art.candidates({"name": "Bygone Days", "sinner": "Yi Sang"})[0], "Bygone Days Yi Sang.png")
        # the wiki writes "9:2" as "9-2" and "Command : Meltdown" as "Command - Meltdown"
        self.assertIn("9-2 Faust.png", ego_art.candidates({"name": "9:2", "sinner": "Faust"}))
        self.assertIn("Command - Meltdown Faust.png", ego_art.candidates({"name": "Command : Meltdown", "sinner": "Faust"}))


if __name__ == "__main__":
    unittest.main()
