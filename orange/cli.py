"""`orange` command line entry point."""
import argparse
import getpass
import sys
import time

from . import __version__, ui
from .vault import AuthError, Box, BoxError, box_exists, delete_box, home, list_boxes

MIN_PASSWORD = 6


def ask_name(prompt="name"):
    while True:
        name = input(ui.orange(f"  {prompt}: ")).strip()
        if name and len(name) <= 64:
            return name
        ui.err("please enter a name (1-64 characters)")


def ask_new_password():
    while True:
        p1 = getpass.getpass(ui.orange("  password: "))
        if len(p1) < MIN_PASSWORD:
            ui.err(f"password must be at least {MIN_PASSWORD} characters")
            continue
        p2 = getpass.getpass(ui.orange("  confirm password: "))
        if p1 != p2:
            ui.err("passwords do not match, try again")
            continue
        return p1


def create_flow():
    ui.info("let's create your Orange box\n")
    while True:
        name = ask_name()
        if not box_exists(name):
            break
        ui.err(f"a box named '{name}' already exists. pick another name")
    password = ask_new_password()
    t = time.time()
    box = Box.create(name, password)
    print()
    ui.ok(f"Orange box created for {ui.bold(name)} in {time.time() - t:.2f}s")
    ui.ok("everything inside is encrypted with AES-256-GCM")
    ui.info(ui.dim("there is NO password recovery. if you forget it, the data is gone."))
    return box


def login_flow(name=None):
    for attempt in range(1, 4):
        n = name or ask_name()
        pw = getpass.getpass(ui.orange("  password: "))
        try:
            t = time.time()
            box = Box.open(n, pw)
            ui.ok(f"unlocked in {time.time() - t:.2f}s")
            return box
        except (AuthError, BoxError):
            ui.err("wrong name or password")
            time.sleep(attempt)  # slows down guessing
    ui.err("too many attempts")
    sys.exit(1)


def enter(box, mode):
    from .gui import gui_available, run_gui
    from .shell import run_shell

    if mode == "shell" or (mode == "auto" and not gui_available()):
        if mode == "auto":
            ui.info("no desktop display found, opening the Orange terminal")
        run_shell(box)
    else:
        ui.info("opening your Orange window…  (close it to lock)")
        run_gui(box)
        ui.ok("box locked")


def cmd_install(_a):
    ui.banner("installing Orange")
    from .crypto import derive_key, seal, unseal
    import os

    t = time.time()
    (home() / "boxes").mkdir(parents=True, exist_ok=True)
    ui.ok(f"Orange home: {home()}")
    key = derive_key("self-test", os.urandom(16))
    assert unseal(key, seal(key, b"orange")) == b"orange"
    ui.ok("encryption engine (scrypt + AES-256-GCM) self-test passed")
    from .gui import gui_available
    if gui_available():
        ui.ok("desktop window support found")
    else:
        ui.info("no desktop window support here — the Orange terminal will be used instead")
    ui.ok(f"Orange {__version__} installed in {time.time() - t:.2f}s\n")
    print("  next: type " + ui.bold_orange("orange") + " and press Enter to create your box\n")


def cmd_default(a):
    ui.banner()
    boxes = list_boxes()
    if not boxes:
        box = create_flow()
        print("\n  type " + ui.bold_orange("orange") + " again any time to open it\n")
        if input(ui.orange("  open your box now? [Y/n] ")).strip().lower() in ("", "y", "yes"):
            enter(box, a.mode)
        return
    enter(login_flow(), a.mode)


def cmd_new(a):
    ui.banner("new box")
    create_flow()


def cmd_shell(a):
    ui.banner()
    enter(login_flow(), "shell")


def cmd_window(a):
    ui.banner()
    enter(login_flow(), "window")


def cmd_list(_a):
    boxes = list_boxes()
    if not boxes:
        ui.info("no boxes yet. run: orange")
    for b in boxes:
        print("  " + ui.orange("■ ") + b)


def cmd_passwd(_a):
    ui.banner("change password")
    box = login_flow()
    print(ui.dim("  choose a new password"))
    box.change_password(ask_new_password())
    ui.ok("password changed")


def cmd_destroy(_a):
    ui.banner("delete a box")
    box = login_flow()
    name = box.name
    box.lock()
    if input(ui.red(f"  type '{name}' to permanently delete this box and ALL its files: ")).strip() == name:
        delete_box(name)
        ui.ok("box deleted")
    else:
        ui.info("cancelled")


def main(argv=None):
    p = argparse.ArgumentParser(prog="orange", description="Orange — an encrypted computer inside your computer.")
    p.add_argument("--version", action="version", version=f"orange {__version__}")
    p.add_argument("--shell", dest="mode", action="store_const", const="shell", default="auto",
                   help="use the terminal instead of the window")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("install", help="set up Orange on this computer")
    sub.add_parser("new", help="create another box")
    sub.add_parser("shell", help="unlock a box in the terminal")
    sub.add_parser("window", help="unlock a box in the desktop window")
    sub.add_parser("list", help="list boxes on this computer")
    sub.add_parser("passwd", help="change a box password")
    sub.add_parser("destroy", help="permanently delete a box")
    a = p.parse_args(argv)
    handlers = {"install": cmd_install, "new": cmd_new, "shell": cmd_shell, "window": cmd_window,
                "list": cmd_list, "passwd": cmd_passwd, "destroy": cmd_destroy}
    try:
        handlers.get(a.cmd, cmd_default)(a)
    except (KeyboardInterrupt, EOFError):
        print()
        ui.info("bye")
    except BoxError as e:
        ui.err(str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
