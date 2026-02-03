# Screenshot agent prompt

## Goal
Create the smallest, most portable way for an agent to get the latest screenshot
or clipboard image in one command (or one small script) and return a file path
the agent can read.

## Context
- Must run inside Cursor Agent CLI (shell).
- Success = prints a single absolute file path to a PNG (no extra text).
- Always write or move the image into temp to avoid clutter.

## Requirements
1. First check the clipboard for an image. If found:
   - Write to temp (TMPDIR or /tmp) and print the path.
2. If no clipboard image, find the latest screenshot on the Desktop:
   - Move it to temp and print the path.
3. If nothing found, exit non-zero with no output.
4. Prefer POSIX sh; avoid heavy deps and non-portable features.

## Clipboard capture fallback order
- macOS: `pngpaste` if installed, else `osascript` (built-in).
- Linux Wayland: `wl-paste`.
- Linux X11: `xclip`.
- Windows (optional): PowerShell `Get-Clipboard -Format Image`.

## Desktop lookup hints
- Desktop dir: `$HOME/Desktop` (macOS), or `xdg-user-dir DESKTOP` if present.
- macOS patterns: `Screen Shot*.png`, `Screenshot*.png`.
- Linux patterns: `Screenshot*.png`, `*Screenshot*.png`.
- Windows patterns: `%USERPROFILE%\\Pictures\\Screenshots\\*.png`.

## One-liner baseline (clipboard only)
Use this as a minimal building block. It prints a temp path if an image exists.

```
tmp="$(mktemp "${TMPDIR:-/tmp}/clip-XXXXXX.png")" && ( command -v pngpaste >/dev/null && pngpaste "$tmp" || command -v osascript >/dev/null && osascript -e 'set theData to (the clipboard as «class PNGf»)' -e 'set theFile to POSIX file "'"$tmp"'"' -e 'set theFileRef to open for access theFile with write permission' -e 'set eof of theFileRef to 0' -e 'write theData to theFileRef' -e 'close access theFileRef' || command -v wl-paste >/dev/null && wl-paste --type image/png > "$tmp" || command -v xclip >/dev/null && xclip -selection clipboard -t image/png -o > "$tmp" ) && [ -s "$tmp" ] && echo "$tmp"
```

## Acceptance criteria
- One command (or tiny script) that works on macOS and Linux.
- No extra stdout noise; path only on success.
- Returns non-zero when nothing is found.
- Moves any Desktop screenshot to temp.
- Agent can read the printed image path immediately.
