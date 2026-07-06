# context-share

**Move a conversation from one AI coding assistant to another.**

You're deep into a session with Codex and want to continue in Claude Code (or the other way around)? `ctx` exports the conversation — what you asked, what the AI did, which files it touched, which commands it ran — and hands it to the other assistant so you can pick up right where you left off.

```
codex ──┐                        ┌── claude (CLI)
        │   ctx export           │   codex (CLI)
claude ─┼───────────► ~/.ctxstore├── clipboard  → paste into any desktop app
file ───┤   ctx send             │   stdout
stdin ──┘                        └──
```

## Install

```bash
npm install -g context-share
```

Requires Node 20+. Verify with `ctx doctor` — it shows which assistants were detected on your machine.

## The 10-second version

```bash
ctx handoff codex claude
```

That's it. Your latest Codex session is exported, saved, and Claude Code launches with the context — in the same project folder the session was about.

Other directions:

```bash
ctx handoff claude codex        # Claude Code session → Codex
ctx handoff claude clipboard    # → clipboard, then Cmd+V into any desktop app
```

## The guided version

Just run:

```bash
ctx
```

and pick from the menus:

1. **Source** — Codex, Claude Code, a saved context, or a file
2. **Session** — your recent sessions, newest first
3. **Destination** — where to send it
4. **Size** — compact (summary + recent conversation) or full (entire transcript)
5. **Include** — toggle tool activity and the files list with the space bar

Every step shows what it's doing, and every send prints a token estimate first:

```
Sending ~1.9k tokens (compact) to Claude Code.
```

## Compact vs. full

- **Compact** (default) — a handoff prompt with the session's goal, a summary, decisions made, open tasks, relevant files, recent commands, and the last 8 messages. Usually 1–3k tokens.
- **Full** (`--full`) — the entire transcript, including tool activity: shell commands run, files edited (with content previews), and tool output. Can be 50k+ tokens for long sessions — the token estimate tells you before it's sent.

```bash
ctx handoff codex claude                 # compact
ctx handoff codex claude --full          # everything
ctx handoff codex claude --messages 20   # compact, but with the last 20 messages
```

## All commands

| Command | What it does |
| --- | --- |
| `ctx` | Interactive: pick session → destination → size → includes |
| `ctx handoff <from> <to>` | Latest session from one tool straight to another |
| `ctx export <source>` | Save a session locally (`codex`, `claude`, `file`, `stdin`) |
| `ctx send <dest> [id]` | Send a saved context (`claude`, `codex`, `clipboard`, `stdout`) |
| `ctx list` | List saved contexts |
| `ctx search <term>` | Search saved contexts |
| `ctx show <id>` | Print a saved context's Markdown |
| `ctx render [id]` | Print the handoff prompt without sending it |
| `ctx delete <id>` | Delete a saved context |
| `ctx config` | Interactive settings (enter toggles) |
| `ctx doctor` | Check what's detected on your machine |

Wherever an `<id>` is expected, a unique prefix works (`codex-26ab`), and so does the word `last`.

### Flags for `send`, `handoff`, and `render`

| Flag | Effect |
| --- | --- |
| `--last` | Skip the picker, use the most recent session/context |
| `--full` | Entire transcript instead of the compact prompt |
| `--messages <n>` | Recent messages in the compact prompt (default 8) |
| `--tools` / `--no-tools` | Include/exclude tool activity |
| `--files` / `--no-files` | Include/exclude the relevant-files list |

## Settings

`ctx config` opens a list — press enter on a setting to toggle it:

```
? Settings — enter to change
❯   Tool activity      on
    Files list         on
    Compact messages   8
    Reset to defaults
    Done
```

These are your defaults; a flag on any single command overrides them just for that run. (For scripts: `ctx config tools off`, `ctx config messages 20`, `ctx config reset`.)

## Good to know

- **Everything stays on your machine.** Contexts are files in `~/.ctxstore` (override with `CTX_STORE_DIR`); nothing is uploaded anywhere.
- **Secrets are redacted at export.** API keys, bearer tokens, private keys, `password=` assignments, and high-entropy strings are replaced with `[REDACTED_…]` markers, and each export reports what was removed:
  ```
  Redacted: high-entropy x113, bearer-token x1
  ```
- **Filters never destroy data.** `--no-tools` and friends apply when sending; the saved export always keeps the complete session, so you can re-send it differently later.
- **The workspace travels with the context.** When launching a CLI destination, `ctx` starts it in the project folder the original session was in.

## Development

```bash
git clone <your-repo-url> && cd ctx
npm install
npm run dev -- doctor   # run from source
npm test                # unit tests (vitest)
npm run build           # compile to dist/
```

Adding a new source or destination is one file implementing the `ContextSource` / `ContextDestination` interface — see `src/sources/` and `src/destinations/`.

## License

MIT
