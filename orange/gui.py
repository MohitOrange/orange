"""Orange desktop window: a mini computer that lives inside the encrypted box."""
import os
import posixpath
import shutil
import subprocess
import sys
import tempfile
import threading
import time

from .ui import human_size
from .vault import BoxError

BG, PANEL, CARD, FG, MUTED, ORANGE, ORANGE_DK = (
    "#16120f", "#201a16", "#2a221c", "#f4ece6", "#a8988c", "#ff8a1f", "#d96f0c")
TEXT_EXT = {".txt", ".md", ".py", ".js", ".ts", ".json", ".html", ".css", ".c", ".cpp", ".h", ".cs",
            ".java", ".rs", ".go", ".sh", ".bat", ".ps1", ".yml", ".yaml", ".toml", ".ini", ".cfg",
            ".csv", ".xml", ".sql", ".log", ".env", ".lua", ".rb", ".php", ".kt", ".swift", ""}
IMG_EXT = {".png", ".gif", ".ppm", ".pgm"}


def gui_available():
    try:
        import tkinter  # noqa: F401
    except ImportError:
        return False
    if sys.platform.startswith("linux") and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        return False
    return True


def run_gui(box, lock_on_close=True):
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog, ttk

    tmpdir = tempfile.mkdtemp(prefix="orange-open-")
    root = tk.Tk()
    root.title(f"Orange — {box.name}")
    root.geometry("1040x640")
    root.minsize(760, 460)
    root.configure(bg=BG)

    st = ttk.Style(root)
    st.theme_use("clam")
    st.configure(".", background=BG, foreground=FG, fieldbackground=CARD, font=("Segoe UI", 10))
    st.configure("Treeview", background=CARD, fieldbackground=CARD, foreground=FG, rowheight=28, borderwidth=0)
    st.configure("Treeview.Heading", background=PANEL, foreground=MUTED, relief="flat")
    st.map("Treeview", background=[("selected", ORANGE_DK)], foreground=[("selected", "#ffffff")])
    st.configure("Horizontal.TProgressbar", background=ORANGE, troughcolor=PANEL)

    state = {"cwd": "/", "busy": False, "history": []}

    def btn(parent, text, cmd, primary=False):
        b = tk.Button(parent, text=text, command=cmd, relief="flat", bd=0, padx=12, pady=6, cursor="hand2",
                      bg=ORANGE if primary else CARD, fg="#1a1000" if primary else FG,
                      activebackground=ORANGE_DK, activeforeground="#ffffff", font=("Segoe UI", 10, "bold"))
        return b

    # ---- top bar ----
    top = tk.Frame(root, bg=PANEL, height=48)
    top.pack(fill="x")
    tk.Label(top, text="● ORANGE", bg=PANEL, fg=ORANGE, font=("Segoe UI", 15, "bold")).pack(side="left", padx=14, pady=8)
    tk.Label(top, text=f"{box.name}'s box  ·  encrypted", bg=PANEL, fg=MUTED).pack(side="left")
    clock = tk.Label(top, bg=PANEL, fg=FG, font=("Segoe UI", 10))
    clock.pack(side="right", padx=14)
    btn(top, "🔒 Lock", lambda: close()).pack(side="right", padx=4, pady=8)

    # ---- toolbar ----
    bar = tk.Frame(root, bg=BG)
    bar.pack(fill="x", padx=10, pady=(10, 4))
    btn(bar, "⬆ Upload files", lambda: upload(False), True).pack(side="left", padx=(0, 6))
    btn(bar, "⬆ Upload folder", lambda: upload(True), True).pack(side="left", padx=(0, 6))
    btn(bar, "+ Folder", lambda: new_folder()).pack(side="left", padx=(0, 6))
    btn(bar, "+ Note", lambda: new_note()).pack(side="left", padx=(0, 6))
    btn(bar, "Open", lambda: open_selected()).pack(side="left", padx=(0, 6))
    btn(bar, "⬇ Export", lambda: export()).pack(side="left", padx=(0, 6))
    btn(bar, "Rename", lambda: rename()).pack(side="left", padx=(0, 6))
    btn(bar, "🗑 Delete", lambda: delete()).pack(side="left", padx=(0, 6))

    nav = tk.Frame(root, bg=BG)
    nav.pack(fill="x", padx=10, pady=4)
    btn(nav, "←", lambda: back()).pack(side="left")
    btn(nav, "↑", lambda: go(posixpath.dirname(state["cwd"]))).pack(side="left", padx=4)
    addr = tk.Label(nav, bg=CARD, fg=FG, anchor="w", padx=10, font=("Consolas", 10))
    addr.pack(side="left", fill="x", expand=True, ipady=5)

    # ---- body: sidebar + files ----
    body = tk.Frame(root, bg=BG)
    body.pack(fill="both", expand=True, padx=10, pady=4)
    side = tk.Frame(body, bg=PANEL, width=170)
    side.pack(side="left", fill="y", padx=(0, 8))
    side.pack_propagate(False)
    tk.Label(side, text="PLACES", bg=PANEL, fg=MUTED, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=12, pady=(12, 4))
    places = tk.Frame(side, bg=PANEL)
    places.pack(fill="x")

    tree = ttk.Treeview(body, columns=("size", "modified", "kind"), selectmode="extended")
    tree.heading("#0", text="Name", anchor="w")
    tree.heading("size", text="Size", anchor="e")
    tree.heading("modified", text="Modified", anchor="w")
    tree.heading("kind", text="Kind", anchor="w")
    tree.column("#0", width=420)
    tree.column("size", width=90, anchor="e")
    tree.column("modified", width=150)
    tree.column("kind", width=90)
    sb = ttk.Scrollbar(body, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=sb.set)
    tree.pack(side="left", fill="both", expand=True)
    sb.pack(side="left", fill="y")

    # ---- status ----
    status_bar = tk.Frame(root, bg=PANEL)
    status_bar.pack(fill="x", side="bottom")
    status = tk.Label(status_bar, bg=PANEL, fg=MUTED, anchor="w", padx=12, pady=5)
    status.pack(side="left", fill="x", expand=True)
    prog = ttk.Progressbar(status_bar, length=180, mode="indeterminate")

    # ---- logic ----
    def set_status(msg=None):
        files, size = box.usage()
        status.config(text=(msg + "   ·   " if msg else "") + f"{files} files · {human_size(size)} · AES-256-GCM")

    def refresh_places():
        for w in places.winfo_children():
            w.destroy()
        entries = [("🏠  Home", "/")] + [("📁  " + i["name"], i["path"]) for i in box.listdir("/") if i["dir"]]
        for label, path in entries:
            b = tk.Button(places, text=label, anchor="w", relief="flat", bd=0, padx=14, pady=5, cursor="hand2",
                          bg=ORANGE_DK if path == state["cwd"] else PANEL, fg=FG,
                          activebackground=CARD, activeforeground=FG, command=lambda p=path: go(p))
            b.pack(fill="x")

    def refresh():
        tree.delete(*tree.get_children())
        for it in box.listdir(state["cwd"]):
            ext = posixpath.splitext(it["name"])[1].lower()
            kind = "Folder" if it["dir"] else (ext[1:].upper() or "File")
            icon = "📁 " if it["dir"] else ("🖼 " if ext in IMG_EXT | {".jpg", ".jpeg"} else "📄 ")
            when = time.strftime("%Y-%m-%d %H:%M", time.localtime(it["mtime"])) if it["mtime"] else ""
            tree.insert("", "end", iid=it["path"], text=icon + it["name"],
                        values=("" if it["dir"] else human_size(it["size"]), when, kind))
        addr.config(text="  orange://" + box.name + state["cwd"])
        refresh_places()
        set_status()

    def go(p, remember=True):
        if p != state["cwd"] and box.is_dir(p):
            if remember:
                state["history"].append(state["cwd"])
            state["cwd"] = p
            refresh()

    def back():
        if state["history"]:
            go(state["history"].pop(), remember=False)

    def selected():
        return list(tree.selection())

    def run_bg(label, work, done=None):
        if state["busy"]:
            return
        state["busy"] = True
        prog.pack(side="right", padx=10)
        prog.start(12)
        status.config(text=label + "…")

        def worker():
            try:
                res, error = work(), None
            except Exception as e:  # shown to the user
                res, error = None, e
            root.after(0, finish, res, error)

        def finish(res, error):
            state["busy"] = False
            prog.stop()
            prog.pack_forget()
            refresh()
            if error:
                messagebox.showerror("Orange", str(error))
            elif done:
                set_status(done(res))

        threading.Thread(target=worker, daemon=True).start()

    def upload(folder):
        if folder:
            d = filedialog.askdirectory(title="Choose a folder to put in your box")
            paths = [d] if d else []
        else:
            paths = list(filedialog.askopenfilenames(title="Choose files to put in your box"))
        if not paths:
            return
        cwd = state["cwd"]
        t0 = time.time()
        run_bg("Encrypting", lambda: sum(box.import_path(p, cwd) for p in paths),
               lambda n: f"✔ encrypted {n} file(s) in {time.time() - t0:.1f}s")

    def new_folder():
        name = simpledialog.askstring("New folder", "Folder name:", parent=root)
        if name and name.strip():
            try:
                box.mkdir(posixpath.join(state["cwd"], name.strip()))
            except BoxError as e:
                messagebox.showerror("Orange", str(e))
            refresh()

    def new_note():
        name = simpledialog.askstring("New note", "File name:", initialvalue="note.txt", parent=root)
        if name and name.strip():
            p = posixpath.join(state["cwd"], name.strip())
            if not box.exists(p):
                box.write_bytes(p, b"")
            refresh()
            editor(p)

    def export():
        sel = selected()
        if not sel:
            return messagebox.showinfo("Orange", "Select files or folders to export first.")
        dest = filedialog.askdirectory(title="Export (decrypt) to which folder on this computer?")
        if dest:
            run_bg("Decrypting", lambda: sum(box.export_path(p, dest) for p in sel),
                   lambda n: f"✔ exported {n} file(s) to {dest}")

    def rename():
        sel = selected()
        if len(sel) != 1:
            return
        old = sel[0]
        name = simpledialog.askstring("Rename", "New name:", initialvalue=posixpath.basename(old), parent=root)
        if name and name.strip() and name.strip() != posixpath.basename(old):
            try:
                box.move(old, posixpath.join(posixpath.dirname(old), name.strip()))
            except BoxError as e:
                messagebox.showerror("Orange", str(e))
            refresh()

    def delete():
        sel = selected()
        if sel and messagebox.askyesno("Delete", f"Permanently delete {len(sel)} item(s) from your box?"):
            for p in sel:
                box.remove(p)
            refresh()

    def open_selected(_event=None):
        sel = selected()
        if not sel:
            return
        p = sel[0]
        if box.is_dir(p):
            return go(p)
        ext = posixpath.splitext(p)[1].lower()
        if ext in TEXT_EXT or box.files[p]["size"] < 256 * 1024 and _looks_text(box.read_bytes(p)[:4096]):
            editor(p)
        elif ext in IMG_EXT:
            viewer(p)
        else:
            open_external(p)

    def editor(p):
        win = tk.Toplevel(root, bg=BG)
        win.title(f"{posixpath.basename(p)} — Orange editor")
        win.geometry("760x520")
        txt = tk.Text(win, bg=CARD, fg=FG, insertbackground=ORANGE, relief="flat", padx=12, pady=10,
                      font=("Consolas", 11), undo=True, selectbackground=ORANGE_DK)
        txt.insert("1.0", box.read_bytes(p).decode("utf-8", "replace"))
        bar2 = tk.Frame(win, bg=PANEL)
        bar2.pack(fill="x")
        info = tk.Label(bar2, text=p, bg=PANEL, fg=MUTED)

        def save(_e=None):
            box.write_bytes(p, txt.get("1.0", "end-1c").encode("utf-8"))
            info.config(text=f"{p}  ·  saved & encrypted {time.strftime('%H:%M:%S')}")
            refresh()
            return "break"

        btn(bar2, "💾 Save  (Ctrl+S)", save, True).pack(side="left", padx=8, pady=6)
        info.pack(side="left", padx=8)
        txt.pack(fill="both", expand=True)
        win.bind("<Control-s>", save)
        txt.focus_set()

    def viewer(p):
        import base64
        win = tk.Toplevel(root, bg=BG)
        win.title(f"{posixpath.basename(p)} — Orange viewer")
        try:
            img = tk.PhotoImage(data=base64.b64encode(box.read_bytes(p)))
        except tk.TclError:
            win.destroy()
            return open_external(p)
        f = max(1, img.width() // 1000 + 1, img.height() // 700 + 1)
        img = img.subsample(f) if f > 1 else img
        lbl = tk.Label(win, image=img, bg=BG)
        lbl.image = img
        lbl.pack(padx=10, pady=10)

    def open_external(p):
        if not messagebox.askyesno("Open with another app",
                                   "This file type opens in another program on your computer.\n"
                                   "A temporary decrypted copy is made and wiped when you lock the box.\n\nContinue?"):
            return
        box.export_path(p, tmpdir)
        path = os.path.join(tmpdir, posixpath.basename(p))
        if sys.platform == "win32":
            os.startfile(path)  # noqa: S606
        else:
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", path])

    def tick():
        clock.config(text=time.strftime("%a %d %b  %H:%M"))
        root.after(15000, tick)

    def close():
        if state["busy"] and not messagebox.askyesno("Orange", "A transfer is running. Lock anyway?"):
            return
        shutil.rmtree(tmpdir, ignore_errors=True)
        root.destroy()

    tree.bind("<Double-1>", open_selected)
    tree.bind("<Return>", open_selected)
    tree.bind("<Delete>", lambda e: delete())
    tree.bind("<BackSpace>", lambda e: back())
    root.protocol("WM_DELETE_WINDOW", close)
    tick()
    refresh()
    root.mainloop()
    shutil.rmtree(tmpdir, ignore_errors=True)
    if lock_on_close:
        box.lock()


def _looks_text(sample):
    if b"\0" in sample:
        return False
    try:
        sample.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False
