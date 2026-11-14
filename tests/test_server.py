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
