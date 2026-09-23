"""Parse theme pack pages (rendered HTML from the MediaWiki parse API).

We work from the rendered page rather than the wikitext so the parser doesn't
depend on whichever templates the wiki uses to build its tables: split the page
into sections by heading, turn a section into plain text, and look for things
we already know (gift names, floor numbers).
"""

from __future__ import annotations

import html as htmllib
import re
from dataclasses import dataclass, field

from .build import fold

_HEADING_RE = re.compile(r"<h([1-6])\b[^>]*>(.*?)</h\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_DROP_RE = re.compile(r"<(script|style)\b.*?</\1>", re.IGNORECASE | re.DOTALL)
_LINK_RE = re.compile(r'<a\b[^>]*\btitle="([^"]+)"', re.IGNORECASE)


def html_to_text(fragment: str) -> str:
    text = _DROP_RE.sub(" ", fragment)
    text = re.sub(r"<br\s*/?>|</(?:p|div|li|tr|td|th)>", "\n", text, flags=re.IGNORECASE)
    text = _TAG_RE.sub(" ", text)
    text = htmllib.unescape(text)
    text = re.sub(r"[ \t ]+", " ", text)
    return re.sub(r"\s*\n\s*", "\n", text).strip()


def sections(page_html: str) -> list[tuple[int, str, str]]:
    """[(level, heading text, html until the next heading of any level)]."""
    heads = list(_HEADING_RE.finditer(page_html))
    out = []
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(page_html)
        title = html_to_text(m.group(2)).replace("[edit]", "").strip()
        out.append((int(m.group(1)), title, page_html[m.end():end]))
    return out


def section_html(page_html: str, *names: str) -> str | None:
    """HTML of the first section whose heading contains one of `names`,
    including its sub-sections."""
    secs = sections(page_html)
    wanted = [n.lower() for n in names]
    for i, (level, title, body) in enumerate(secs):
        if any(w in title.lower() for w in wanted):
            parts = [body]
            for lvl, _t, b in secs[i + 1:]:
                if lvl <= level:
                    break
                parts.append(b)
            return "".join(parts)
    return None


# -- floors ------------------------------------------------------------------------
_FLOOR_RANGE = re.compile(r"(\d+)\s*F(?:\s*[-~–—]\s*(\d+)\s*F)?", re.IGNORECASE)
# The infobox has <td data-source="normal"> / <td data-source="hard"> cells.
_FLOOR_CELL = re.compile(r'<td\b[^>]*data-source="(normal|hard|extreme)"[^>]*>(.*?)</td>', re.IGNORECASE | re.DOTALL)


def parse_floor_cell(text: str) -> list[int] | None:
    """"1F-2F" -> [1, 2]; "4F", "1F, 3F" -> lowest..highest; "—" -> None."""
    nums: list[int] = []
    for m in _FLOOR_RANGE.finditer(text):
        nums.append(int(m.group(1)))
        if m.group(2):
            nums.append(int(m.group(2)))
    return [min(nums), max(nums)] if nums else None


def parse_floors(page_html: str) -> dict[str, list[int] | None] | None:
    """Featured Floors from the page's infobox; None if the page has no such cells.
    Normal/Hard packs have "normal" and "hard" cells, EXTREME packs an "extreme" one."""
    cells = {k.lower(): parse_floor_cell(html_to_text(v)) for k, v in _FLOOR_CELL.findall(page_html)}
    if not cells:
        return None
    return {"normal": cells.get("normal"), "hard": cells.get("hard"), "extreme": cells.get("extreme")}


# -- gift names ------------------------------------------------------------------------
class NameFinder:
    """Resolves gift names (case/accent/quote-insensitive) to ids."""

    def __init__(self, names: dict[str, str]):
        self._by_fold = {fold(n): gid for n, gid in names.items() if n.strip()}

    def resolve(self, name: str) -> str | None:
        f = fold(name)
        return self._by_fold.get(f) or self._by_fold.get(re.sub(r"\s*\((?:md|mirror dungeon)\)$", "", f))


# Each gift in the Gift Rates tables is an icon with a hover tooltip:
#   <span class="advanced-tooltip"><img alt="Ebony Brooch Gift.png" ...><span class="tooltip-contents">...
# The tooltip holds the gift's full effect text (which can name *other* gifts),
# so we only read the icon's file name.
_GIFT_ICON = re.compile(r'<span class="advanced-tooltip">\s*<img alt="([^"]+?) Gift\.png"', re.IGNORECASE)
_BLOCK_HEAD = re.compile(r"<th\b[^>]*>\s*(Unique Gifts|Featured Gifts)\s*</th>", re.IGNORECASE)


_SPAN_TAG = re.compile(r"<(/?)span\b[^>]*>", re.IGNORECASE)


def strip_tooltips(fragment: str) -> str:
    """Remove every <span class="tooltip-contents">...</span>, nested spans included."""
    out: list[str] = []
    pos = 0
    while True:
        start = fragment.find('<span class="tooltip-contents"', pos)
        if start == -1:
            out.append(fragment[pos:])
            return "".join(out)
        out.append(fragment[pos:start])
        depth = 0
        for m in _SPAN_TAG.finditer(fragment, start):
            depth += -1 if m.group(1) else 1
            if depth == 0:
                pos = m.end()
                break
        else:
            return "".join(out)  # unbalanced markup: drop the rest


def gift_icons(fragment: str) -> list[str]:
    names = _GIFT_ICON.findall(strip_tooltips(fragment))
    return list(dict.fromkeys(htmllib.unescape(n).strip() for n in names))


@dataclass
class PackPage:
    title: str
    floors: dict | None = None
    gift_pool: list[str] = field(default_factory=list)
    unique: list[str] = field(default_factory=list)
    featured: list[str] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def parse_pack_page(title: str, page_html: str, finder: NameFinder) -> PackPage:
    page = PackPage(title)
    page.floors = parse_floors(page_html)
    if page.floors is None:
        page.warnings.append(f"{title}: no Featured Floors in the infobox")

    rates = section_html(page_html, "E.G.O Gift Rates", "Gift Rates")
    if rates is None:
        page.warnings.append(f"{title}: no E.G.O Gift Rates section (not a theme pack page?)")
        return page

    # Split the section at its "Unique Gifts" / "Featured Gifts" table headers.
    heads = list(_BLOCK_HEAD.finditer(rates))
    blocks: dict[str, str] = {}
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(rates)
        blocks[m.group(1).lower()] = blocks.get(m.group(1).lower(), "") + rates[m.end():end]
    if not heads:
        blocks["featured gifts"] = rates

    def resolve_all(names: list[str]) -> list[str]:
        out = []
        for n in names:
            gid = finder.resolve(n)
            if gid is None:
                if n not in page.unresolved:
                    page.unresolved.append(n)
            elif gid not in out:
                out.append(gid)
        return out

    page.unique = resolve_all(gift_icons(blocks.get("unique gifts", "")))
    page.featured = resolve_all(gift_icons(blocks.get("featured gifts", "")))
    page.gift_pool = page.featured + [g for g in page.unique if g not in page.featured]
    if not page.gift_pool:
        page.warnings.append(f"{title}: E.G.O Gift Rates section has no known gifts")
    return page


# -- the list of all theme packs ---------------------------------------------------
PACK_SUFFIX = " Theme Pack"


def parse_floor_theme_list(page_html: str) -> list[tuple[str, str | None]]:
    """[(pack page title, group heading)] from the "List of Floor Themes" page,
    e.g. ("The Outcast Theme Pack", "Canto Themes")."""
    out: list[tuple[str, str | None]] = []
    seen: set[str] = set()
    first = _HEADING_RE.search(page_html)
    chunks: list[tuple[str | None, str]] = [(None, page_html[: first.start()] if first else page_html)]
    chunks += [(title, body) for _lvl, title, body in sections(page_html)]
    for group, body in chunks:
        for m in _LINK_RE.finditer(body):
            t = htmllib.unescape(m.group(1))
            if t.endswith(PACK_SUFFIX) and t not in seen:
                seen.add(t)
                out.append((t, group))
    return out


def pack_name(title: str) -> str:
    return title[: -len(PACK_SUFFIX)] if title.endswith(PACK_SUFFIX) else title
