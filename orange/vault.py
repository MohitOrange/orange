"""The Orange Box: an encrypted virtual drive stored on the host computer.

Layout on disk (default ~/.orange, override with ORANGE_HOME):

    boxes/<id>/box.json     header: name, scrypt salt/params, wrapped master key
    boxes/<id>/index.enc    encrypted file tree (names, sizes, folders)
    boxes/<id>/blobs/*.obx  encrypted file contents, in 4 MB chunks

A random 256-bit master key encrypts everything. The password only unlocks
(wraps) that key, so changing the password is instant. Nothing inside the box
- not even file names - is readable without the password.
"""
import base64
import hashlib
import json
import os
import posixpath
import secrets
import shutil
import struct
import threading
import time
from functools import wraps
from pathlib import Path

from .crypto import InvalidTag, derive_key, seal, unseal

VERSION = 1
CHUNK = 4 * 1024 * 1024
MAGIC = b"ORB1"


def home():
    return Path(os.environ.get("ORANGE_HOME") or Path.home() / ".orange")


def boxes_dir():
    return home() / "boxes"


class AuthError(Exception):
    pass


class BoxError(Exception):
    pass


def _b64(b):
    return base64.b64encode(b).decode()


def _unb64(s):
    return base64.b64decode(s)


def _atomic_write(path, data):
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def box_dir(name):
    return boxes_dir() / hashlib.sha256(name.strip().lower().encode()).hexdigest()[:24]


def box_exists(name):
    return (box_dir(name) / "box.json").exists()


def list_boxes():
    out = []
    if boxes_dir().exists():
        for d in sorted(boxes_dir().iterdir()):
            try:
                out.append(json.loads((d / "box.json").read_text())["name"])
            except Exception:
                continue
    return out


def _locked(fn):
    @wraps(fn)
    def inner(self, *a, **kw):
        with self._mx:
            return fn(self, *a, **kw)
    return inner


def norm(path, cwd="/"):
    p = posixpath.normpath(posixpath.join(cwd, path.replace("\\", "/")))
    p = "/" + p.lstrip("/")
    return p


class Box:
    def __init__(self, path, header, master_key, index):
        self.path = Path(path)
        self.header = header
        self.name = header["name"]
        self._key = master_key
        self.index = index  # {"dirs": [...], "files": {path: {id,size,mtime}}}
        self._dirs = set(index["dirs"])
        self._mx = threading.RLock()

    # ---------- create / open ----------
    @classmethod
    def create(cls, name, password):
        name = name.strip()
        if not name:
            raise BoxError("name cannot be empty")
        d = box_dir(name)
        if (d / "box.json").exists():
            raise BoxError(f"a box named '{name}' already exists")
        (d / "blobs").mkdir(parents=True, exist_ok=True)
        master = secrets.token_bytes(32)
        header = {
            "version": VERSION,
            "name": name,
            "created": int(time.time()),
            "cipher": "AES-256-GCM",
        }
        header.update(cls._wrap(master, password))
        index = {"dirs": ["/"], "files": {}}
        box = cls(d, header, master, index)
        for folder in ("/Inbox", "/Documents", "/Projects", "/Pictures", "/Downloads"):
            box.mkdir(folder, save=False)
        box.save_index()
        _atomic_write(d / "box.json", json.dumps(header, indent=2).encode())
        return box

    @staticmethod
    def _wrap(master, password):
        salt = secrets.token_bytes(16)
        from .crypto import KDF_N, KDF_P, KDF_R

        kek = derive_key(password, salt)
        return {
            "kdf": {"name": "scrypt", "salt": _b64(salt), "n": KDF_N, "r": KDF_R, "p": KDF_P},
            "wrapped_key": _b64(seal(kek, master, b"orange-master-key")),
        }

    @classmethod
    def open(cls, name, password):
        d = box_dir(name)
        try:
            header = json.loads((d / "box.json").read_text())
        except FileNotFoundError:
            raise BoxError(f"no box named '{name}'") from None
        k = header["kdf"]
        kek = derive_key(password, _unb64(k["salt"]), k["n"], k["r"], k["p"])
        try:
            master = unseal(kek, _unb64(header["wrapped_key"]), b"orange-master-key")
        except InvalidTag:
            raise AuthError("wrong name or password") from None
        index = json.loads(unseal(master, (d / "index.enc").read_bytes(), b"orange-index"))
        return cls(d, header, master, index)

    def change_password(self, new_password):
        self.header.update(self._wrap(self._key, new_password))
        _atomic_write(self.path / "box.json", json.dumps(self.header, indent=2).encode())

    @_locked
    def lock(self):
        self._key = None
        self.index = {"dirs": [], "files": {}}
        self._dirs = set()

    @_locked
    def save_index(self):
        self.index["dirs"] = sorted(self._dirs)
        data = json.dumps(self.index, separators=(",", ":")).encode()
        _atomic_write(self.path / "index.enc", seal(self._key, data, b"orange-index"))

    # ---------- queries ----------
    @property
    def files(self):
        return self.index["files"]

    def is_dir(self, p):
        return norm(p) in self._dirs

    def is_file(self, p):
        return norm(p) in self.files

    def exists(self, p):
        return self.is_dir(p) or self.is_file(p)

    @_locked
    def listdir(self, p="/"):
        p = norm(p)
        if p not in self._dirs:
            raise BoxError(f"not a folder: {p}")
        prefix = p.rstrip("/") + "/"
        items = []
        for d in self._dirs:
            if d != p and posixpath.dirname(d) == p:
                items.append({"name": posixpath.basename(d), "path": d, "dir": True, "size": 0, "mtime": 0})
        for f, meta in self.files.items():
            if f.startswith(prefix) and "/" not in f[len(prefix):]:
                items.append({"name": posixpath.basename(f), "path": f, "dir": False,
                              "size": meta["size"], "mtime": meta["mtime"]})
        items.sort(key=lambda i: (not i["dir"], i["name"].lower()))
        return items

    @_locked
    def walk_files(self, p):
        prefix = norm(p).rstrip("/") + "/"
        return [f for f in self.files if f.startswith(prefix)]

    @_locked
    def all_dirs(self):
        return sorted(self._dirs)

    @_locked
    def usage(self):
        return len(self.files), sum(m["size"] for m in self.files.values())

    # ---------- folders ----------
    @_locked
    def mkdir(self, p, save=True):
        p = norm(p)
        if p in self.files:
            raise BoxError(f"a file already exists at {p}")
        parts = p.strip("/").split("/") if p != "/" else []
        cur = ""
        for part in parts:
            cur += "/" + part
            if cur in self.files:
                raise BoxError(f"a file already exists at {cur}")
            self._dirs.add(cur)
        if save:
            self.save_index()
        return p

    # ---------- file contents ----------
    def _blob(self, blob_id):
        return self.path / "blobs" / f"{blob_id}.obx"

    def _aad(self, blob_id, i, final):
        return blob_id.encode() + struct.pack(">QB", i, final)

    def write_stream(self, p, stream, progress=None, save=True):
        p = norm(p)
        if p in self._dirs:
            raise BoxError(f"{p} is a folder")
        blob_id = secrets.token_hex(16)
        size, i = 0, 0
        tmp = self._blob(blob_id).with_suffix(".tmp")
        with open(tmp, "wb") as out:
            out.write(MAGIC)
            chunk = stream.read(CHUNK)
            while True:
                nxt = stream.read(CHUNK) if chunk else b""
                final = 0 if nxt else 1
                ct = seal(self._key, chunk, self._aad(blob_id, i, final))
                out.write(struct.pack(">I", len(ct)) + ct)
                size += len(chunk)
                i += 1
                if progress:
                    progress(size)
                if final:
                    break
                chunk = nxt
        os.replace(tmp, self._blob(blob_id))
        with self._mx:
            if p in self._dirs:
                self._blob(blob_id).unlink(missing_ok=True)
                raise BoxError(f"{p} is a folder")
            self.mkdir(posixpath.dirname(p), save=False)
            old = self.files.get(p)
            self.files[p] = {"id": blob_id, "size": size, "mtime": int(time.time())}
            if save:
                self.save_index()
        if old:
            self._blob(old["id"]).unlink(missing_ok=True)
        return size

    def write_bytes(self, p, data, save=True):
        import io

        return self.write_stream(p, io.BytesIO(data), save=save)

    def read_iter(self, p):
        p = norm(p)
        meta = self.files.get(p)
        if not meta:
            raise BoxError(f"no such file: {p}")
        blob_id = meta["id"]
        with open(self._blob(blob_id), "rb") as f:
            if f.read(4) != MAGIC:
                raise BoxError("corrupted file")
            i = 0
            while True:
                hdr = f.read(4)
                if len(hdr) < 4:
                    raise BoxError("file is truncated or was tampered with")
                ct = f.read(struct.unpack(">I", hdr)[0])
                for final in (0, 1):
                    try:
                        data = unseal(self._key, ct, self._aad(blob_id, i, final))
                        break
                    except InvalidTag:
                        data = None
                if data is None:
                    raise BoxError("file failed integrity check (tampered?)")
                yield data
                if final:
                    return
                i += 1

    def read_range(self, p, start, end):
        """Yield the plaintext bytes start..end (inclusive), decrypting only the chunks needed."""
        p = norm(p)
        meta = self.files.get(p)
        if not meta:
            raise BoxError(f"no such file: {p}")
        size, blob_id = meta["size"], meta["id"]
        if size == 0 or start > end:
            return
        chunks = max(1, -(-size // CHUNK))
        first, last = start // CHUNK, min(end // CHUNK, chunks - 1)
        record = 4 + 12 + CHUNK + 16
        with open(self._blob(blob_id), "rb") as f:
            f.seek(4 + first * record)
            for i in range(first, last + 1):
                n = struct.unpack(">I", f.read(4))[0]
                try:
                    data = unseal(self._key, f.read(n), self._aad(blob_id, i, 1 if i == chunks - 1 else 0))
                except InvalidTag:
                    raise BoxError("file failed integrity check (tampered?)") from None
                lo = start - i * CHUNK if i == first else 0
                hi = end - i * CHUNK + 1 if i == last else len(data)
                yield data[lo:hi]

    def read_bytes(self, p):
        return b"".join(self.read_iter(p))

    # ---------- host <-> box ----------
    def import_path(self, src, dest_dir="/", progress=None):
        """Copy a host file or folder into the box. Returns number of files added."""
        src = Path(src)
        dest_dir = self.mkdir(dest_dir, save=False)
        count = 0
        if src.is_dir():
            for root, _dirs, fnames in os.walk(src):
                rel = Path(root).relative_to(src.parent).as_posix()
                self.mkdir(posixpath.join(dest_dir, rel), save=False)
                for fn in fnames:
                    with open(Path(root) / fn, "rb") as fh:
                        self.write_stream(posixpath.join(dest_dir, rel, fn), fh, progress, save=False)
                    count += 1
        elif src.is_file():
            with open(src, "rb") as fh:
                self.write_stream(posixpath.join(dest_dir, src.name), fh, progress, save=False)
            count = 1
        else:
            raise BoxError(f"not found on computer: {src}")
        self.save_index()
        return count

    def export_path(self, p, dest):
        """Copy a box file/folder out to the host. Returns number of files written."""
        p = norm(p)
        dest = Path(dest)
        if p in self.files:
            target = dest / posixpath.basename(p) if dest.is_dir() else dest
            target.parent.mkdir(parents=True, exist_ok=True)
            with open(target, "wb") as out:
                for chunk in self.read_iter(p):
                    out.write(chunk)
            return 1
        if p in self._dirs:
            base = dest / (posixpath.basename(p) or self.name)
            count = 0
            for d in self._dirs:
                if d == p or d.startswith(p.rstrip("/") + "/"):
                    (base / d[len(p):].lstrip("/")).mkdir(parents=True, exist_ok=True)
            for f in self.walk_files(p):
                target = base / f[len(p):].lstrip("/")
                with open(target, "wb") as out:
                    for chunk in self.read_iter(f):
                        out.write(chunk)
                count += 1
            return count
        raise BoxError(f"no such file or folder: {p}")

    # ---------- edit tree ----------
    @_locked
    def remove(self, p):
        p = norm(p)
        if p == "/":
            raise BoxError("cannot delete the root folder")
        if p in self.files:
            meta = self.files.pop(p)
            self.save_index()
            self._blob(meta["id"]).unlink(missing_ok=True)
            return 1
        if p in self._dirs:
            victims = self.walk_files(p)
            metas = [self.files.pop(f) for f in victims]
            self._dirs = {d for d in self._dirs if d != p and not d.startswith(p + "/")}
            self.save_index()
            for m in metas:
                self._blob(m["id"]).unlink(missing_ok=True)
            return len(victims)
        raise BoxError(f"no such file or folder: {p}")

    @_locked
    def move(self, src, dst):
        src, dst = norm(src), norm(dst)
        if dst in self._dirs:
            dst = posixpath.join(dst, posixpath.basename(src))
        if self.exists(dst):
            raise BoxError(f"already exists: {dst}")
        if src in self.files:
            self.mkdir(posixpath.dirname(dst), save=False)
            self.files[dst] = self.files.pop(src)
        elif src in self._dirs and src != "/":
            if dst.startswith(src + "/"):
                raise BoxError("cannot move a folder into itself")
            self.mkdir(posixpath.dirname(dst), save=False)
            self._dirs = {dst + d[len(src):] if d == src or d.startswith(src + "/") else d for d in self._dirs}
            for f in self.walk_files(src):
                self.files[dst + f[len(src):]] = self.files.pop(f)
        else:
            raise BoxError(f"no such file or folder: {src}")
        self.save_index()
        return dst


def delete_box(name):
    shutil.rmtree(box_dir(name))
