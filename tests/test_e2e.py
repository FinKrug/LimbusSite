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


class FakeWiki(BaseHTTPRequestHandler):
    calls = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        q = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).items()}
        FakeWiki.calls.append(q)
        if q.get("prop") == "revisions":
            pages = [{"title": t, "revisions": [{"revid": 1, "timestamp": "2026-01-01T00:00:00Z",
                      "slots": {"main": {"content": MODULES[t]}}}]} for t in q["titles"].split("|")]
            body = {"query": {"pages": pages}}
        elif q.get("list") == "categorymembers":
            names = list(IDENTITIES)
            # paginate: first call returns 2 members + continue
            if "cmcontinue" not in q:
                body = {"query": {"categorymembers": [{"title": n} for n in names[:2]]},
                        "continue": {"cmcontinue": "page2", "continue": "-||"}}
            else:
                body = {"query": {"categorymembers": [{"title": n} for n in names[2:]]}}
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
            self.assertEqual(len(gifts), 9)
            self.assertEqual(meta["counts"]["mirror_dungeon_gifts"], 6)
            self.assertEqual([i["sinner"] for i in ids], ["Yi Sang", "Faust"])
            self.assertEqual(meta["counts"]["identities"], 2)
            self.assertIn("Some NPC Page", (out / "report.txt").read_text(encoding="utf-8"))
            n_calls = len(FakeWiki.calls)
            srv.shutdown()
            srv.server_close()
            # offline rebuild uses the cache only
            self.assertEqual(main(["--out", str(out), "--api", api, "--offline"]), 0)
            self.assertEqual(len(FakeWiki.calls), n_calls)
            self.assertEqual(len(json.loads((out / "gifts.json").read_text(encoding="utf-8"))), 9)


if __name__ == "__main__":
    unittest.main()
