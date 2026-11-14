# 🍊 Orange

**An encrypted computer inside your computer.**

Like a hidden underground room under a house: Orange creates a locked, encrypted
"box" on your computer. Only your name + password opens it. Inside you get a
mini computer with folders, a file manager, a text editor, an image viewer and
its own terminal. Outside the box, everything is unreadable ciphertext. Even the
file names are hidden.

Works on **Windows (cmd / PowerShell)**, **Linux** and **macOS**.

```
  ██████  ██████   █████  ███    ██  ██████  ███████
 ██    ██ ██   ██ ██   ██ ████   ██ ██       ██
 ██    ██ ██████  ███████ ██ ██  ██ ██   ███ █████
 ██    ██ ██   ██ ██   ██ ██  ██ ██ ██    ██ ██
  ██████  ██   ██ ██   ██ ██   ████  ██████  ███████
```

## Install

Needs Python 3.8+.

**Windows (cmd):** download/clone this repo, then double-click `install.bat`, or run:

```bat
install.bat
```

**Linux / macOS:**

```bash
./install.sh
```

**Or straight from GitHub with pip:**

```bash
pip install git+https://github.com/<your-username>/orange.git
```

Then finish setup:

```bash
orange install
```

## Use it

1. **Create your box.** Type `orange`. It asks for a name, a password and the
   password again. Your encrypted box is created in about 0.1 seconds.
2. **Open it.** Type `orange` again, enter your name and password. A window
   opens: your mini computer.
3. **Put things in.** Click **Upload files** or **Upload folder**. Files are
   encrypted as they go in.
4. **Work inside.** Double-click to open folders, edit text and code files
   (Ctrl+S saves and re-encrypts), view images, rename, delete.
5. **Take things out.** Select files and click **Export** to decrypt a copy to
   your normal computer.
6. **Lock.** Click **Lock** or close the window.

No desktop (SSH, server)? You get the Orange terminal automatically, or use
`orange --shell`:

```
orange@alex:/$ put C:\Users\me\project Projects
orange@alex:/$ cd Projects/project
orange@alex:/Projects/project$ ls
orange@alex:/Projects/project$ get main.py C:\Users\me\Desktop
orange@alex:/$ exit
```

Shell commands: `ls cd pwd tree mkdir rm mv cat write put get info passwd window clear exit`.

## All commands

| Command | What it does |
|---|---|
| `orange install` | Set up Orange and run the encryption self-test |
| `orange` | First time: create a box. After that: log in and open the window |
| `orange --shell` / `orange shell` | Log in and use the terminal instead of the window |
| `orange window` | Log in and force the window |
| `orange new` | Create another box (another user) |
| `orange list` | List the boxes on this computer |
| `orange passwd` | Change a box's password |
| `orange destroy` | Permanently delete a box |

## Security

- **AES-256-GCM** encrypts every file (in 4 MB chunks) and the file list.
  Any tampering is detected.
- Your password goes through **scrypt** (N=2^15, r=8), so guessing is slow.
  Three wrong tries per run, with growing delays.
- A random master key encrypts the data. The password only unlocks that key,
  so changing the password is instant.
- Boxes are stored in `~/.orange` (`C:\Users\<you>\.orange` on Windows).
  Set `ORANGE_HOME` to store them somewhere else, such as a USB drive.
- **There is no password recovery.** Forget the password and the data is gone.
- Opening a file type Orange can't show itself (PDF, video…) makes a temporary
  decrypted copy for your normal app. It is deleted when you lock the box.

## Development

```bash
pip install -e . pytest
pytest
```

| File | Role |
|---|---|
| `orange/crypto.py` | scrypt + AES-256-GCM |
| `orange/vault.py` | The encrypted box: files, folders, import/export |
| `orange/cli.py` | The `orange` command |
| `orange/shell.py` | The terminal inside the box |
| `orange/gui.py` | The desktop window (Tkinter, no extra installs) |
| `orange/ui.py` | Orange colours and banner |

## Roadmap

- Drag and drop into the window
- Built-in terminal panel and code runner inside the window
- Auto-lock after idle time
- Sync a box to a USB drive or cloud
- Orange Linux: the full operating system (Dev / Play / Sec modes)

MIT license.
