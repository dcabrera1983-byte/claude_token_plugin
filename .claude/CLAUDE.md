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

### Core Components

1. **File watcher** (`fileWatcher.ts`) — `vscode.workspace.createFileSystemWatcher` on `**/*.jsonl` under `~/.claude/projects/` for live updates. Triggers refresh of all UI components on file change/create.
2. **Log parser** (`logParser.ts`) — Reads JSONL, filters to `type === "assistant"`, deduplicates by `requestId` (keeps last entry), extracts `message.usage`. Aggregates by date and by date+model. Supports per-project and all-project queries.
3. **Status bar item** (`statusBar.ts`) — Shows today's summary (e.g. `$(pulse) Claude: 2.5k in / 1.2k out`). Tooltip shows full token breakdown and estimated cost. Click opens the details panel. Workspace-aware: shows current project usage when a workspace is open.
4. **Sidebar panel** (`sidebarView.ts`) — Activity bar webview showing model-by-model token cards for the current workspace project. Displays tokens, cost, energy, and trees burned per model. Includes links to "View Full Report" and "Settings".
5. **Webview details panel** (`webviewPanel.ts`) — Full breakdown table of all projects grouped by date and model. Columns: Date, Model, Input, Output, Cache Create, Cache Read, Requests, Est. Cost. Shows per-project subtotals and grand total.
6. **Unit conversions** (`units.ts`) — Converts token counts to selected display unit. Supports per-model pricing from VSCode settings with hardcoded defaults.
7. **Commands** — Three registered commands: Refresh Usage, Show Details, Open Settings.

### Display Units

The extension supports configurable display units via VSCode settings. The user selects one unit and all UI surfaces (status bar, webview) present values in that unit. Default is raw token count.

| Unit ID         | Label              | Description                                    |
|-----------------|--------------------|------------------------------------------------|
| `tokens`        | Token Count        | Raw token numbers (default)                    |
| `cost_usd`      | USD Cost           | Dollar cost calculated from per-model pricing  |
| `energy_kwh`    | Energy (kWh)       | Estimated energy consumption                   |
| `trees_burned`  | Trees Burned       | Fun/illustrative environmental metric          |

Additional fun/educational units can be added over time. Each unit is a simple conversion function from token counts.

### Settings

The extension exposes 17 configuration properties under `claudeTokenTracker.*`:

- **Display:** `displayUnit` (tokens | cost_usd | energy_kwh | trees_burned), `showStatusBar`, `showSidebar`
- **Per-model pricing** (per million tokens): `pricing.{opus|sonnet|haiku}.{input|output|cacheCreation|cacheRead}`

### Data Aggregation

Group entries by `timestamp.slice(0, 10)` for daily summaries. Also aggregate by date + model for per-model breakdowns. Aggregate by project directory for per-project views.

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
