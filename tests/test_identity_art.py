import unittest

from scraper import identity_art


class IdentityArtTest(unittest.TestCase):
    def test_wiki_file_names(self):
        self.assertEqual(identity_art.wiki_file("Lobotomy E.G.O::Solemn Lament Yi Sang"), "Lobotomy E.G.O Solemn Lament Yi Sang")
        self.assertEqual(identity_art.wiki_file("Haute Couture::Le Noir 3F Public Address Room Hong Lu"),
                         "Haute Couture Le Noir 3F Public Address Room Hong Lu")

    def test_base_identities_have_no_uptie_art(self):
        self.assertEqual(identity_art.art_files({"name": "LCB Sinner Faust", "rarity": 1}), [("base", "LCB Sinner Faust.png")])
        self.assertEqual([v for v, _ in identity_art.art_files({"name": "Dawn Office Fixer Faust", "rarity": 3})], ["base", "uptie"])
        self.assertEqual(identity_art.art_files({"name": "Dawn Office Fixer Faust", "rarity": 3})[1][1],
                         "Dawn Office Fixer Faust Uptied.png")


if __name__ == "__main__":
    unittest.main()
