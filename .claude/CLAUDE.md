# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A cross-platform (Windows, macOS, Linux) VSCode extension that tracks and displays Claude Code token usage by parsing local JSONL log files. Operates entirely locally with no network calls.

## Architecture

The extension reads Claude Code's session transcript logs from `~/.claude/projects/<project-dir>/<session-uuid>.jsonl`. Token usage data is embedded on `type: "assistant"` entries at `message.usage`. See `docs/Log_Format_Reference.md` for the complete schema.

### Data Source

- **Location:** `~/.claude/projects/` — one subdirectory per project (named after project path with `--` separators)
- **Format:** Per-session JSONL transcripts (`<uuid>.jsonl`), appended in real-time. No separate `usage.jsonl` file exists.
- **Token fields (on assistant entries):** `message.usage.input_tokens`, `message.usage.output_tokens`, `message.usage.cache_creation_input_tokens`, `message.usage.cache_read_input_tokens`
- **Cost calculation:** No `costUSD` on individual entries. Must calculate from token counts using per-model pricing.
- **Deduplication:** Streaming produces multiple entries per request (same `requestId`). Use the last entry per `requestId`.
- **Alternative data source:** `~/.claude/stats-cache.json` has pre-aggregated totals (may lag real-time)

### Core Components (Planned)

1. **File watcher** — `vscode.workspace.createFileSystemWatcher` on `**/*.jsonl` under `~/.claude/projects/` for live updates
2. **Log parser** — Reads JSONL, filters to `type === "assistant"`, deduplicates by `requestId`, extracts `message.usage`
3. **Status bar item** — Shows summary like "Today: 2.5k in / 1.2k out ($0.45)", click for details
4. **Webview panel** — 7-day breakdown table with input/output/cache columns
5. **Configuration panel** — Settings UI to choose display unit (see Display Units below)
6. **Commands** — e.g. "Refresh Usage" via `commands.registerCommand()`

### Display Units

The extension supports configurable display units via VSCode settings. The user selects one unit and all UI surfaces (status bar, webview) present values in that unit. Default is raw token count.

| Unit ID         | Label              | Description                                    |
|-----------------|--------------------|------------------------------------------------|
| `tokens`        | Token Count        | Raw token numbers (default)                    |
| `cost_usd`      | USD Cost           | Dollar cost calculated from per-model pricing  |
| `energy_kwh`    | Energy (kWh)       | Estimated energy consumption                   |
| `trees_burned`  | Trees Burned       | Fun/illustrative environmental metric          |

Additional fun/educational units can be added over time. Each unit is a simple conversion function from token counts.

### Data Aggregation

Group entries by `timestamp.slice(0, 10)` for daily summaries. Aggregate by project directory for per-project views.

## Build & Development

This is a VSCode extension project. Standard commands (update as scaffolding is added):

```
npm install          # install dependencies
npm run compile      # build
npm run watch        # build in watch mode
npm run lint         # lint
F5 in VSCode         # launch Extension Development Host for testing
```

## Testing

Generate test data by running Claude Code prompts and verifying the file watcher triggers and parses correctly.
