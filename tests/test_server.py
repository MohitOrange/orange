import json
import os
import urllib.error
import urllib.request

import pytest

from orange.server import Desktop
from orange.vault import Box


@pytest.fixture()
def desk(tmp_path, monkeypatch):
    monkeypatch.setenv("ORANGE_HOME", str(tmp_path / "home"))
    box = Box.create("tester", "secret123")
    d = Desktop(box)
    d.start()
    yield d
    d.stop()


def call(d, method, path, body=None, headers=None, raw=None, cookie=True):
    url = f"http://127.0.0.1:{d.port}{path}"
    h = {"X-Orange": "1"}
    if cookie:
        h["Cookie"] = f"orange={d.cookie}"
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if data is not None and raw is None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def test_page_needs_the_one_time_secret(desk):
    assert call(desk, "GET", "/", cookie=False)[0] == 401
    status, body, headers = call(desk, "GET", f"/?t={desk.token}", cookie=False)
    assert status == 200 and b"Orange" in body
    assert "HttpOnly" in headers["Set-Cookie"] and "SameSite=Strict" in headers["Set-Cookie"]
    assert "script-src 'self'" in headers["Content-Security-Policy"]


def test_api_rejects_strangers(desk):
    assert call(desk, "GET", "/api/list?path=/", cookie=False)[0] == 401
    assert call(desk, "GET", "/api/list?path=/", headers={"X-Orange": ""})[0] == 403
    assert call(desk, "GET", "/api/list?path=/", headers={"Host": "evil.example:80"})[0] == 421


def test_upload_list_download_and_range(desk):
    data = os.urandom(5 * 1024 * 1024 + 123)  # crosses an encryption chunk boundary
    status, body, _ = call(desk, "POST", "/api/upload?path=/Inbox/blob.bin", raw=data)
    assert status == 200 and json.loads(body)["path"] == "/Inbox/blob.bin"
    status, body, _ = call(desk, "POST", "/api/upload?path=/Inbox/blob.bin", raw=b"again")
    assert json.loads(body)["path"] == "/Inbox/blob (2).bin"  # never overwrites by accident
    names = [i["name"] for i in json.loads(call(desk, "GET", "/api/list?path=/Inbox")[1])["items"]]
    assert names == ["blob (2).bin", "blob.bin"]
    status, body, headers = call(desk, "GET", "/api/file?path=/Inbox/blob.bin")
    assert status == 200 and body == data and headers["Cache-Control"] == "no-store"
    assert "sandbox" in headers["Content-Security-Policy"]
    start, end = 4 * 1024 * 1024 - 10, 4 * 1024 * 1024 + 10
    status, body, headers = call(desk, "GET", "/api/file?path=/Inbox/blob.bin", headers={"Range": f"bytes={start}-{end}"})
    assert status == 206 and body == data[start:end + 1]
    assert headers["Content-Range"] == f"bytes {start}-{end}/{len(data)}"


def test_trash_undo_and_empty(desk):
    call(desk, "POST", "/api/write", {"path": "/Documents/a.md", "text": "hello"})
    status, body, _ = call(desk, "POST", "/api/trash", {"paths": ["/Documents/a.md"]})
    tp = json.loads(body)["items"][0]
    root = [i["name"] for i in json.loads(call(desk, "GET", "/api/list?path=/")[1])["items"]]
    assert ".trash" not in root and ".orange" not in root  # system folders stay hidden
    trash = json.loads(call(desk, "GET", "/api/list?path=/.trash")[1])["items"]
    assert trash[0]["name"] == "a.md" and trash[0]["from"] == "/Documents/a.md"
    call(desk, "POST", "/api/restore", {"paths": [tp]})
    assert call(desk, "GET", "/api/file?path=/Documents/a.md")[1] == b"hello"
    call(desk, "POST", "/api/trash", {"paths": ["/Documents/a.md"]})
    assert call(desk, "POST", "/api/delete", {"paths": ["/Documents"]})[0] == 200
    assert json.loads(call(desk, "GET", "/api/list?path=/")[1])["items"]  # delete only works inside the trash
    call(desk, "POST", "/api/emptytrash", {})
    assert json.loads(call(desk, "GET", "/api/list?path=/.trash")[1])["items"] == []


def test_system_paths_are_protected(desk):
    assert call(desk, "POST", "/api/upload?path=/Inbox/../.orange/settings.json", raw=b"{}")[0] == 400
    assert call(desk, "POST", "/api/write", {"path": "/.trash/x", "text": "no"})[0] == 400
    assert call(desk, "POST", "/api/rename", {"path": "/Documents", "name": "../x"})[0] == 400


def test_lock_wipes_access_until_password(desk):
    call(desk, "POST", "/api/write", {"path": "/n.txt", "text": "secret"})
    call(desk, "POST", "/api/lock", {})
    assert call(desk, "GET", "/api/file?path=/n.txt")[0] == 423
    assert json.loads(call(desk, "GET", "/api/state")[1])["locked"] is True
    assert call(desk, "POST", "/api/unlock", {"password": "nope"})[0] == 403
    assert call(desk, "POST", "/api/unlock", {"password": "secret123"})[0] == 200
    assert call(desk, "GET", "/api/file?path=/n.txt")[1] == b"secret"


def test_settings_are_stored_encrypted(desk):
    call(desk, "POST", "/api/settings", {"theme": "day", "secretNote": "pineapple"})
    assert json.loads(call(desk, "GET", "/api/settings")[1])["theme"] == "day"
    raw = b"".join(p.read_bytes() for p in desk.box.path.rglob("*") if p.is_file())
    assert b"pineapple" not in raw


def test_search_and_recent(desk):
    call(desk, "POST", "/api/write", {"path": "/Projects/game/main.py", "text": "print(1)"})
    hits = json.loads(call(desk, "GET", "/api/search?q=MAIN")[1])["items"]
    assert [h["path"] for h in hits] == ["/Projects/game/main.py"]
    recent = json.loads(call(desk, "GET", "/api/recent?n=3")[1])["items"]
    assert recent[0]["path"] == "/Projects/game/main.py"


# ---------------------------------------------------------------- Orange 3: apps API
def test_kv_store_is_encrypted_and_validates_keys(desk):
    value = {"best": {"snake": 42}, "recent": ["snake"]}
    assert call(desk, "POST", "/api/kv", {"key": "arcade", "value": value})[0] == 200
    assert json.loads(call(desk, "GET", "/api/kv?key=arcade")[1]) == value
    assert json.loads(call(desk, "GET", "/api/kv?key=learn")[1]) == {}          # unknown keys start empty
    assert call(desk, "POST", "/api/kv", {"key": "../escape", "value": 1})[0] == 400
    assert call(desk, "GET", "/api/kv?key=a/b")[0] == 400
    for root, _, files in os.walk(desk.box.path):
        for f in files:
            assert b"snake" not in open(os.path.join(root, f), "rb").read()      # scores never hit the disk in clear


def test_system_stats(desk):
    s = json.loads(call(desk, "GET", "/api/sys")[1])
    assert s["disk"]["total"] > s["disk"]["free"] > 0
    assert s["cores"] >= 1 and s["box"] >= 0
    assert s["ram"] is None or 0 <= s["ram"]["percent"] <= 100


def test_python_runner(desk):
    r = json.loads(call(desk, "POST", "/api/runpy", {"code": "print(input()[::-1]); import sys; sys.exit(3)", "stdin": "egnaro"})[1])
    assert r["stdout"].strip() == "orange" and r["code"] == 3
    r = json.loads(call(desk, "POST", "/api/runpy", {"code": "1/0"})[1])
    assert "ZeroDivisionError" in r["stderr"] and r["code"] != 0


def test_sql_database_lives_in_the_box(desk):
    q = "CREATE TABLE t (n INTEGER, name TEXT);\nINSERT INTO t VALUES (1, 'orange'), (2, 'mango');\nSELECT name FROM t ORDER BY n;"
    r = json.loads(call(desk, "POST", "/api/sql", {"path": "/Projects/test.db", "query": q})[1])
    assert r["results"][-1] == {"columns": ["name"], "rows": [["orange"], ["mango"]]} and r["tables"] == ["t"]
    r = json.loads(call(desk, "POST", "/api/sql", {"path": "/Projects/test.db", "query": "SELECT COUNT(*) AS c FROM t;"})[1])
    assert r["results"][0]["rows"] == [[2]]                                       # persisted, encrypted, between calls
    assert desk.box.read_bytes("/Projects/test.db")[:15] == b"SQLite format 3"
    r = json.loads(call(desk, "POST", "/api/sql", {"path": "/Projects/test.db", "query": "SELECT * FROM nope;"})[1])
    assert "no such table" in r["error"]
    assert call(desk, "POST", "/api/sql", {"path": "/.orange/settings.json", "query": "SELECT 1;"})[0] == 400


def test_studio_preview_is_sandboxed(desk):
    url = json.loads(call(desk, "POST", "/api/play", {"html": "<h1>hi</h1>"})[1])["url"]
    status, body, headers = call(desk, "GET", url)
    assert status == 200 and body == b"<h1>hi</h1>"
    csp = headers["Content-Security-Policy"]
    assert csp.startswith("sandbox allow-scripts") and "allow-same-origin" not in csp and "connect-src 'none'" in csp
    assert call(desk, "GET", url, cookie=False)[0] == 401
    assert call(desk, "GET", "/play/unknown")[0] == 404


def test_write_unique_and_upload_replace(desk):
    call(desk, "POST", "/api/write", {"path": "/Projects/a.py", "text": "print(1)"})
    r = json.loads(call(desk, "POST", "/api/write", {"path": "/Projects/a.py", "text": "print(2)", "unique": True})[1])
    assert r["path"] == "/Projects/a (2).py" and desk.box.read_bytes("/Projects/a.py") == b"print(1)"
    call(desk, "POST", "/api/upload?path=/Pictures/d.png", raw=b"one")
    r = json.loads(call(desk, "POST", "/api/upload?path=/Pictures/d.png&replace=1", raw=b"two")[1])
    assert r["path"] == "/Pictures/d.png" and desk.box.read_bytes("/Pictures/d.png") == b"two"


def test_bundled_games_and_vendor_files_are_served(desk):
    for path in ["/js/arcade/catalog.js", "/js/apps/learn.js", "/vendor/preact.umd.js", "/games/neon-brawl/index.html", "/games/gat/index.html"]:
        status, body, _ = call(desk, "GET", path)
        assert status == 200 and body, path
