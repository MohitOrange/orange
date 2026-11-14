#!/usr/bin/env sh
# Orange installer for Linux / macOS
set -e
printf '\033[1;38;5;208m  Installing Orange...\033[0m\n'
DIR="$(cd "$(dirname "$0")" && pwd)"
python3 -m pip install --user --upgrade "$DIR" || python3 -m pip install --user --break-system-packages --upgrade "$DIR"
python3 -m orange install
