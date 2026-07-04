# ctx-share

Share AI coding context between assistants. Export a conversation from **Codex** or **Claude Code**, and hand it off to another assistant so you can continue where you left off.

```
codex ──┐                       ┌── claude (CLI)
        │   ctx export          │   codex (CLI)
claude ─┼──────────► ~/.ctxstore├── clipboard
file ───┤            ctx send   │   stdout
stdin ──┘                       └──
```

## Install

```bash
npm install -g ctx-share
```

Requires Node 20+.

## Quick start

```bash
# Interactive: pick a session, pick a destination, done.
ctx

# One-shot: grab the latest Codex session and continue it in Claude Code.
ctx handoff codex claude
```

To continue a session in a desktop app (Claude, Codex, ChatGPT, anything), use the clipboard destination and paste into the app:

```bash
ctx send clipboard --last
```

## Commands

| Command | What it does |
| --- | --- |
| `ctx` / `ctx share` | Interactive flow: pick source session → destination → size |
| `ctx handoff <from> <to>` | Export the latest session from one tool and send it to another |
| `ctx export <source>` | Export from `codex`, `claude`, `file`, or `stdin` into the local store |
| `ctx send <dest> [id]` | Send a saved context to `claude`, `codex`, `clipboard`, or `stdout` |
| `ctx list` | List saved contexts |
| `ctx search <term>` | Search saved contexts for a term |
| `ctx show <id>` | Print a saved context's Markdown (`last` works too) |
| `ctx render [id]` | Render the handoff prompt to stdout (`--full` for the whole transcript) |
| `ctx delete <id>` | Delete a saved context |
| `ctx doctor` | Check which sources and destinations are available |

Useful flags:

- `--last` — skip pickers and use the most recent session/context.
- `--full` — send the entire transcript instead of the compact handoff prompt.
- `--messages <n>` — how many recent messages the compact prompt includes (default 8).

Every export and send prints a rough token estimate (~4 characters per token) so you know what you're about to inject.

## What gets shared

Contexts are stored in `~/.ctxstore` (override with `CTX_STORE_DIR`) as JSON plus a readable Markdown summary containing:

- goal, summary, decisions, and open tasks inferred from the conversation,
- files mentioned and recent commands,
- the recent conversation (or the full transcript with `--full`),
- tool activity: shell commands run, files edited/written (with content previews), and tool output.

Common secrets (API keys, bearer tokens, private keys, `password=` assignments, high-entropy strings) are **redacted at export time**, and every redaction is counted in the saved context so you can see what was removed.

## Development

```bash
npm install
npm run dev -- doctor   # run from source
npm test                # unit tests (vitest)
npm run build           # compile to dist/
```

## License

MIT
