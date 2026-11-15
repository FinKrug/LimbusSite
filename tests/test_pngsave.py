import tempfile
import unittest
from pathlib import Path

from scraper.pngsave import save_png_if_changed

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None


@unittest.skipIf(Image is None, "needs Pillow")
class SavePngTest(unittest.TestCase):
    def test_keeps_the_file_when_pixels_match(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.png"
            img = Image.new("RGB", (4, 3), (10, 20, 30))
            self.assertTrue(save_png_if_changed(img, p))
            # Same pixels, compressed differently: the file stays as it was.
            p.write_bytes(p.read_bytes())
            before = p.stat().st_mtime_ns
            self.assertFalse(save_png_if_changed(Image.new("RGB", (4, 3), (10, 20, 30)), p))
            self.assertEqual(p.stat().st_mtime_ns, before)
            self.assertTrue(save_png_if_changed(Image.new("RGB", (4, 3), (10, 20, 31)), p))


if __name__ == "__main__":
    unittest.main()
