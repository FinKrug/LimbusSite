"""Small, polite MediaWiki API client (stdlib only).

Every response is cached as JSON under `cache_dir`, so a run can be replayed
offline (`--offline`) without touching the wiki, e.g. when tweaking parsing.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterator

DEFAULT_API = "https://limbuscompany.wiki.gg/api.php"
DEFAULT_UA = "LimbusSiteScraper/0.1 (personal non-commercial tool; low request rate)"


class WikiError(RuntimeError):
    pass


class WikiClient:
    def __init__(
        self,
        api_url: str = DEFAULT_API,
        cache_dir: Path | None = None,
        offline: bool = False,
        min_interval: float = 1.0,
        user_agent: str | None = None,
    ):
        self.api_url = api_url
        self.cache_dir = cache_dir
        self.offline = offline
        self.min_interval = min_interval
        self.user_agent = user_agent or os.environ.get("LIMBUS_SCRAPER_UA", DEFAULT_UA)
        self._last = 0.0
        self.requests_made = 0
        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)

    # -- low level ---------------------------------------------------------
    def _cache_path(self, params: dict[str, Any]) -> Path | None:
        if not self.cache_dir:
            return None
        key = json.dumps(params, sort_keys=True)
        digest = hashlib.sha1(key.encode()).hexdigest()[:16]
        return self.cache_dir / f"{digest}.json"

    def get(self, **params: Any) -> dict:
        params = {"format": "json", "formatversion": "2", **params}
        cache = self._cache_path(params)
        if self.offline:
            if cache and cache.exists():
                return json.loads(cache.read_text(encoding="utf-8"))["response"]
            raise WikiError(f"--offline but no cached response for {params}")

        url = self.api_url + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "User-Agent": self.user_agent,
            "Accept": "application/json",
        })
        for attempt in range(5):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    body = resp.read().decode("utf-8")
                    retry_after = resp.headers.get("Retry-After")
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                    time.sleep(float(e.headers.get("Retry-After") or 2 ** (attempt + 1)))
                    continue
                raise WikiError(f"HTTP {e.code} for {url}") from e
            except urllib.error.URLError as e:
                if attempt < 4:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise WikiError(f"network error for {url}: {e.reason}") from e
            self.requests_made += 1
            data = json.loads(body)
            if "error" in data:
                if data["error"].get("code") == "maxlag" and attempt < 4:
                    time.sleep(float(retry_after or 5))
                    continue
                raise WikiError(f"API error: {data['error']}")
            if cache:
                cache.write_text(
                    json.dumps({"params": params, "response": data}, ensure_ascii=False),
                    encoding="utf-8",
                )
            return data
        raise WikiError(f"gave up after retries: {url}")

    def query_all(self, **params: Any) -> Iterator[dict]:
        """Run an action=query request, following `continue` until done."""
        cont: dict[str, Any] = {}
        while True:
            data = self.get(action="query", maxlag=5, **params, **cont)
            yield data
            if "continue" not in data:
                return
            cont = data["continue"]

    # -- helpers -----------------------------------------------------------
    def page_sources(self, titles: list[str]) -> dict[str, dict]:
        """Current wikitext of each title -> {title: {content, revid, timestamp}}."""
        out: dict[str, dict] = {}
        for batch in _chunks(titles, 50):
            for data in self.query_all(
                prop="revisions", titles="|".join(batch),
                rvprop="content|ids|timestamp", rvslots="main",
            ):
                for page in data.get("query", {}).get("pages", []):
                    if page.get("missing") or page.get("invalid"):
                        out[page["title"]] = {"missing": True}
                        continue
                    if not page.get("revisions"):
                        continue  # content arrives in a later continuation
                    rev = page["revisions"][0]
                    out[page["title"]] = {
                        "content": rev["slots"]["main"]["content"],
                        "revid": rev["revid"],
                        "timestamp": rev["timestamp"],
                    }
        return out

    def category_members(self, category: str, namespace: int = 0) -> list[str]:
        titles: list[str] = []
        for data in self.query_all(
            list="categorymembers", cmtitle=category,
            cmnamespace=namespace, cmlimit="max", cmtype="page",
        ):
            titles += [m["title"] for m in data["query"]["categorymembers"]]
        return titles

    def existing_titles(self, titles: list[str]) -> dict[str, str | None]:
        """{requested title: final page title after redirects, or None if missing}"""
        out: dict[str, str | None] = {}
        for batch in _chunks(list(dict.fromkeys(titles)), 50):
            data = self.get(action="query", prop="info", redirects=1,
                            titles="|".join(batch), maxlag=5)
            q = data.get("query", {})
            norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
            redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
            exists = {p["title"] for p in q.get("pages", [])
                      if not p.get("missing") and not p.get("invalid")}
            for t in batch:
                final = norm.get(t, t)
                final = redir.get(final, final)
                out[t] = final if final in exists else None
        return out

    def page_categories(self, titles: list[str]) -> dict[str, list[str]]:
        """{title: [category names without the 'Category:' prefix]}"""
        out: dict[str, list[str]] = {t: [] for t in titles}
        for batch in _chunks(titles, 50):
            for data in self.query_all(
                prop="categories", titles="|".join(batch), cllimit="max",
            ):
                for page in data.get("query", {}).get("pages", []):
                    cats = [c["title"].split(":", 1)[1] for c in page.get("categories", [])]
                    out.setdefault(page["title"], []).extend(cats)
        return {t: sorted(set(c)) for t, c in out.items()}


def _chunks(items: list, size: int) -> Iterator[list]:
    for i in range(0, len(items), size):
        yield items[i:i + size]
