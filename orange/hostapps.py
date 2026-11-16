"""The apps installed on this computer, for Orange's Computer app.

Windows: the Start menu's own list (Get-StartApps), with icons drawn by the Windows shell.
macOS:   the .app bundles in the Applications folders.
Linux:   the desktop entries (*.desktop) from the standard XDG folders, with icons from the icon theme.

An app is only ever started by an id taken from this list. The page never sends a command or a path,
so nothing typed into Orange can be turned into a program to run.
"""
import base64
import hashlib
import json
import os
import plistlib
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
JUNK = re.compile(r"\b(uninstall\w*|readme|read me|release notes|licen[cs]e|help|documentation|manual|web ?site|support|changelog|what'?s new)\b", re.I)
GROUPS = [
    ("Internet", "chrome edge firefox brave opera browser mail outlook thunderbird teams zoom skype whatsapp telegram discord slack"),
    ("Office", "word excel powerpoint onenote office libreoffice writer calc impress notepad wordpad pdf acrobat reader sticky notes onedrive"),
    ("Code", "code visual studio pycharm intellij android unity git python node terminal powershell command prompt cmd idle jupyter sublime eclipse docker postman"),
    ("Media", "photos camera paint media player vlc spotify music video movies tv clipchamp gimp inkscape audacity obs blender photoshop premiere snipping sound recorder"),
    ("Games", "game steam epic xbox minecraft roblox solitaire"),
    ("System", "settings control panel task manager file explorer files calculator clock alarm calendar maps weather store disk registry device manager system remote desktop"),
]
XDG_GROUPS = [("Code", "Development IDE"), ("Internet", "Network WebBrowser Email Chat InstantMessaging"), ("Office", "Office WordProcessor Spreadsheet Presentation"),
              ("Media", "AudioVideo Audio Video Graphics Photography Player"), ("Games", "Game"), ("System", "System Settings Utility FileManager")]


def group_of(name, categories=""):
    cats = set(categories.split(";"))
    for g, words in XDG_GROUPS:
        if cats & set(words.split()):
            return g
    low = name.lower()
    for g, words in GROUPS:
        if any(re.search(r"\b" + re.escape(w), low) for w in words.split()):
            return g
    return "Apps"


def app_id(kind, target):
    return hashlib.sha1(f"{kind}:{target}".encode("utf-8", "replace")).hexdigest()[:12]


class HostApps:
    def __init__(self):
        self.apps, self.at, self.icons, self.icon_state = {}, 0, {}, "idle"
        self.lock = threading.Lock()

    # ---------------------------------------------------------------- the list
    def listing(self, refresh=False):
        with self.lock:
            if refresh or not self.apps or time.time() - self.at > 600:
                found = {}
                try:
                    found = {"win32": windows_apps, "darwin": mac_apps}.get(sys.platform, linux_apps)()
                except Exception:   # a broken shortcut or registry entry must never break the desktop
                    found = {}
                self.apps, self.at = found, time.time()
                if sys.platform == "win32" and self.icon_state == "idle" and found:
                    self.icon_state = "loading"
                    threading.Thread(target=self._windows_icons, daemon=True).start()
        apps = sorted(({"id": a["id"], "name": a["name"], "group": a["group"]} for a in self.apps.values()), key=lambda a: a["name"].lower())
        return {"platform": sys.platform, "apps": apps, "icons": self.icon_state}

    # ---------------------------------------------------------------- opening one
    def launch(self, aid):
        a = self.apps.get(aid)
        if not a:
            raise KeyError(aid)
        kind, target = a["kind"], a["target"]
        if kind == "win":
            subprocess.Popen(["explorer.exe", "shell:AppsFolder\\" + target], creationflags=NO_WINDOW)
        elif kind == "lnk":
            os.startfile(target)   # noqa: only on Windows
        elif kind == "mac":
            subprocess.Popen(["open", target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.Popen(desktop_command(a["entry"]), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             stdin=subprocess.DEVNULL, start_new_session=True, cwd=a["entry"].get("Path") or str(Path.home()))
        return a["name"]

    # ---------------------------------------------------------------- icons
    def icon(self, aid):
        if aid in self.icons:
            return self.icons[aid]
        a = self.apps.get(aid)
        if not a or sys.platform == "win32":
            return None
        try:
            found = mac_icon(a["target"]) if a["kind"] == "mac" else linux_icon(a["entry"].get("Icon", ""))
        except Exception:
            found = None
        self.icons[aid] = found
        return found

    def _windows_icons(self):
        """One PowerShell run draws every app's icon with the Windows shell (the same icons the Start menu shows)."""
        try:
            with tempfile.TemporaryDirectory(prefix="orange-icons-") as tmp:
                items = [{"id": a["id"], "parse": "shell:AppsFolder\\" + a["target"] if a["kind"] == "win" else a["target"], "lnk": a.get("lnk") or ""}
                         for a in list(self.apps.values())[:500]]
                listing = Path(tmp) / "items.json"
                listing.write_text(json.dumps(items), encoding="utf-8")
                script = WIN_ICON_SCRIPT.replace("@@IN@@", str(listing).replace("'", "''")).replace("@@OUT@@", tmp.replace("'", "''"))
                subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.b64encode(script.encode("utf-16-le")).decode()],
                               capture_output=True, timeout=180, creationflags=NO_WINDOW)
                for p in Path(tmp).glob("*.png"):
                    self.icons[p.stem] = (p.read_bytes(), "image/png")
        except Exception:
            pass
        self.icon_state = "ready"


def _add(apps, name, kind, target, group=None, **more):
    name = (name or "").strip()
    if not name or JUNK.search(name):
        return
    aid = app_id(kind, target)
    if aid in apps or any(a["name"].lower() == name.lower() for a in apps.values()):
        return
    apps[aid] = {"id": aid, "name": name, "kind": kind, "target": target, "group": group or group_of(name, more.get("entry", {}).get("Categories", "")), **more}


# ---------------------------------------------------------------- Windows
def windows_apps():
    apps, shortcuts = {}, {}
    for base in (os.environ.get("ProgramData", r"C:\ProgramData"), os.environ.get("APPDATA", "")):
        root = Path(base) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
        if base and root.is_dir():
            for p in root.rglob("*"):
                if p.suffix.lower() in (".lnk", ".url", ".appref-ms"):
                    shortcuts.setdefault(p.stem.lower(), str(p))
    try:
        ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress"
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True, timeout=30,
                             creationflags=NO_WINDOW).stdout.decode("utf-8", "replace").strip()
        data = json.loads(out or "[]")
        for d in [data] if isinstance(data, dict) else data:
            _add(apps, d.get("Name"), "win", d.get("AppID") or "", lnk=shortcuts.get((d.get("Name") or "").strip().lower()))
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    if not apps:   # older Windows, or PowerShell unavailable: use the Start menu shortcuts directly
        for path in shortcuts.values():
            _add(apps, Path(path).stem, "lnk", path, lnk=path)
    return apps


WIN_ICON_SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class OrangeIcons {
  [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int cx; public int cy; }
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr phbm); }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  public static bool Save(string name, string path, int px) {
    IShellItemImageFactory f;
    SHCreateItemFromParsingName(name, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out f);
    SIZE s; s.cx = px; s.cy = px;
    IntPtr hbm;
    if (f.GetImage(s, 0x1 | 0x4, out hbm) != 0) return false;
    try {
      using (Bitmap b = Image.FromHbitmap(hbm)) {
        if (Image.GetPixelFormatSize(b.PixelFormat) < 32) { b.Save(path, ImageFormat.Png); return true; }
        BitmapData d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, b.PixelFormat);
        try {
          int n = d.Stride * d.Height; byte[] bytes = new byte[n]; Marshal.Copy(d.Scan0, bytes, 0, n);
          bool alpha = false; for (int i = 3; i < n; i += 4) if (bytes[i] != 0) { alpha = true; break; }
          if (!alpha) { b.Save(path, ImageFormat.Png); return true; }
          using (Bitmap a = new Bitmap(d.Width, d.Height, d.Stride, PixelFormat.Format32bppPArgb, d.Scan0)) a.Save(path, ImageFormat.Png);
        } finally { b.UnlockBits(d); }
      }
    } finally { DeleteObject(hbm); }
    return true;
  }
}
'@
$items = Get-Content -Raw -Encoding UTF8 '@@IN@@' | ConvertFrom-Json
foreach ($it in $items) {
  $png = Join-Path '@@OUT@@' ($it.id + '.png'); $ok = $false
  try { $ok = [OrangeIcons]::Save($it.parse, $png, 64) } catch { }
  if (-not $ok -and $it.lnk) { try { [System.Drawing.Icon]::ExtractAssociatedIcon($it.lnk).ToBitmap().Save($png, [System.Drawing.Imaging.ImageFormat]::Png) } catch { } }
}
"""


def step_aside(pid):
    """Minimise the Orange window (Windows) so the app that was just opened is in front."""
    if sys.platform != "win32" or not pid:
        return False
    import ctypes
    from ctypes import wintypes
    user32, found = ctypes.windll.user32, []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def each(hwnd, _):
        p = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(p))
        if p.value == pid and user32.IsWindowVisible(hwnd) and user32.GetWindowTextLengthW(hwnd) > 0:
            found.append(hwnd)
        return True

    user32.EnumWindows(each, 0)
    for hwnd in found:
        user32.ShowWindow(hwnd, 6)   # SW_MINIMIZE
    return bool(found)


# ---------------------------------------------------------------- macOS
def mac_apps():
    apps = {}
    for d in ("/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities", str(Path.home() / "Applications")):
        if Path(d).is_dir():
            for p in sorted(Path(d).glob("*.app")):
                _add(apps, p.stem, "mac", str(p), group="System" if "/System/" in str(p) or "Utilities" in str(p) else None)
    return apps


def mac_icon(bundle):
    info = Path(bundle) / "Contents" / "Info.plist"
    with open(info, "rb") as f:
        name = plistlib.load(f).get("CFBundleIconFile")
    if not name:
        return None
    icns = Path(bundle) / "Contents" / "Resources" / (name if name.endswith(".icns") else name + ".icns")
    if not icns.is_file():
        return None
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "icon.png"
        subprocess.run(["sips", "-s", "format", "png", "-Z", "64", str(icns), "--out", str(out)], capture_output=True, timeout=15)
        return (out.read_bytes(), "image/png") if out.is_file() else None


# ---------------------------------------------------------------- Linux
def data_dirs():
    dirs = [os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")]
    dirs += (os.environ.get("XDG_DATA_DIRS") or "/usr/local/share:/usr/share").split(":")
    dirs += ["/var/lib/flatpak/exports/share", str(Path.home() / ".local/share/flatpak/exports/share"), "/var/lib/snapd/desktop"]
    return [d for d in dict.fromkeys(dirs) if d]


def read_desktop(path):
    entry, inside = {}, False
    for line in Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line.startswith("["):
            inside = line == "[Desktop Entry]"
        elif inside and "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            if "[" not in k:
                entry[k.strip()] = v.strip()
    return entry


def linux_apps():
    apps, seen = {}, set()
    for base in data_dirs():
        d = Path(base) / "applications"
        if not d.is_dir():
            continue
        for f in sorted(d.rglob("*.desktop")):
            did = str(f.relative_to(d)).replace(os.sep, "-")
            if did in seen:
                continue
            seen.add(did)
            try:
                e = read_desktop(f)
            except OSError:
                continue
            if e.get("Type", "Application") != "Application" or e.get("NoDisplay") == "true" or e.get("Hidden") == "true" or e.get("OnlyShowIn") or not e.get("Exec"):
                continue
            _add(apps, e.get("Name"), "xdg", str(f), entry=e)
    return apps


def desktop_command(entry):
    cmd = re.sub(r"%[fFuUdDnNickvm]", "", entry["Exec"]).replace("%%", "%")
    args = shlex.split(cmd)
    if entry.get("Terminal") == "true":
        for term, flag in (("x-terminal-emulator", "-e"), ("gnome-terminal", "--"), ("konsole", "-e"), ("xfce4-terminal", "-x"), ("xterm", "-e")):
            if shutil.which(term):
                return [term, flag, *args]
    return args


def linux_icon(name):
    if not name:
        return None
    p = Path(name)
    if p.is_absolute():
        return _icon_file(p)
    sizes = ("64x64", "48x48", "128x128", "256x256", "96x96", "32x32", "scalable")
    for base in [str(Path.home() / ".icons")] + [str(Path(d) / "icons") for d in data_dirs()]:
        for theme in ("hicolor", *sorted(t.name for t in Path(base).glob("*") if t.is_dir() and t.name != "hicolor")):
            for size in sizes:
                for ext in ("png", "svg"):
                    hit = Path(base) / theme / size / "apps" / f"{name}.{ext}"
                    if hit.is_file():
                        return _icon_file(hit)
    for ext in ("png", "svg"):
        hit = Path("/usr/share/pixmaps") / f"{name}.{ext}"
        if hit.is_file():
            return _icon_file(hit)
    return None


def _icon_file(p):
    if not p.is_file() or p.stat().st_size > 2_000_000:
        return None
    mime = {".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".ico": "image/x-icon"}.get(p.suffix.lower())
    return (p.read_bytes(), mime) if mime else None
