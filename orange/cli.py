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


def _settings(box):
    import json

    try:
        return json.loads(box.read_bytes("/.orange/settings.json"))
    except (BoxError, ValueError):
        return {}


def _has_display():
    import os

    if sys.platform.startswith("linux"):
        return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    return True


def enter(box, mode, windowed=False):
    from .gui import gui_available, run_gui
    from .shell import run_shell

    if mode == "shell" or not _has_display():
        if mode != "shell":
            ui.info("no desktop display found, opening the Orange terminal")
        run_shell(box)
        return
    if mode != "classic":
        from .server import run_desktop

        fullscreen = not windowed and _settings(box).get("immersive", True)

        def ready(desk):
            ui.ok("Orange desktop is open " + ui.dim(f"(local only, port {desk.port})"))
            print("  " + ui.dim("close the Orange window, choose Shut down, or press Ctrl+C here to lock"))

        if run_desktop(box, fullscreen=fullscreen, on_ready=ready):
            ui.ok("box locked. see you soon")
            return
        ui.info("couldn't open the desktop, falling back")
    if gui_available():
        ui.info("opening the classic Orange window…  (close it to lock)")
        run_gui(box)
        ui.ok("box locked")
    else:
        run_shell(box)


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
    from .server import find_browser

    browser = find_browser()
    if browser:
        low = browser.lower()
        name = next((n for k, n in (("edge", "Microsoft Edge"), ("brave", "Brave"), ("chromium", "Chromium"), ("chrome", "Google Chrome")) if k in low), os.path.basename(browser))
        ui.ok(f"desktop engine: {name} (opens Orange as its own full-screen app)")
    elif _has_display():
        ui.info("no Edge or Chrome found: the Orange desktop will open in your default browser")
    else:
        ui.info("no screen here: the Orange terminal will be used instead")
    reopen = ensure_on_path()
    ui.ok(f"Orange {__version__} installed in {time.time() - t:.2f}s\n")
    if reopen:
        print("  next: " + ui.bold("close this window, open a new terminal") + ", type "
              + ui.bold_orange("orange") + " and press Enter\n")
    else:
        print("  next: type " + ui.bold_orange("orange") + " and press Enter to create your box\n")


def _scripts_dirs():
    import os
    import site
    import sysconfig

    dirs = [sysconfig.get_path("scripts")]
    for scheme in (f"{os.name}_user", "posix_user", "osx_framework_user"):
        try:
            dirs.append(sysconfig.get_path("scripts", scheme))
        except KeyError:
            pass
    ver = f"Python{sys.version_info[0]}{sys.version_info[1]}"
    base = site.getuserbase()
    dirs += [os.path.join(base, ver, "Scripts"), os.path.join(base, "Scripts"), os.path.join(base, "bin")]
    return [d for d in dict.fromkeys(dirs) if d]


def ensure_on_path():
    """Make sure the `orange` command can be found. Returns True if a new terminal is needed."""
    import os
    import shutil

    if shutil.which("orange"):
        ui.ok("'orange' command is ready")
        return False
    exe = "orange.exe" if os.name == "nt" else "orange"
    folder = next((d for d in _scripts_dirs() if os.path.isfile(os.path.join(d, exe))), None)
    if not folder:
        ui.info("could not find the 'orange' command file. you can always run: python -m orange")
        return False
    if os.name != "nt":
        ui.info(f"add this line to your ~/.bashrc or ~/.zshrc, then open a new terminal:")
        print(f'      export PATH="{folder}:$PATH"')
        return True
    import ctypes
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0,
                        winreg.KEY_READ | winreg.KEY_WRITE) as key:
        try:
            current, kind = winreg.QueryValueEx(key, "Path")
        except FileNotFoundError:
            current, kind = "", winreg.REG_EXPAND_SZ
        parts = [p for p in current.split(";") if p]
        if folder.lower().rstrip("\\") not in [p.lower().rstrip("\\") for p in parts]:
            winreg.SetValueEx(key, "Path", 0, kind, ";".join(parts + [folder]))
    # tell Windows the PATH changed, so new terminals see it
    ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x1A, 0, "Environment", 2, 5000, None)
    ui.ok(f"added the 'orange' command to your PATH ({folder})")
    ui.info("new terminal windows will find 'orange'. to use it in THIS window right now, paste:")
    print(f"      set PATH=%PATH%;{folder}")
    return True


def cmd_default(a):
    ui.banner()
    boxes = list_boxes()
    if not boxes:
        box = create_flow()
        print("\n  type " + ui.bold_orange("orange") + " again any time to open it\n")
        if input(ui.orange("  open your box now? [Y/n] ")).strip().lower() in ("", "y", "yes"):
            enter(box, a.mode, a.windowed)
        return
    enter(login_flow(), a.mode, a.windowed)


def cmd_new(a):
    ui.banner("new box")
    create_flow()


def cmd_shell(a):
    ui.banner()
    enter(login_flow(), "shell")


def cmd_window(a):
    ui.banner()
    enter(login_flow(), "auto", a.windowed)


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
                   help="use the terminal instead of the desktop")
    p.add_argument("--classic", dest="mode", action="store_const", const="classic",
                   help="use the simple classic window")
    p.add_argument("--windowed", action="store_true", help="open the desktop in a window, not full screen")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("install", help="set up Orange on this computer")
    sub.add_parser("new", help="create another box")
    sub.add_parser("shell", help="unlock a box in the terminal")
    sub.add_parser("window", help="unlock a box and open the desktop")
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
