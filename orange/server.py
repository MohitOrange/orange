"""Orange Desktop: a local server that shows the unlocked box as a full desktop.

The desktop is a web UI opened in an app-mode browser window (Edge or Chrome),
so it gets real animations, drag and drop from the computer, video playback and
PDF viewing without any extra installs.

Security model:
- listens only on 127.0.0.1, on a random port, for the lifetime of the session
- the Host header must be exactly 127.0.0.1:<port> (blocks DNS-rebinding attacks)
- the window is opened with a one-time secret; the browser then holds an
  HttpOnly, SameSite=Strict cookie, so other web pages can never use the API
- API calls must also send an X-Orange header (other sites can't send it)
- decrypted data is sent with Cache-Control: no-store, so the browser never
  writes it to its disk cache
- files from the box are served with a sandbox CSP and nosniff, so a stored
  HTML or SVG file can't run code against the desktop
"""
import json
import os
import posixpath
import secrets
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from . import __version__
from .vault import AuthError, Box, BoxError, home, norm

WEB = (Path(__file__).parent / "web").resolve()
SYSTEM = ("/.trash", "/.orange")
DEFAULT_DIRS = ("/Inbox", "/Documents", "/Projects", "/Pictures", "/Downloads", "/.trash")
SETTINGS = "/.orange/settings.json"
TRASH = "/.orange/trash.json"
MAX_JSON = 8 * 1024 * 1024

ASSET_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2",
    ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".txt": "text/plain",
    ".mjs": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json", ".wasm": "application/wasm", ".woff": "font/woff", ".ttf": "font/ttf", ".md": "text/plain; charset=utf-8",
}
PLAY_CSP = ("sandbox allow-scripts allow-modals allow-forms allow-pointer-lock; default-src 'none'; "
            "script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; img-src data: blob: 'self'; "
            "font-src data: 'self'; media-src data: blob:; connect-src 'none'")
KV_KEY = __import__("re").compile(r"^[a-z0-9_-]{1,40}$")
FILE_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
    ".bmp": "image/bmp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".avif": "image/avif",
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".ogv": "video/ogg", ".mov": "video/quicktime",
    ".mkv": "video/x-matroska", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
    ".aac": "audio/aac", ".flac": "audio/flac", ".opus": "audio/ogg", ".pdf": "application/pdf",
}
PAGE_CSP = ("default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src 'self' blob: data:; "
            "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; "
            "object-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
FILE_CSP = "sandbox; default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'"


def is_system(p):
    return any(p == s or p.startswith(s + "/") for s in SYSTEM)


def unique(box, p):
    if not box.exists(p):
        return p
    base, ext = posixpath.splitext(p)
    if box.is_dir(p) or not ext:
        base, ext = p, ""
    i = 2
    while box.exists(f"{base} ({i}){ext}"):
        i += 1
    return f"{base} ({i}){ext}"


class _Body:
    """Reads exactly Content-Length bytes from the request, so uploads stream straight into encryption."""

    def __init__(self, rfile, n):
        self.r, self.left = rfile, n

    def read(self, n=-1):
        if self.left <= 0:
            return b""
        n = self.left if n < 0 else min(n, self.left)
        data = self.r.read(n)
        if not data:
            raise ConnectionError("upload interrupted")
        self.left -= len(data)
        return data


class Desktop:
    def __init__(self, box, tracked=False):
        self.box = box
        self.name = box.name
        self.locked = False
        self.tracked = tracked
        self.token = secrets.token_urlsafe(24)
        self.cookie = secrets.token_urlsafe(32)
        self.done = threading.Event()
        self.last_seen = time.time()
        self.failures = 0
        self.started = time.time()
        self.plays = {}
        self._cpu_prev = None
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.httpd.daemon_threads = True
        self.httpd.desktop = self
        self.port = self.httpd.server_address[1]
        self.ensure_folders()

    def ensure_folders(self):
        """Boxes made by older versions get the folders the desktop expects."""
        missing = [p for p in DEFAULT_DIRS if not self.box.is_dir(p)]
        for p in missing:
            self.box.mkdir(p, save=False)
        if missing:
            self.box.save_index()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}/?t={self.token}"

    def start(self):
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def stop(self):
        if not self.locked:
            self.box.lock()
            self.locked = True
        self.httpd.shutdown()
        self.httpd.server_close()

    # ---- json documents stored inside the box ----
    def read_json(self, path, default):
        try:
            return json.loads(self.box.read_bytes(path))
        except (BoxError, ValueError):
            return default

    def write_json(self, path, data):
        self.box.write_bytes(path, json.dumps(data, separators=(",", ":")).encode())


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "Orange"
    sys_version = ""

    def log_message(self, *args):
        pass

    @property
    def d(self):
        return self.server.desktop

    @property
    def box(self):
        return self.d.box

    # ---- responses ----
    def _send(self, code, body=b"", ctype="application/json", headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj).encode())

    def _error(self, code, msg):
        self.close_connection = True  # any unread request body must not leak into the next request
        self._json({"error": msg}, code)

    def _authed(self):
        cookies = (c.strip() for c in self.headers.get("Cookie", "").split(";"))
        return f"orange={self.d.cookie}" in cookies

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_JSON:
            raise BoxError("request too large")
        raw = self.rfile.read(n) if n else b"{}"
        return json.loads(raw or b"{}")

    # ---- routing ----
    def do_GET(self):
        self._route("GET")

    def do_HEAD(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def _route(self, method):
        try:
            if self.headers.get("Host") != f"127.0.0.1:{self.d.port}":
                return self._error(421, "wrong host")
            url = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path == "/" and method == "GET":
                return self._index(q)
            if url.path.startswith("/play/") and method == "GET":
                return self._play(url.path[6:])
            if not url.path.startswith("/api/"):
                return self._static(url.path) if method == "GET" else self._error(405, "not allowed")
            if not self._authed():
                return self._error(401, "open Orange from your terminal")
            name = url.path[5:]
            if name != "file" and self.headers.get("X-Orange") != "1":
                return self._error(403, "missing header")
            if self.d.locked and name not in ("state", "unlock", "heartbeat", "shutdown"):
                return self._error(423, "locked")
            self.d.last_seen = time.time()
            fn = getattr(self, f"{method.lower()}_{name}", None)
            if not fn:
                return self._error(404, "unknown endpoint")
            body = self._body() if method == "POST" and name != "upload" else {}
            fn(q, body)
        except BoxError as e:
            self._error(400, str(e))
        except (ConnectionError, BrokenPipeError, TimeoutError):
            self.close_connection = True
        except Exception as e:  # report, never crash the desktop
            try:
                self._error(500, f"{type(e).__name__}: {e}")
            except OSError:
                self.close_connection = True

    def _index(self, q):
        headers = {"Content-Security-Policy": PAGE_CSP, "X-Frame-Options": "DENY"}
        if q.get("t") and secrets.compare_digest(q["t"], self.d.token):
            headers["Set-Cookie"] = f"orange={self.d.cookie}; HttpOnly; SameSite=Strict; Path=/"
        elif not self._authed():
            return self._send(401, b"<h1>Orange is locked</h1><p>Open it from your terminal: <code>orange</code></p>",
                              "text/html; charset=utf-8")
        self._send(200, (WEB / "index.html").read_bytes(), ASSET_TYPES[".html"], headers)

    def _static(self, path):
        rel = posixpath.normpath(unquote(path)).lstrip("/")
        target = (WEB / rel).resolve()
        if WEB not in target.parents or not target.is_file():
            return self._error(404, "not found")
        ctype = ASSET_TYPES.get(target.suffix.lower(), "application/octet-stream")
        self._send(200, target.read_bytes(), ctype, {"Cache-Control": "no-cache"})

    def _play(self, pid):
        """Studio's web preview: user code runs in a sandbox with no access to the box."""
        if not self._authed():
            return self._error(401, "not signed in")
        html = self.d.plays.get(pid)
        if html is None:
            return self._error(404, "preview expired")
        self._send(200, html.encode("utf-8"), "text/html; charset=utf-8", {"Content-Security-Policy": PLAY_CSP})

    # ---- session ----
    def get_state(self, q, b):
        files, size = (0, 0) if self.d.locked else self.box.usage()
        self._json({"name": self.d.name, "locked": self.d.locked, "version": __version__, "files": files,
                    "bytes": size, "tracked": self.d.tracked, "cipher": "AES-256-GCM",
                    "kdf": self.box.header["kdf"]["n"], "created": self.box.header.get("created", 0),
                    "platform": sys.platform})

    def post_heartbeat(self, q, b):
        self._json({"ok": True, "locked": self.d.locked})

    def post_lock(self, q, b):
        if not self.d.locked:
            self.box.lock()
            self.d.locked = True
        self._json({"ok": True})

    def post_unlock(self, q, b):
        time.sleep(min(8, self.d.failures * 1.0))  # slows down guessing
        try:
            self.d.box = Box.open(self.d.name, str(b.get("password", "")))
        except AuthError:
            self.d.failures += 1
            return self._error(403, "wrong password")
        self.d.failures = 0
        self.d.locked = False
        self.d.ensure_folders()
        self._json({"ok": True})

    def post_shutdown(self, q, b):
        self._json({"ok": True})
        self.d.done.set()

    def post_passwd(self, q, b):
        try:
            Box.open(self.d.name, str(b.get("old", "")))
        except AuthError:
            return self._error(403, "current password is wrong")
        new = str(b.get("new", ""))
        if len(new) < 6:
            return self._error(400, "new password must be at least 6 characters")
        self.box.change_password(new)
        self._json({"ok": True})

    # ---- browsing ----
    def _item(self, it):
        return {"name": it["name"], "path": it["path"], "dir": it["dir"], "size": it["size"], "mtime": it["mtime"]}

    def get_list(self, q, b):
        path = norm(q.get("path", "/"))
        if path == "/.trash" and not self.box.is_dir(path):
            return self._json({"path": path, "items": []})
        items = self.box.listdir(path)
        if path == "/.trash":
            meta = self.d.read_json(TRASH, {})
            out = []
            for it in items:
                m = meta.get(it["path"], {})
                out.append({**self._item(it), "name": m.get("name", it["name"]), "from": m.get("from", ""),
                            "deleted": m.get("at", 0), "mtime": m.get("at", it["mtime"])})
            return self._json({"path": path, "items": out})
        items = [self._item(i) for i in items if not is_system(i["path"])]
        if any(i["dir"] for i in items):
            files = self.box.files
            for i in items:
                if i["dir"]:
                    prefix = i["path"] + "/"
                    i["count"] = sum(1 for f in files if f.startswith(prefix))
        self._json({"path": path, "items": items})

    def get_dirs(self, q, b):
        self._json({"dirs": [d for d in self.box.all_dirs() if not is_system(d)]})

    def get_search(self, q, b):
        term = q.get("q", "").strip().casefold()
        if not term:
            return self._json({"items": []})
        hits = []
        for d in self.box.all_dirs():
            n = posixpath.basename(d)
            if d != "/" and not is_system(d) and term in n.casefold():
                hits.append({"name": n, "path": d, "dir": True, "size": 0, "mtime": 0})
        for f, m in list(self.box.files.items()):
            n = posixpath.basename(f)
            if not is_system(f) and term in n.casefold():
                hits.append({"name": n, "path": f, "dir": False, "size": m["size"], "mtime": m["mtime"]})
        hits.sort(key=lambda h: (h["name"].casefold().find(term), len(h["name"])))
        self._json({"items": hits[:60]})

    def get_recent(self, q, b):
        files = [(f, m) for f, m in list(self.box.files.items()) if not is_system(f)]
        files.sort(key=lambda fm: -fm[1]["mtime"])
        n = int(q.get("n", 8))
        self._json({"items": [{"name": posixpath.basename(f), "path": f, "dir": False, "size": m["size"],
                               "mtime": m["mtime"]} for f, m in files[:n]]})

    def get_stats(self, q, b):
        kinds = {}
        count = size = trash = 0
        for f, m in list(self.box.files.items()):
            if f.startswith("/.orange/"):
                continue
            if f.startswith("/.trash/"):
                trash += m["size"]
                continue
            ext = posixpath.splitext(f)[1].lower().lstrip(".")
            kinds[ext] = kinds.get(ext, 0) + m["size"]
            count += 1
            size += m["size"]
        trash_items = len(self.d.read_json(TRASH, {}))
        free = shutil.disk_usage(self.box.path).free
        self._json({"files": count, "bytes": size, "byExt": kinds, "trashBytes": trash, "trashItems": trash_items,
                    "diskFree": free, "dirs": len([d for d in self.box.all_dirs() if not is_system(d)])})

    # ---- file contents ----
    def get_file(self, q, b):
        p = norm(q.get("path", "/"))
        meta = self.box.files.get(p)
        if not meta:
            return self._error(404, "no such file")
        size = meta["size"]
        ext = posixpath.splitext(p)[1].lower()
        ctype = FILE_TYPES.get(ext, "text/plain; charset=utf-8" if q.get("text") else "application/octet-stream")
        start, end, code = 0, size - 1, 200
        rng = self.headers.get("Range", "")
        if rng.startswith("bytes=") and size:
            a, _, z = rng[6:].split(",")[0].strip().partition("-")
            if a == "":
                start = max(0, size - int(z or 0))
            else:
                start = int(a)
                end = min(int(z), size - 1) if z else size - 1
            if start > end or start >= size:
                return self._send(416, b"", "text/plain", {"Content-Range": f"bytes */{size}"})
            code = 206
        length = max(0, end - start + 1)
        name = posixpath.basename(p)
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        if ext != ".pdf":
            self.send_header("Content-Security-Policy", FILE_CSP)
        disp = "attachment" if q.get("dl") else "inline"
        self.send_header("Content-Disposition", f"{disp}; filename*=UTF-8''{quote(name)}")
        if code == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if self.command == "HEAD" or not length:
            return
        try:
            for chunk in self.box.read_range(p, start, end):
                self.wfile.write(chunk)
        except (BoxError, OSError):
            self.close_connection = True

    def post_upload(self, q, b):
        n = int(self.headers.get("Content-Length") or 0)
        p = norm(q.get("path", ""))
        if p == "/" or is_system(p):
            return self._error(400, "bad destination")
        if not q.get("replace"):
            p = unique(self.box, p)
        self.box.write_stream(p, _Body(self.rfile, n))
        self._json({"ok": True, "path": p})

    def post_write(self, q, b):
        p = norm(b["path"])
        if is_system(p):
            return self._error(400, "bad destination")
        p = unique(self.box, p) if b.get("unique") else p
        self.box.write_bytes(p, str(b.get("text", "")).encode("utf-8"))
        self._json({"ok": True, "path": p, "mtime": int(time.time())})

    # ---- organising ----
    def post_mkdir(self, q, b):
        p = norm(b["path"])
        if is_system(p):
            return self._error(400, "bad name")
        p = unique(self.box, p) if b.get("unique") else p
        self._json({"ok": True, "path": self.box.mkdir(p)})

    def post_move(self, q, b):
        src, dst = norm(b["src"]), norm(b["dst"])
        if is_system(src) or is_system(dst) or src == "/":
            return self._error(400, "not allowed")
        if self.box.is_dir(dst):
            dst = posixpath.join(dst, posixpath.basename(src))
        if dst == src:
            return self._json({"ok": True, "path": src})
        self._json({"ok": True, "path": self.box.move(src, unique(self.box, dst))})

    def post_rename(self, q, b):
        src, name = norm(b["path"]), str(b.get("name", "")).strip()
        if not name or "/" in name or "\\" in name or name in (".", "..") or is_system(src):
            return self._error(400, "that name can't be used")
        dst = posixpath.join(posixpath.dirname(src), name)
        if dst == src:
            return self._json({"ok": True, "path": src})
        if self.box.exists(dst):
            return self._error(400, f"'{name}' already exists here")
        self._json({"ok": True, "path": self.box.move(src, dst)})

    def post_duplicate(self, q, b):
        src = norm(b["path"])
        if not self.box.is_file(src):
            return self._error(400, "only files can be duplicated")
        base, ext = posixpath.splitext(src)
        dst = unique(self.box, f"{base} copy{ext}")
        self.box.write_bytes(dst, self.box.read_bytes(src))
        self._json({"ok": True, "path": dst})

    # ---- trash ----
    def post_trash(self, q, b):
        meta = self.d.read_json(TRASH, {})
        self.box.mkdir("/.trash")
        moved = []
        for p in b.get("paths", []):
            p = norm(p)
            if p == "/" or is_system(p) or not self.box.exists(p):
                continue
            tp = f"/.trash/{int(time.time() * 1000)}-{secrets.token_hex(3)}"
            self.box.move(p, tp)
            meta[tp] = {"from": p, "name": posixpath.basename(p), "at": int(time.time())}
            moved.append(tp)
        self.d.write_json(TRASH, meta)
        self._json({"ok": True, "items": moved})

    def post_restore(self, q, b):
        meta = self.d.read_json(TRASH, {})
        restored = []
        for tp in b.get("paths", []):
            tp = norm(tp)
            m = meta.pop(tp, None)
            if not m or not self.box.exists(tp):
                continue
            dst = unique(self.box, m["from"])
            restored.append(self.box.move(tp, dst))
        self.d.write_json(TRASH, meta)
        self._json({"ok": True, "items": restored})

    def post_delete(self, q, b):
        meta = self.d.read_json(TRASH, {})
        n = 0
        for p in b.get("paths", []):
            p = norm(p)
            if not p.startswith("/.trash/"):
                continue  # permanent delete only from the trash
            n += self.box.remove(p)
            meta.pop(p, None)
        self.d.write_json(TRASH, meta)
        self._json({"ok": True, "deleted": n})

    def post_emptytrash(self, q, b):
        n = self.box.remove("/.trash") if self.box.is_dir("/.trash") else 0
        self.box.mkdir("/.trash")
        self.d.write_json(TRASH, {})
        self._json({"ok": True, "deleted": n})

    # ---- settings (stored encrypted inside the box) ----
    def get_settings(self, q, b):
        self._json(self.d.read_json(SETTINGS, {}))

    def post_settings(self, q, b):
        self.d.write_json(SETTINGS, b)
        self._json({"ok": True})


    # ---- small key/value stores (game scores, learning progress), encrypted in the box ----
    def get_kv(self, q, b):
        key = q.get("key", "")
        if not KV_KEY.match(key):
            return self._error(400, "bad key")
        self._json(self.d.read_json(f"/.orange/kv/{key}.json", {}))

    def post_kv(self, q, b):
        key = str(b.get("key", ""))
        if not KV_KEY.match(key):
            return self._error(400, "bad key")
        self.d.write_json(f"/.orange/kv/{key}.json", b.get("value", {}))
        self._json({"ok": True})

    # ---- system monitor ----
    def get_sys(self, q, b):
        self._json(system_stats(self.d))

    # ---- Studio: run Python, SQL, and preview web pages ----
    def post_runpy(self, q, b):
        import tempfile
        code = str(b.get("code", ""))
        t0 = time.time()
        with tempfile.TemporaryDirectory(prefix="orange-py-") as tmp:
            try:
                r = subprocess.run([sys.executable, "-I", "-c", code], input=str(b.get("stdin", "")), capture_output=True,
                                   text=True, timeout=15, cwd=tmp, encoding="utf-8", errors="replace")
                out, err, rc = r.stdout, r.stderr, r.returncode
            except subprocess.TimeoutExpired as e:
                out, err, rc = (e.stdout or "") if isinstance(e.stdout, str) else "", "Stopped: the program ran longer than 15 seconds.", -1
        self._json({"stdout": out[-200000:], "stderr": err[-50000:], "code": rc, "ms": int((time.time() - t0) * 1000)})

    def post_sql(self, q, b):
        import sqlite3
        path = norm(str(b.get("path") or "/Projects/orange.db"))
        if is_system(path):
            return self._error(400, "bad database path")
        con = sqlite3.connect(":memory:")
        if self.box.is_file(path):
            con.deserialize(self.box.read_bytes(path))
        before = con.total_changes
        results, stmt = [], ""
        try:
            for line in str(b.get("query", "")).splitlines(True):
                stmt += line
                if sqlite3.complete_statement(stmt):
                    cur = con.execute(stmt)
                    if cur.description:
                        rows = cur.fetchmany(500)
                        results.append({"columns": [c[0] for c in cur.description], "rows": [list(r) for r in rows]})
                    else:
                        results.append({"changed": cur.rowcount})
                    stmt = ""
            if stmt.strip():
                raise sqlite3.OperationalError("incomplete statement (missing ;)")
            con.commit()
        except sqlite3.Error as e:
            return self._json({"error": str(e), "results": results})
        if con.total_changes != before or not self.box.is_file(path):
            self.box.write_bytes(path, con.serialize())
        tables = [r[0] for r in con.execute("select name from sqlite_master where type='table' order by name")]
        self._json({"results": results, "tables": tables, "path": path})

    def post_play(self, q, b):
        pid = secrets.token_urlsafe(12)
        self.d.plays[pid] = str(b.get("html", ""))[:3_000_000]
        while len(self.d.plays) > 20:
            self.d.plays.pop(next(iter(self.d.plays)))
        self._json({"url": f"/play/{pid}"})


def system_stats(desk):
    """RAM, CPU and disk numbers for the Monitor app and the in-game overlay (psutil if present)."""
    out = {"cpu": None, "ram": None, "proc": None, "disk": None, "box": desk.box.usage()[1] if not desk.locked else 0,
           "cores": os.cpu_count()}
    try:
        import psutil
        vm = psutil.virtual_memory()
        out["cpu"] = psutil.cpu_percent(interval=None)
        out["ram"] = {"total": vm.total, "used": vm.total - vm.available, "percent": vm.percent}
        out["proc"] = psutil.Process().memory_info().rss
    except ImportError:
        if sys.platform.startswith("linux"):
            info = {l.split(":")[0]: int(l.split()[1]) * 1024 for l in open("/proc/meminfo") if l.split()[1].isdigit()}
            total, avail = info.get("MemTotal", 0), info.get("MemAvailable", 0)
            out["ram"] = {"total": total, "used": total - avail, "percent": round(100 * (total - avail) / max(total, 1), 1)}
            f = [int(v) for v in open("/proc/stat").readline().split()[1:]]
            idle, tot = f[3] + f[4], sum(f)
            if desk._cpu_prev:
                di, dt = idle - desk._cpu_prev[0], tot - desk._cpu_prev[1]
                out["cpu"] = round(100 * (1 - di / max(dt, 1)), 1)
            desk._cpu_prev = (idle, tot)
            out["proc"] = int(open("/proc/self/statm").read().split()[1]) * os.sysconf("SC_PAGE_SIZE")
        elif sys.platform == "win32":
            import ctypes

            class MS(ctypes.Structure):
                _fields_ = [("l", ctypes.c_ulong), ("load", ctypes.c_ulong), ("total", ctypes.c_ulonglong), ("avail", ctypes.c_ulonglong),
                            ("tp", ctypes.c_ulonglong), ("ap", ctypes.c_ulonglong), ("tv", ctypes.c_ulonglong), ("av", ctypes.c_ulonglong), ("e", ctypes.c_ulonglong)]
            m = MS(); m.l = ctypes.sizeof(MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            out["ram"] = {"total": m.total, "used": m.total - m.avail, "percent": m.load}
            ft = [ctypes.c_ulonglong() for _ in range(3)]
            ctypes.windll.kernel32.GetSystemTimes(*[ctypes.byref(x) for x in ft])
            idle, total = ft[0].value, ft[1].value + ft[2].value
            if desk._cpu_prev:
                di, dt = idle - desk._cpu_prev[0], total - desk._cpu_prev[1]
                out["cpu"] = round(100 * (1 - di / max(dt, 1)), 1)
            desk._cpu_prev = (idle, total)
    du = shutil.disk_usage(desk.box.path)
    out["disk"] = {"total": du.total, "free": du.free}
    return out


# ---------------------------------------------------------------- launching
def find_browser():
    override = os.environ.get("ORANGE_BROWSER")
    if override:
        return override
    cands = []
    if sys.platform == "win32":
        for env in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
            base = os.environ.get(env)
            if base:
                cands += [os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                          os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"),
                          os.path.join(base, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")]
    elif sys.platform == "darwin":
        cands += ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
                  "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    else:
        for n in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
                  "microsoft-edge", "microsoft-edge-stable", "brave-browser"):
            w = shutil.which(n)
            if w:
                cands.append(w)
    return next((c for c in cands if os.path.isfile(c)), None)


def run_desktop(box, fullscreen=True, on_ready=None):
    """Open the Orange desktop and block until it is closed. Returns False if no window could be opened."""
    desk = Desktop(box)
    desk.start()
    exe = find_browser()
    proc = None
    if exe:
        profile = home() / "desktop-profile"
        args = [exe, f"--app={desk.url}", f"--user-data-dir={profile}", "--no-first-run",
                "--no-default-browser-check", "--disable-sync", "--disable-extensions",
                "--disable-features=Translate,AutofillServerCommunication", "--window-size=1440,900",
                "--hide-crash-restore-bubble", "--disable-session-crashed-bubble", "--noerrdialogs",
                "--start-fullscreen" if fullscreen else "--start-maximized"]
        try:
            proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            desk.tracked = True
        except OSError:
            proc = None
    if not proc and not webbrowser.open(desk.url):
        desk.stop()
        return False
    if on_ready:
        on_ready(desk)
    launched = time.time()
    try:
        while not desk.done.wait(0.5):
            if proc and proc.poll() is not None:
                if time.time() - launched > 5:
                    break  # the Orange window was closed
                proc, desk.tracked = None, False  # handed to an already-running browser: use heartbeats
            if not proc and time.time() - desk.last_seen > 180:
                break  # window gone (no heartbeat for 3 minutes)
    except KeyboardInterrupt:
        pass
    finally:
        desk.stop()
        if proc and proc.poll() is None:
            try:
                proc.wait(4)  # the page closes its own window after "Shut down"
            except subprocess.TimeoutExpired:
                proc.terminate()
    return True
