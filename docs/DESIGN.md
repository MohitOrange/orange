# Why Orange looks and works the way it does

Orange is a desktop that lives inside an encrypted box. We studied how people
actually operate computers (human factors research) and how Windows and macOS
solve the same problems, then kept what people already know and changed what
the research says can be better.

**The rule we followed:** keep the *ideas* people already know (windows, files,
folders, drag and drop, right-click, a place for apps). Change *where things are
and how they move* only when there is a reason a person would feel.

![Orange desktop](screenshots/desktop.jpg)

---

## Side by side

| | Windows 11 | macOS | **Orange** | Why |
|---|---|---|---|---|
| **Window controls** | Top-right: – ▢ ✕ | Top-left: traffic lights | **Bottom-right, on the Base bar**: Sink · Fill, then Close on its own | The top of every window is left for content. Close is separated from the other two, so it is harder to hit by accident. |
| **Window title** | Title bar at the top | Title bar at the top | **Inside the Base bar, next to live status** (item count, line/column, zoom…) | One bar does two jobs. Most Windows/Mac apps need a title bar *and* a status bar. |
| **Moving a window** | Drag the title bar | Drag the title bar | Drag the Base bar, **or any empty toolbar**, or Alt+drag anywhere | People instinctively grab the top, so that works too (Jakob's law). |
| **Where apps live** | Horizontal taskbar at the bottom | Dock at the bottom + menu bar at the top | **Vertical Rail on the left** | Screens are wide (16:9). Height is the scarce space, so the Rail spends width instead. |
| **Starting an app** | Start menu (a list) | Launchpad / Dock / Spotlight | **Apps fan** from the bottom-left corner, Segments, the Rail, or just type | A corner can't be overshot, so it's the fastest target on any screen (Fitts's law). |
| **Right-click** | Vertical list | Vertical list | **Segments**: a radial menu around the pointer. You pick by *direction* | Every choice is the same short move away. Radial "marking" menus are faster and cause fewer errors than lists. |
| **Search** | Press Win, then type | Press Cmd+Space, then type | **Just type** on the desktop (or Ctrl+K). Includes a calculator. | Nothing to remember first (recognition over recall). |
| **Notifications** | Bottom-right toasts | Top-right banners | **The Pip**: a top-centre island that morphs to show messages, progress and **Undo** | Top-centre is where the eye already rests between tasks. Progress and Undo stay in one place. |
| **Clock & quick settings** | Bottom-right tray | Top-right menu bar + Control Center | **Today**: drops down from the Pip, or the top-right corner | Calendar, sound, motion, theme, full screen, lock, all in one card. |
| **Screen corners** | One job (bottom-right = show desktop) | Optional Hot Corners | **All four corners have a job, and each is labelled** | Corners are the four easiest targets on a screen. Apps, Overview, Today, Peek. |
| **Deleting** | Recycle Bin, sometimes "Are you sure?" | Trash | **Instant Trash + Undo in the Pip.** Questions only for things that can't be undone. | People learn to click "Yes" without reading. Undo protects them better. |
| **Saving** | Save / Save As dialogs in many apps | Mostly automatic in Apple apps | **Autosave + encrypt as you type.** No Save button to forget. | A whole class of lost work disappears. |
| **See all windows** | Task View (Win+Tab) | Mission Control | **Overview**: top-left corner or Ctrl+↑ | Same idea, one throw of the mouse. |
| **Snap** | Snap layouts, Win+arrows | Tiling (macOS 15) | Drag to an edge or corner (a ghost shows the result), or Alt+Shift+arrows | You see the result before you let go. |
| **Getting back to work** | Restores some apps | Reopens windows | **Every window comes back where you left it** after unlock or restart | Spatial memory: people remember *where* things were. |
| **Security** | BitLocker (whole disk) | FileVault (whole disk) | **Every file and every file name encrypted per box**, the key is wiped on lock, auto-lock when idle | Your box stays sealed even while the computer is on and someone else uses it. |
| **Motion** | Subtle | Subtle | **Springy and purposeful**, with Full / Calm / Off | Motion explains cause and effect. A switch respects people who get dizzy. |

---

## The research behind it

**Fitts's law (Fitts, 1954).** The time to hit a target depends on how far away
and how big it is. A screen edge or corner is effectively endless, because the
pointer stops there and you can't overshoot. Orange gives every corner a job and
lets the Apps fan open *from* a corner.

**Pie and marking menus (Callahan, Hopkins, Weiser & Shneiderman, 1988; Kurtenbach & Buxton, 1993).**
In a radial menu every item is the same distance from the pointer. Studies found
radial menus faster and less error-prone than linear ones. Choosing by
*direction* means the target extends all the way to the edge of the screen.
That's Segments. It shows at most eight choices, so the menu never turns into a
long list.

**Hick–Hyman law.** The more choices you see at once, the longer you take to
decide. Segments caps choices at eight. Search ranks the best match first and
shows it ready for Enter.

**Doherty threshold (Doherty & Thadani, 1982).** People stay in flow when the
computer answers in under about 400 ms. Every Orange action answers immediately
with motion. Slow work (encrypting big files) shows live progress in the Pip.

**Jakob's law.** People spend most of their time on *other* systems and expect
yours to work the same way. So Orange keeps the familiar ideas, lets you drag
windows from the top as well as the bottom, and teaches the differences once
with a 30-second tour and labelled corners.

**Recognition over recall (Nielsen's usability heuristics).** You never need to
remember a shortcut. Every Segment shows an icon and a label, tooltips show the
key, and search shows recent files before you type.

**Undo instead of warnings (Raskin, *The Humane Interface*, 2000).** People
confirm warnings out of habit, so warnings stop protecting them. Undo always
works. Orange deletes instantly and offers Undo, and only asks a question for
things that really can't be undone.

**Motion with meaning.** A window grows *from the icon that opened it* and sinks
*into its Rail icon*, so you always see where it went. Animations last
200–500 ms, and Calm/Off modes plus the system "reduce motion" setting respect
people with motion sensitivity.

---

## A tour of the pieces

| | |
|---|---|
| ![Boot](screenshots/boot.jpg) **Boot.** The slice assembles while the box unlocks. Press any key to skip. | ![Controls at the bottom](screenshots/tour-controls-at-bottom.jpg) **The Base bar.** Title, status and controls at the bottom of every window. |
| ![Files and Code](screenshots/files-and-code.jpg) **Work.** Files and Code snapped side by side. Code saves and encrypts as you type. | ![Segments](screenshots/segments.jpg) **Segments.** Right-click anywhere and flick toward a choice. |
| ![Apps fan](screenshots/apps-fan.jpg) **Apps fan.** Throw the pointer into the bottom-left corner. | ![Type anywhere](screenshots/type-anywhere-maths.jpg) **Type anywhere.** Apps, files, actions, and maths. |
| ![Today](screenshots/today.jpg) **Today.** Clock, calendar, switches, accent colours, lock. | ![Terminal](screenshots/terminal.jpg) **Terminal.** A shell that only ever touches the box. |
| ![Overview](screenshots/overview.jpg) **Overview.** Every window at once. | ![Undo](screenshots/undo-in-the-pip.jpg) **Undo in the Pip.** Deleting is instant and reversible. |
| ![Daylight](screenshots/daylight-settings.jpg) **Daylight** theme and Settings. Changes apply instantly. | ![Lock](screenshots/lock.jpg) **Lock.** The key is wiped from memory until you type your password. |

## Orange 3: play, learn, make

Orange 3 adds the things a family computer needs, built to the same rules: everything works offline and
everything you make or earn is stored inside the encrypted box.

| | |
|---|---|
| ![Arcade](screenshots/arcade.jpg) **Arcade.** 115 games in one window. Search, filter by Kids, Action, Puzzles, Brain, Classics, My Games. | ![A game](screenshots/game-memory.jpg) **Every game, one shell.** Back, score, best, pause, restart and the ⚡ performance strip (FPS, game memory, CPU, RAM, free disk). |
| ![Learn](screenshots/learn-tamil.jpg) **Learn.** English, தமிழ் and numbers; six activities each. | ![Write](screenshots/learn-write.jpg) **Write.** Trace over a guide letter; coverage of the letter shape becomes 1 to 3 stars. |
| ![Paint](screenshots/paint.jpg) **Paint.** Big targets, bright palette, stamps for small hands. | ![Studio](screenshots/studio-python.jpg) **Studio.** HTML, React, Python and SQL, with nothing to install. |

**How 115 games stay small.** The games share 39 small engines, each written once and tuned by parameters
(speed, size, theme, level). A Snake with no walls, a 6×6 Sudoku and a Tamil-letter Memory are the same code
with different settings. An engine file loads only the first time one of its games is opened.

**Why they stay cool.** The engine draws at most 60 frames a second and at most 1.5× resolution, and it stops
entirely when the window is minimised or hidden. Board, quiz and learning games have no frame loop at all.
Profiling the desktop also showed that the moving wallpaper (four huge blurred blobs, re-blurred every frame)
and frosted glass over animated content cost far more than any game, so the blobs are now plain gradients
that hold still while a window is open, and game windows use a solid background.

## Orange 3.1: one tile per game, your PC's apps, and DivyaNik

**Every tile is a different game.** Orange 3.0 listed speed and size variants as separate tiles (four Snakes, three Pongs).
Now each game appears once and its variants are levels on the start card, with a best score kept per level. The freed
places went to 68 new games, so the Arcade has 107 genuinely different built-in games.

| | |
|---|---|
| ![New action and arcade games](screenshots/games-new-1.jpg) **New action games.** Space Rocks, Garden Guard, Road Crosser, Orange Muncher, Cave Glider, Sky Hopper, Colour Gate, Coin Hop, Neon Trails, Hungry Fish, Moon Lander, Fireworks. | ![New sports games](screenshots/games-new-2.jpg) **New sports and skill games.** Archery, basketball, mini golf, air hockey, cannons, bowling, penalties, keepy-uppy, fruit slicing, fishing, a rhythm game and a bubble shooter. |

**Opening the computer's own apps.** Orange is a browser window over a local server, so it cannot draw another
program inside itself. Instead the Computer app asks the operating system for the same list its own menu shows and
starts an app by id. The page never sends a command or a path, so nothing typed into Orange can become a program to
run. Because those apps live outside the box, the Computer app says so plainly: files saved there are not encrypted.

**DivyaNik inside Orange.** The DivyaNik scope describes a web platform with logins, parents, teachers, payments and
reviewers. Orange keeps the parts that work for one learner on one computer (reading and typing tests, missions,
writing and publishing) and stores all of it in the box. Where the scope needs people or a server (reviewer queues,
parent consent records, certificate QR verification, the public catalogue, plagiarism screening), Orange either does a
local version (a review desk and a parent approval step on the same computer) or says that it needs the platform.

| | |
|---|---|
| ![Typing report](screenshots/divyanik-typing-report.jpg) **Typing report.** Net and gross WPM, accuracy, consistency, a 100-mark score, the level thresholds and weak keys. | ![QuestVerse](screenshots/divyanik-quest.jpg) **QuestVerse.** Missions by age band, scored automatically or by a reviewer, with PRISM badges. |

---

## What comes next

The same desktop will become the shell of **Orange Linux**, the bootable ISO
from the original plan. On real hardware it will run full screen as the whole
operating system, with Dev, Play and Sec modes.
