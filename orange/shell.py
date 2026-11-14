"""Orange terminal: a small shell that runs *inside* the encrypted box."""
import cmd
import os
import re
import shlex
import time

from . import ui
from .vault import BoxError, norm


class OrangeShell(cmd.Cmd):
    intro = ""

    def __init__(self, box):
        super().__init__()
        self.box = box
        self.cwd = "/"

    @property
    def prompt(self):
        p = ui.bold_orange(f"orange@{self.box.name}") + ":" + ui.orange(self.cwd) + "$ "
        if os.name != "nt":  # tell readline the colour codes take no space
            p = re.sub(r"(\x1b\[[0-9;]*m)", "\x01\\1\x02", p)
        return p

    def _p(self, p):
        return norm(p, self.cwd)

    def onecmd(self, line):
        try:
            return super().onecmd(line)
        except (BoxError, OSError, ValueError) as e:
            ui.err(str(e))
        except KeyboardInterrupt:
            print()

    def emptyline(self):
        pass

    def default(self, line):
        ui.err(f"unknown command: {line.split()[0]}  (type 'help')")

    def _args(self, arg):
        return shlex.split(arg, posix=True)

    # ---- navigation ----
    def do_ls(self, arg):
        """ls [folder]      list files"""
        a = self._args(arg)
        for it in self.box.listdir(self._p(a[0]) if a else self.cwd):
            if it["dir"]:
                print("  " + ui.bold_orange(it["name"] + "/"))
            else:
                when = time.strftime("%Y-%m-%d %H:%M", time.localtime(it["mtime"]))
                print(f"  {it['name']:<40} {ui.human_size(it['size']):>10}  {ui.dim(when)}")

    def do_cd(self, arg):
        """cd <folder>      change folder"""
        p = self._p(arg.strip() or "/")
        if not self.box.is_dir(p):
            raise BoxError(f"not a folder: {p}")
        self.cwd = p

    def do_pwd(self, arg):
        """pwd              show current folder"""
        print(self.cwd)

    def do_tree(self, arg):
        """tree [folder]    show folder tree"""
        def walk(p, pad):
            for it in self.box.listdir(p):
                print(pad + (ui.orange(it["name"] + "/") if it["dir"] else it["name"]))
                if it["dir"]:
                    walk(it["path"], pad + "  ")
        walk(self._p(arg.strip() or self.cwd), "  ")

    # ---- edit ----
    def do_mkdir(self, arg):
        """mkdir <folder>   create folder"""
        for a in self._args(arg):
            self.box.mkdir(self._p(a))

    def do_rm(self, arg):
        """rm <path>        delete file or folder (asks first)"""
        for a in self._args(arg):
            p = self._p(a)
            if self.box.is_dir(p) and input(f"  delete folder {p} and everything in it? [y/N] ").lower() != "y":
                continue
            n = self.box.remove(p)
            ui.ok(f"deleted {p} ({n} file(s))")

    def do_mv(self, arg):
        """mv <src> <dst>   move or rename"""
        a = self._args(arg)
        if len(a) != 2:
            raise BoxError("usage: mv <src> <dst>")
        ui.ok("moved to " + self.box.move(self._p(a[0]), self._p(a[1])))

    def do_cat(self, arg):
        """cat <file>       print a text file"""
        print(self.box.read_bytes(self._p(arg.strip())).decode("utf-8", "replace"))

    def do_write(self, arg):
        """write <file>     type text into a file; finish with a line containing only '.'"""
        p = self._p(arg.strip())
        print(ui.dim("  type your text. finish with a single '.' on its own line"))
        lines = []
        while (line := input()) != ".":
            lines.append(line)
        self.box.write_bytes(p, ("\n".join(lines) + "\n").encode())
        ui.ok(f"saved {p}")

    # ---- host computer <-> box ----
    def do_put(self, arg):
        """put <computer-path> [box-folder]   upload a file or folder from your computer"""
        a = self._args(arg)
        if not a:
            raise BoxError("usage: put <computer-path> [box-folder]")
        dest = self._p(a[1]) if len(a) > 1 else self.cwd
        t = time.time()
        n = self.box.import_path(a[0], dest)
        ui.ok(f"encrypted {n} file(s) into {dest} in {time.time() - t:.2f}s")

    def do_get(self, arg):
        """get <box-path> [computer-folder]   download (decrypt) to your computer"""
        a = self._args(arg)
        if not a:
            raise BoxError("usage: get <box-path> [computer-folder]")
        n = self.box.export_path(self._p(a[0]), a[1] if len(a) > 1 else ".")
        ui.ok(f"exported {n} file(s)")

    # ---- system ----
    def do_info(self, arg):
        """info             box size and security details"""
        files, size = self.box.usage()
        ui.info(f"box     : {self.box.name}")
        ui.info(f"files   : {files} ({ui.human_size(size)})")
        ui.info(f"cipher  : AES-256-GCM, key from scrypt (N={self.box.header['kdf']['n']})")
        ui.info(f"stored  : {self.box.path}")

    def do_passwd(self, arg):
        """passwd           change the box password"""
        from .cli import ask_new_password
        self.box.change_password(ask_new_password())
        ui.ok("password changed")

    def do_window(self, arg):
        """window           open the Orange desktop window"""
        from .gui import gui_available, run_gui
        if not gui_available():
            raise BoxError("no graphical display available here")
        run_gui(self.box, lock_on_close=False)

    def do_clear(self, arg):
        """clear            clear the screen"""
        print("\033[2J\033[H", end="")

    def do_exit(self, arg):
        """exit             lock the box and leave"""
        self.box.lock()
        ui.ok("box locked. bye")
        return True

    do_quit = do_lock = do_exit

    def do_EOF(self, arg):
        print()
        return self.do_exit(arg)

    def do_help(self, arg):
        if arg:
            return super().do_help(arg)
        print(ui.bold_orange("\n  Orange box commands\n"))
        for name in sorted(n[3:] for n in self.get_names() if n.startswith("do_")):
            doc = getattr(self, "do_" + name).__doc__
            if doc and name not in ("help", "quit", "lock"):
                print("  " + doc.strip())
        print()


def run_shell(box):
    ui.info(f"welcome to your box, {ui.bold(box.name)}. type 'help' for commands, 'exit' to lock")
    OrangeShell(box).cmdloop()
