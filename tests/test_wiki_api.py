import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from scraper import wiki_api


class FakeResp:
    def __init__(self, body):
        self._body = body.encode()
        self.headers = {}

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class WikiClientTests(unittest.TestCase):
    def test_retries_timeout_while_reading(self):
        calls = []

        def urlopen(req, timeout):
            calls.append(1)
            if len(calls) == 1:
                raise TimeoutError("The read operation timed out")
            return FakeResp(json.dumps({"parse": {"text": "ok"}}))

        client = wiki_api.WikiClient("http://x/api.php", min_interval=0)
        with mock.patch.object(wiki_api.urllib.request, "urlopen", urlopen), \
                mock.patch.object(wiki_api.time, "sleep"):
            self.assertEqual(client.get(action="parse", page="P")["parse"]["text"], "ok")
        self.assertEqual(len(calls), 2)

    def test_gives_up_with_wiki_error(self):
        def urlopen(req, timeout):
            raise ConnectionResetError("reset")

        client = wiki_api.WikiClient("http://x/api.php", min_interval=0)
        with mock.patch.object(wiki_api.urllib.request, "urlopen", urlopen), \
                mock.patch.object(wiki_api.time, "sleep"):
            with self.assertRaises(wiki_api.WikiError):
                client.get(action="parse", page="P")

    def test_max_age_reuses_recent_cache(self):
        with tempfile.TemporaryDirectory() as d:
            client = wiki_api.WikiClient("http://x/api.php", cache_dir=Path(d), min_interval=0)
            with mock.patch.object(wiki_api.urllib.request, "urlopen",
                                   lambda req, timeout: FakeResp('{"v": 1}')):
                client.get(action="parse", page="P")

            def fail(req, timeout):
                raise AssertionError("should have used the cache")

            with mock.patch.object(wiki_api.urllib.request, "urlopen", fail):
                self.assertEqual(client.get(max_age=3600, action="parse", page="P"), {"v": 1})
            # older than max_age -> fetched again
            cache = next(Path(d).iterdir())
            old = time.time() - 7200
            import os
            os.utime(cache, (old, old))
            with mock.patch.object(wiki_api.urllib.request, "urlopen",
                                   lambda req, timeout: FakeResp('{"v": 2}')):
                self.assertEqual(client.get(max_age=3600, action="parse", page="P"), {"v": 2})


if __name__ == "__main__":
    unittest.main()
