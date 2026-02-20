# gitdrop

To software engineers who are punished for finishing their work early, here's a quick fix. Automatically spread your local code changes across a realistic GitHub commit schedule. A background daemon fires real `git push` commands at authentic wall-clock times without fake timestamps.

---

## Development

```bash
npm run build    # compile TypeScript to dist/
npm run lint     # type-check without emitting
npm run dev      # run directly via ts-node (for development)
```

## How it works

**1. Run once upfront**

`gitdrop run` clones your remote repo, diffs it against your local source directory, groups the changed files into logical commits (by directory), and distributes them across your time window. It then spawns a background daemon and exits immediately.

**2. Daemon runs silently**

The daemon fires each commit at its exact scheduled time — real `git add`, `git commit`, and `git push` operations at real clock times. Because the timestamps are authentic, GitHub's activity feed, push timestamps, and contribution graph all align perfectly. Employers won't see this, just add a fake busy tag and a realistic mouse mover. Now go grab a coffee or go for a run. 

**3. Check progress anytime**

`gitdrop status` shows what has fired and what is still pending.

---

## Install

```bash
git clone https://github.com/your-username/gitdrop.git
cd gitdrop
npm install
npm run build
```

Optionally install globally so you can run `gitdrop` from anywhere:

```bash
npm link
```

---

## Quick start

```bash
# 1. Generate a config file
gitdrop init

# 2. Edit gitdrop.yaml — set your remote URL, source directory, and time window

# 3. Preview the auto-generated schedule (no commits made)
gitdrop preview

# 4. Start the daemon — it will exit immediately and run in the background
gitdrop run
```

---

## Configuration (`gitdrop.yaml`)

```yaml
# GitHub repository URL
# Embed a Personal Access Token for authentication:
#   https://<TOKEN>@github.com/username/repo.git
remote: "https://github.com/your-username/your-repo.git"

# Path to your local project (the source of truth)
sourceDir: "./my-project"

# Time window — commits will be spread across this range
window:
  start: "09:00"
  end:   "17:00"
  # date: "2026-02-19"  # optional; defaults to today

# How to group files into commits:
#   directory — one commit per top-level folder (recommended, most natural-looking)
#   file      — one commit per changed file
#   filetype  — one commit per file extension
chunkBy: "directory"

# Optional: override the git author identity on commits
# author:
#   name: "Your Name"
#   email: "you@example.com"

# Push strategy:
#   after-each — push immediately after every commit (recommended)
#   batch-end  — push everything at once after the final commit
pushStrategy: "after-each"
```

### Authentication

Embed a [Personal Access Token](https://github.com/settings/tokens) directly in the remote URL:

```
https://ghp_YourTokenHere@github.com/username/repo.git
```

---

## Commands

### `gitdrop init [output]`

Scaffold a sample `gitdrop.yaml` in the current directory.

```bash
gitdrop init
gitdrop init my-config.yaml
```

---

### `gitdrop preview [config]`

Diff your local source against the remote, compute the commit schedule, and display it — without executing anything.

```bash
gitdrop preview
gitdrop preview my-config.yaml
```

Example output:

```
─── gitdrop Preview ─────────────────────────────────
Remote:       https://github.com/user/repo.git
Source:       /home/user/my-project
Date:         Thu, Feb 19, 2026
Window:       09:00 → 17:00
Chunk by:     directory
Commits:      4

  [OK]   #1  09:47 AM  src        "Update src"
              ↳ src/index.ts
              ↳ src/utils/logger.ts

  [OK]   #2  11:32 AM  tests      "Update tests"
              ↳ tests/index.test.ts

  [OK]   #3  02:15 PM  root       "Update project config"
              ↳ package.json
              ↳ README.md

  [OK]   #4  04:51 PM  docs       "Update docs"
              ↳ docs/api.md

Ready to schedule 4 commit(s). Run: gitdrop run
```

---

### `gitdrop run [config]`

Diff, chunk, schedule, and start the background daemon. The command prints a summary and exits — you can close the terminal.

```bash
gitdrop run
gitdrop run my-config.yaml
```

Example output:

```
─── gitdrop Running ──────────────────────────────────
Background daemon started. ID: m5k2xr4f

Date:    Thu, Feb 19, 2026
Window:  09:00 → 17:00
Commits: 4

  #1  09:47 AM  src    "Update src"
  #2  11:32 AM  tests  "Update tests"
  #3  02:15 PM  root   "Update project config"
  #4  04:51 PM  docs   "Update docs"

Logs:    ~/.gitdrop/logs/m5k2xr4f.log
Status:  gitdrop status m5k2xr4f

You can close this terminal — commits will fire automatically.
```

---

### `gitdrop status [id]`

Check the status of a running or completed schedule. Omit the ID to see all schedules.

```bash
gitdrop status
gitdrop status m5k2xr4f
```

---

## How commits are grouped

gitdrop uses the `chunkBy` setting to decide how to bundle changed files into individual commits:

| Strategy | Behavior | Example commit |
|---|---|---|
| `directory` | One commit per top-level folder | `"Update src"` |
| `file` | One commit per changed file | `"Update index.ts"` |
| `filetype` | One commit per file extension | `"Update .ts files"` |

Files at the root level (not inside any folder) are grouped together as `root`.

---

## Timing

Commits are distributed evenly across your time window, then two layers of jitter are applied to make the pattern look human:

**Time jitter — ±20% of the interval between commits (capped at ±18 minutes)**

This makes the gaps between commits look irregular. A uniform schedule is the most obvious tell:

```
# Robotic — immediately suspicious
09:00, 11:00, 13:00, 15:00, 17:00

# gitdrop output — looks like a person
09:14, 10:47, 13:22, 15:03, 16:51
```

**Seconds jitter — randomised to 0–59**

Every timestamp gets a random seconds value. Humans don't commit at exactly `:00`. A manager scanning a history of `09:15:00`, `11:00:00`, `13:00:00` knows it's a script. `09:15:34`, `11:03:17`, `12:58:52` does not raise that flag.

If some scheduled times have already passed when you run `gitdrop run`, those commits are skipped with a warning. Adjust `window.start` to a future time or run earlier in the day.

---

## Runtime files

gitdrop stores daemon state in `~/.gitdrop/`:

```
~/.gitdrop/
  schedules/
    <id>.json     # schedule definition (deleted after daemon completes)
  logs/
    <id>.log           # real-time daemon log
    <id>-results.json  # commit results summary (written on completion)
```

---
