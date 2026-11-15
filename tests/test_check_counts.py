import unittest

from scripts.check_counts import drops


class CheckCountsTest(unittest.TestCase):
    def test_growth_and_small_changes_pass(self):
        self.assertEqual(drops({"gifts": 466, "identities": 195}, {"gifts": 470, "identities": 194}, 0.05), [])

    def test_big_drop_fails(self):
        self.assertEqual(drops({"gifts": 466}, {"gifts": 12}, 0.05), ["gifts: 466 -> 12"])
        self.assertEqual(drops({"identities": 195}, {}, 0.05), ["identities: 195 -> 0"])


if __name__ == "__main__":
    unittest.main()
