# Claude Token Tracker

A VSCode extension that tracks and displays Claude Code token usage by parsing local JSONL session logs. Operates entirely locally with no network calls.

## Features

- **Status Bar** -- Today's token usage at a glance, with detailed tooltip. Click to open the full report.
- **Sidebar Panel** -- Per-model token breakdown for the current workspace project, showing cost, energy, and request counts.
- **Details Panel** -- Full usage table across all projects, grouped by date and model.
- **Configurable Pricing** -- Per-model token pricing (Opus, Sonnet, Haiku) adjustable via VSCode settings.
- **Multiple Display Units** -- View usage as raw tokens, USD cost, energy (kWh), or "trees burned".
- **Live Updates** -- File watcher monitors Claude Code's log files and refreshes displays in real-time.

## How It Works

Claude Code writes session transcripts to `~/.claude/projects/<project-dir>/<session-uuid>.jsonl`. This extension watches those files, parses `type: "assistant"` entries, deduplicates by `requestId`, and aggregates token usage by date and model.

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
- [VSCode](https://code.visualstudio.com/) (v1.109.0+)
- Claude Code installed (provides the session log files)

## Build & Run

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Launch in VSCode Extension Development Host
# Press F5 in VSCode (uses .vscode/launch.json)
```

### Other Commands

```bash
npm run watch        # Compile in watch mode (auto-rebuild on changes)
npm run lint         # Run ESLint
npm run pretest      # Compile + lint
npm run test         # Run extension tests
```

### Packaging as VSIX

To create a `.vsix` file for installing the extension locally or sharing it:

```bash
# Install vsce (Visual Studio Code Extensions CLI) if you don't have it
npm install -g @vscode/vsce

# Package the extension into a .vsix file
vsce package
```

This produces a file like `claude-token-tracker-0.0.2.vsix`. To install it in VSCode:

```bash
code --install-extension claude-token-tracker-0.0.2.vsix
```

Or in VSCode: **Extensions** view > `...` menu > **Install from VSIX...**

## Extension Commands

Open the command palette (`Ctrl+Shift+P`) and search for:

| Command | Description |
|---------|-------------|
| `Claude Tokens: Refresh Usage` | Manually refresh all displays |
| `Claude Tokens: Show Details` | Open the full usage report panel |
| `Claude Tokens: Open Settings` | Jump to extension settings |

## Settings

All settings are under `claudeTokenTracker.*` in VSCode settings.

| Setting | Default | Description |
|---------|---------|-------------|
| `displayUnit` | `tokens` | Display unit: `tokens`, `cost_usd`, `energy_kwh`, or `trees_burned` |
| `showStatusBar` | `true` | Show/hide the status bar item |
| `showSidebar` | `true` | Show/hide the sidebar panel |
| `pricing.opus.input` | `5.00` | Opus input price per million tokens (USD) |
| `pricing.opus.output` | `25.00` | Opus output price per million tokens (USD) |
| `pricing.opus.cacheCreation` | `10.00` | Opus cache creation (1h) price per million tokens (USD) |
| `pricing.opus.cacheRead` | `0.50` | Opus cache read price per million tokens (USD) |
| `pricing.sonnet.input` | `3.00` | Sonnet input price per million tokens (USD) |
| `pricing.sonnet.output` | `15.00` | Sonnet output price per million tokens (USD) |
| `pricing.sonnet.cacheCreation` | `6.00` | Sonnet cache creation (1h) price per million tokens (USD) |
| `pricing.sonnet.cacheRead` | `0.30` | Sonnet cache read price per million tokens (USD) |
| `pricing.haiku.input` | `1.00` | Haiku input price per million tokens (USD) |
| `pricing.haiku.output` | `5.00` | Haiku output price per million tokens (USD) |
| `pricing.haiku.cacheCreation` | `2.00` | Haiku cache creation (1h) price per million tokens (USD) |
| `pricing.haiku.cacheRead` | `0.10` | Haiku cache read price per million tokens (USD) |

Pricing defaults are based on [current Anthropic API rates](https://platform.claude.com/docs/en/about-claude/pricing) as of February 2026.

## Project Structure

```
src/
  extension.ts      # Entry point, command registration, lifecycle
  logParser.ts      # JSONL parsing, deduplication, aggregation
  fileWatcher.ts    # File system watcher for live updates
  statusBar.ts      # Status bar item
  sidebarView.ts    # Sidebar webview panel
  webviewPanel.ts   # Details webview panel
  units.ts          # Display unit conversions and pricing
```

## License

ISC
