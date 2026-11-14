import os

import pytest

from orange.vault import AuthError, Box, BoxError, list_boxes


@pytest.fixture(autouse=True)
def tmp_home(tmp_path, monkeypatch):
    monkeypatch.setenv("ORANGE_HOME", str(tmp_path / "home"))
    return tmp_path


def test_create_open_and_wrong_password():
    Box.create("mohit", "secret123")
    assert list_boxes() == ["mohit"]
    assert Box.open("Mohit", "secret123").name == "mohit"
    with pytest.raises(AuthError):
        Box.open("mohit", "nope-nope")


def test_files_roundtrip_large_and_encrypted_on_disk(tmp_path):
    box = Box.create("a", "secret123")
    data = os.urandom(9 * 1024 * 1024 + 7)  # spans 3 chunks
    box.write_bytes("/Documents/big.bin", data)
    box.write_bytes("/hello.txt", b"top secret words")
    box.write_bytes("/empty", b"")
    box2 = Box.open("a", "secret123")
    assert box2.read_bytes("/Documents/big.bin") == data
    assert box2.read_bytes("/empty") == b""
    raw = b"".join(p.read_bytes() for p in box.path.rglob("*") if p.is_file())
    assert b"top secret" not in raw and b"hello.txt" not in raw


def test_tamper_detected():
    box = Box.create("t", "secret123")
    box.write_bytes("/x.txt", b"hello world")
    blob = box.path / "blobs" / (box.files["/x.txt"]["id"] + ".obx")
    b = bytearray(blob.read_bytes()); b[-1] ^= 1; blob.write_bytes(bytes(b))
    with pytest.raises(BoxError):
        box.read_bytes("/x.txt")


def test_import_export_move_remove(tmp_path):
    src = tmp_path / "proj"; (src / "sub").mkdir(parents=True)
    (src / "a.py").write_text("print(1)"); (src / "sub" / "b.txt").write_text("b")
    box = Box.create("m", "secret123")
    assert box.import_path(src, "/Projects") == 2
    assert box.read_bytes("/Projects/proj/sub/b.txt") == b"b"
    box.move("/Projects/proj", "/Projects/renamed")
    assert box.is_file("/Projects/renamed/a.py") and not box.exists("/Projects/proj")
    out = tmp_path / "out"; out.mkdir()
    assert box.export_path("/Projects/renamed", out) == 2
    assert (out / "renamed" / "sub" / "b.txt").read_text() == "b"
    assert box.remove("/Projects") == 2
    assert not list((box.path / "blobs").iterdir())


def test_change_password():
    box = Box.create("p", "secret123")
    box.write_bytes("/f", b"1")
    box.change_password("newpass99")
    with pytest.raises(AuthError):
        Box.open("p", "secret123")
    assert Box.open("p", "newpass99").read_bytes("/f") == b"1"
