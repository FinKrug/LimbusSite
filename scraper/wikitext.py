"""Turn the wiki's markup into plain text, and pull structured bits out of it."""

from __future__ import annotations

import html
import re

_TEMPLATE_RE = re.compile(r"\{\{([^{}]*)\}\}")
_LINK_RE = re.compile(r"\[\[([^\[\]|]*)(?:\|([^\[\]]*))?\]\]")
_EXT_LINK_RE = re.compile(r"\[https?://[^\s\]]+\s*([^\]]*)\]")
_BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
_STATUS_RE = re.compile(r"\{\{\s*StatusEffect\s*\|\s*([^|}]+)", re.IGNORECASE)


def status_effects(markup: str) -> list[str]:
    """Status effects referenced via {{StatusEffect|Name|...}}, in order, deduped."""
    seen: dict[str, None] = {}
    for m in _STATUS_RE.finditer(markup or ""):
        seen.setdefault(m.group(1).strip(), None)
    return list(seen)


def _template_text(m: re.Match) -> str:
    parts = [p.strip() for p in m.group(1).split("|")]
    # Positional args only; named args (x=y) are display options.
    args = [p for p in parts[1:] if "=" not in p]
    # {{StatusEffect|Burn|d}} -> "Burn"; {{Foo}} -> "Foo"
    return args[0] if args else parts[0]


def to_plain(markup: str) -> str:
    """Wiki markup -> readable plain text (newlines kept for <br>)."""
    if not markup:
        return ""
    text = markup
    # Innermost templates first, repeat for nesting.
    for _ in range(10):
        new = _TEMPLATE_RE.sub(_template_text, text)
        if new == text:
            break
        text = new
    text = _LINK_RE.sub(lambda m: (m.group(2) or m.group(1)).strip(), text)
    text = _EXT_LINK_RE.sub(lambda m: m.group(1), text)
    text = _BR_RE.sub("\n", text)
    text = _TAG_RE.sub("", text)
    text = re.sub(r"'{2,}", "", text)  # ''italic'' / '''bold'''
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return text.strip()


def split_sources(event: str) -> list[dict]:
    """Split an EgoGiftList `event` string into sources.

    Returns dicts like {"text": "Automated Factory", "linked": False}.
    Linked entries ([[...]]) are wiki pages, usually abnormality events;
    plain entries are usually theme-pack names.
    """
    if not event:
        return []
    out = []
    for chunk in _BR_RE.split(event):
        chunk = chunk.strip()
        if not chunk:
            continue
        linked = bool(_LINK_RE.search(chunk))
        out.append({"text": to_plain(chunk), "linked": linked})
    return out


_FUSE_HEADER_RE = re.compile(r"^fuse e\.?g\.?o\.? gifts?\s*:?$", re.IGNORECASE)


def is_fusion_header(plain_text: str) -> bool:
    """True for the "Fuse E.G.O Gifts:" line that precedes a recipe."""
    return bool(_FUSE_HEADER_RE.match(plain_text.strip()))


def split_ingredients(text: str, known_names: list[str]) -> list[str]:
    """Split "A, B, and C" into names, respecting names that contain commas.

    `known_names` should include every gift name/alias. At each position the
    longest known name that matches is taken; otherwise we fall back to the
    text up to the next comma.
    """
    s = to_plain(text).strip().rstrip(".")
    # Compare with "." and "," treated alike: the wiki sometimes writes
    # "Enh, Tattoos" for the gift "Enh. Tattoos". Same length, so indices line up.
    lowered = [(n, _punct(n.lower())) for n in sorted(set(known_names), key=len, reverse=True)]
    out: list[str] = []
    i = 0
    while i < len(s):
        # skip separators
        m = re.compile(r"\s*(?:,\s*)?(?:and\s+|&\s+)?").match(s, i)
        i = m.end()
        if i >= len(s):
            break
        rest = _punct(s[i:].lower())
        match = None
        for name, low in lowered:
            if rest.startswith(low):
                end = i + len(low)
                if end == len(s) or s[end] in ", ":
                    match = name
                    break
        if match is None:
            nxt = s.find(",", i)
            match = s[i:] if nxt == -1 else s[i:nxt]
            # "X and Y" at the end with no comma
            if nxt == -1 and " and " in match and not out:
                a, b = match.split(" and ", 1)
                out.extend([a.strip(), b.strip()])
                break
        out.append(match.strip())
        i += len(match)
    return [x for x in out if x]


def _punct(s: str) -> str:
    return s.replace(".", ",")
