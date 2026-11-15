"""Write an image only when its pixels changed.

PNG bytes depend on the Pillow/zlib version that compressed them, so the same atlas built on
Finley's PC and on GitHub's servers differs byte for byte. Keeping the existing file when the
pixels match stops the daily update (.github/workflows/update-data.yml) from committing a "new"
atlas that looks exactly the same.
"""

from __future__ import annotations

from pathlib import Path


def save_png_if_changed(img, path: Path) -> bool:
    """Save `img` (a PIL image) as PNG unless `path` already holds the same pixels.
    Returns True if the file was written."""
    from PIL import Image

    if path.exists():
        try:
            with Image.open(path) as old:
                if old.mode == img.mode and old.size == img.size and old.tobytes() == img.tobytes():
                    return False
        except OSError:
            pass
    img.save(path, optimize=True)
    return True
