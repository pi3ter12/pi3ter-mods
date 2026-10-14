# pi3ter-mods

Personal Claude Code mods, installed as one marketplace.

| Mod | What it does |
| --- | --- |
| `usage-meter` | Shows plan limit usage (5h / week) and the reset time above the prompt; a toast at 90%. |
| `english-coach` | On Enter, Haiku (`claude-haiku-5-5`) checks the prompt. Correct: sent as is. Wrong: held back with a word diff, a short Polish note and a Polish translation. Enter sends yours, Tab / Ctrl+Y sends the corrected one. |
| `translator` | `/translator` opens a pane (Esc closes it): type Polish, press Enter, get an English translation from Haiku (`claude-haiku-5-5`). |

## Install on another computer

```
/plugin marketplace add /path/to/pi3ter-mods
/plugin install usage-meter@pi3ter-mods
/plugin install english-coach@pi3ter-mods
/plugin install translator@pi3ter-mods
/reload-plugins
```

(Use `<owner>/<repo>` instead of the path once it is on GitHub.)

## english-coach

- `/coach on | off | stats` — toggle the check, or show the most common mistakes.
- Mistakes are logged to `~/english-mistakes.md`.
- Polish messages, commands (`/…`) and messages under 8 characters are sent without a check.
- Haiku gets only the draft, never the conversation. If it fails or takes over 6 s, the prompt is sent as typed.
