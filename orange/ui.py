"""Terminal colours and the Orange banner. Works in Linux/macOS terminals and Windows cmd/PowerShell."""
import os
import sys

_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")

if os.name == "nt":
    os.system("")  # turns on ANSI colour support in Windows cmd / PowerShell
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _c(code):
    return (lambda s: f"\033[{code}m{s}\033[0m") if _COLOR else (lambda s: s)


orange = _c("38;5;208")
bold_orange = _c("1;38;5;208")
green = _c("32")
red = _c("31")
dim = _c("2")
bold = _c("1")

BANNER = r"""
  ██████  ██████   █████  ███    ██  ██████  ███████
 ██    ██ ██   ██ ██   ██ ████   ██ ██       ██
 ██    ██ ██████  ███████ ██ ██  ██ ██   ███ █████
 ██    ██ ██   ██ ██   ██ ██  ██ ██ ██    ██ ██
  ██████  ██   ██ ██   ██ ██   ████  ██████  ███████
"""

BANNER_ASCII = r"""
   ___  ____      _    _   _  ____ _____
  / _ \|  _ \    / \  | \ | |/ ___| ____|
 | | | | |_) |  / _ \ |  \| | |  _|  _|
 | |_| |  _ <  / ___ \| |\  | |_| | |___
  \___/|_| \_\/_/   \_\_| \_|\____|_____|
"""


def banner(subtitle="your encrypted computer inside a computer"):
    try:
        print(bold_orange(BANNER))
    except UnicodeEncodeError:
        print(bold_orange(BANNER_ASCII))
    print("  " + orange(subtitle) + "\n")


def ok(msg):
    print(green("  ✔ ") + msg if _safe("✔") else green("  [ok] ") + msg)


def err(msg):
    print(red("  ✘ ") + msg if _safe("✘") else red("  [x] ") + msg, file=sys.stderr)


def info(msg):
    print(orange("  ● ") + msg if _safe("●") else orange("  * ") + msg)


def _safe(ch):
    try:
        ch.encode(sys.stdout.encoding or "utf-8")
        return True
    except (UnicodeEncodeError, LookupError):
        return False


def human_size(n):
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
