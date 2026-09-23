"""Runs the whole CLI against a fake MediaWiki API on localhost."""
import json
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from scraper.__main__ import main

FIX = Path(__file__).parent / "fixtures"
MODULES = {
    "Module:EgoGift/data": (FIX / "EgoGift_data.lua").read_text(encoding="utf-8"),
    "Module:EgoGiftList/data": (FIX / "EgoGiftList_data.lua").read_text(encoding="utf-8"),
}
IDENTITIES = {
    "LCB Sinner Yi Sang": ["Yi Sang Identities", "1-Star Identities", "Gloom Affinity",
                           "Envy Affinity", "Identities with Sinking"],
    "W Corp. L3 Cleanup Agent Faust": ["Faust Identities", "3-Star Identities",
                                       "Lust Affinity", "Identities with Charge"],
    "Some NPC Page": ["Identities"],
}


IDENTITY_PAGES = {
    "LCB Sinner Yi Sang": "{{Identity\n|slashres = Fatal\n|s1type = Slash\n|s2type = Pierce\n|s3type = Slash\n}}",
    "W Corp. L3 Cleanup Agent Faust": "Skills use [[File:Blunt.png]] and [[File:Blunt.png]] and [[File:Pierce.png]]",
}


class FakeWiki(BaseHTTPRequestHandler):
    calls = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        q = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).items()}
        FakeWiki.calls.append(q)
        if q.get("action") == "parse":
            pages = {
                "List of Floor Themes": (FIX / "floor_themes.html").read_text(encoding="utf-8"),
                "The Outcast Theme Pack": (FIX / "pack_page_new.html").read_text(encoding="utf-8"),
            }
            if q["page"] in pages:
                body = {"parse": {"title": q["page"], "text": pages[q["page"]]}}
            else:
                body = {"error": {"code": "missingtitle", "info": "The page you specified doesn't exist."}}
        elif q.get("prop") == "revisions":
            pages = [{"title": t, "revisions": [{"revid": 1, "timestamp": "2026-01-01T00:00:00Z",
                      "slots": {"main": {"content": MODULES.get(t) or IDENTITY_PAGES.get(t, "")}}}]}
                     for t in q["titles"].split("|")]
            body = {"query": {"pages": pages}}
        elif q.get("list") == "categorymembers":
            names = list(IDENTITIES)
            # paginate: first call returns 2 members + continue
            if "cmcontinue" not in q:
                body = {"query": {"categorymembers": [{"title": n} for n in names[:2]]},
                        "continue": {"cmcontinue": "page2", "continue": "-||"}}
            else:
                body = {"query": {"categorymembers": [{"title": n} for n in names[2:]]}}
        elif q.get("prop") == "info":
            existing = {"The Outcast Theme Pack", "Automated Factory"}
            titles = q["titles"].split("|")
            body = {"query": {
                "normalized": [{"from": "the Unloving Theme Pack", "to": "The Unloving Theme Pack"}],
                "pages": [{"title": t, **({} if t in existing else {"missing": True})} for t in titles],
            }}
        elif q.get("prop") == "categories":
            body = {"query": {"pages": [{"title": t, "categories": [{"title": "Category:" + c} for c in IDENTITIES[t]]}
                                        for t in q["titles"].split("|")]}}
        else:
            body = {"error": {"code": "badparams"}}
        raw = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)


class EndToEnd(unittest.TestCase):
    def test_cli_live_then_offline(self):
        srv = HTTPServer(("127.0.0.1", 0), FakeWiki)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        api = f"http://127.0.0.1:{srv.server_port}/api.php"
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "data"
            self.assertEqual(main(["--out", str(out), "--api", api, "--delay", "0"]), 0)
            gifts = json.loads((out / "gifts.json").read_text(encoding="utf-8"))
            ids = json.loads((out / "identities.json").read_text(encoding="utf-8"))
            meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
            self.assertEqual(len(gifts), 7)  # Mirror Dungeon gifts only (+ Coin, found in a pack pool)
            self.assertEqual(meta["counts"]["gifts"], 7)
            packs = {p["name"]: p["wiki_url"] for p in json.loads((out / "theme_packs.json").read_text(encoding="utf-8"))}
            self.assertEqual(packs["The Outcast"], "https://limbuscompany.wiki.gg/wiki/The_Outcast_Theme_Pack")
            self.assertIsNone(packs["Automated Factory"])  # linked from the list, page missing
            self.assertIsNone(packs["The Unloving"])
            full = {p["name"]: p for p in json.loads((out / "theme_packs.json").read_text(encoding="utf-8"))}
            self.assertEqual(full["The Outcast"]["group"], "Canto Themes")
            self.assertEqual(full["The Outcast"]["floors"], {"normal": [1, 2], "hard": [1, 1], "extreme": None})
            self.assertIn("hellterfly-s-dream", full["The Outcast"]["gift_pool"])
            report = (out / "report.txt").read_text(encoding="utf-8")
            self.assertIn("Automated factory Theme Pack", report)  # listed (other casing) but page missing
            self.assertNotIn("Automated Factory Theme Pack", report)  # so no second lookup under the gift list's name
            # "Coin" is a story gift, but The Outcast's pool lists it, so it counts as a Mirror Dungeon gift
            self.assertIn("coin", {g["id"] for g in json.loads((out / "gifts.json").read_text(encoding="utf-8"))})
            self.assertEqual([i["sinner"] for i in ids], ["Yi Sang", "Faust"])
            self.assertEqual([i["attack_types"] for i in ids], [["Slash", "Pierce"], ["Blunt", "Pierce"]])
            self.assertTrue(all(sum(i["attack_counts"].values()) >= len(i["attack_types"]) for i in ids))
            self.assertEqual(meta["counts"]["identities"], 2)
            self.assertIn("Some NPC Page", (out / "report.txt").read_text(encoding="utf-8"))
            n_calls = len(FakeWiki.calls)
            srv.shutdown()
            srv.server_close()
            # offline rebuild uses the cache only
            self.assertEqual(main(["--out", str(out), "--api", api, "--offline"]), 0)
            self.assertEqual(len(FakeWiki.calls), n_calls)
            self.assertEqual(len(json.loads((out / "gifts.json").read_text(encoding="utf-8"))), 7)


if __name__ == "__main__":
    unittest.main()
