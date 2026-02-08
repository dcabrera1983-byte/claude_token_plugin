# Claude Code Log Format Reference

This document describes the actual structure, file layout, and data format of Claude Code's local usage logs as observed on a live installation (Claude Code v2.1.37, February 2026).

---

## 1. Root Directory

All Claude Code data lives under:

```
%USERPROFILE%\.claude\          (Windows)
~/.claude/                      (macOS / Linux)
```

Key contents at this level:

| Path                  | Type      | Description                                             |
|-----------------------|-----------|---------------------------------------------------------|
| `projects/`           | Directory | Per-project session logs (primary data source)          |
| `stats-cache.json`    | File      | Pre-aggregated usage statistics across all projects     |
| `history.jsonl`       | File      | Command/prompt history across all sessions              |
| `settings.json`       | File      | User-level Claude Code settings                         |
| `cache/`              | Directory | Internal caches                                         |
| `file-history/`       | Directory | File backup history                                     |

---

## 2. Project Directory Structure

```
~/.claude/projects/
├── C--Users-dcabr-Repos-claude-token-plugin/    # Project A
│   ├── 4b6ff35f-6038-4689-89f5-12a12a793d0d.jsonl   # Session transcript
│   ├── 3a19eba6-bcf8-46c5-9ea4-80d329bb8c94.jsonl   # Another session
│   ├── 3a19eba6-bcf8-46c5-9ea4-80d329bb8c94/        # Session file-history dir
│   └── memory/                                        # Project memory files
├── c--Users-dcabr-Repos-other-project/          # Project B
│   └── ...
```

### Project Directory Naming Convention

Project directories are named after the **absolute filesystem path** to the project, with:
- Path separators (`\` or `/`) replaced by `--`
- Drive letters included (on Windows)
- Case may vary (both `C--` and `c--` have been observed)

**Examples:**
| Actual Project Path                          | Directory Name                                    |
|----------------------------------------------|---------------------------------------------------|
| `C:\Users\dcabr\Repos\claude-token-plugin`   | `C--Users-dcabr-Repos-claude-token-plugin`        |
| `C:\Users\dcabr\Repos`                       | `C--Users-dcabr-Repos`                            |
| `C:\Users\dcabr`                             | `C--Users-dcabr`                                  |

### Session File Naming

Each Claude Code session produces one JSONL file named after the session's UUID:

```
<session-uuid>.jsonl
```

- Example: `4b6ff35f-6038-4689-89f5-12a12a793d0d.jsonl`
- A new file is created for each new session (each time `claude` is launched without `--continue`)
- Files grow as the conversation progresses; there is **no rotation or truncation**
- A corresponding directory `<session-uuid>/` may also be created for file-history backups

> **Important:** There is no `usage.jsonl` file. The Project_Summary.md reference to `usage.jsonl` was incorrect. All data — including token usage — is embedded within these per-session transcript files.

---

## 3. JSONL Entry Types

Each line in a session JSONL file is a self-contained JSON object. The `type` field identifies the entry kind.

### 3.1 Common Fields (present on most entries)

| Field         | Type           | Description                                             | Example                                      |
|---------------|----------------|---------------------------------------------------------|----------------------------------------------|
| `type`        | string         | Entry type discriminator                                | `"user"`, `"assistant"`, `"progress"`        |
| `uuid`        | string (UUID)  | Unique identifier for this entry                        | `"db6bcbc1-8bed-4ba6-8aa0-4497feb9433b"`     |
| `parentUuid`  | string or null | UUID of the parent entry (null for root)                | `"72904397-2807-4ce8-8c77-458627e3c7fc"`     |
| `sessionId`   | string (UUID)  | Session identifier (matches the filename)               | `"4b6ff35f-6038-4689-89f5-12a12a793d0d"`     |
| `timestamp`   | string (ISO-8601) | When the entry was created                           | `"2026-02-08T13:00:19.950Z"`                 |
| `cwd`         | string         | Working directory at time of entry                      | `"C:\\Users\\dcabr\\Repos\\claude_token_plugin"` |
| `version`     | string         | Claude Code version                                     | `"2.1.37"`                                   |
| `gitBranch`   | string         | Current git branch                                      | `"HEAD"`, `"main"`                           |
| `isSidechain` | boolean        | Whether this is part of a sidechain conversation        | `false`                                      |
| `userType`    | string         | User classification                                     | `"external"`                                 |

### 3.2 Entry Type: `"assistant"`

**This is the primary entry type for token usage data.** Created when Claude responds.

```jsonc
{
  "type": "assistant",
  "parentUuid": "5cc2dac0-8ffe-463a-9e8f-95d8a8122a53",
  "sessionId": "4b6ff35f-6038-4689-89f5-12a12a793d0d",
  "timestamp": "2026-02-08T13:00:19.950Z",
  "uuid": "db6bcbc1-8bed-4ba6-8aa0-4497feb9433b",
  "requestId": "req_011CXveHwjtY6Yq3qazbGMg8",
  "message": {
    "model": "claude-opus-4-6",
    "id": "msg_01YWes5Cj9ik5nVf2zaiLUDQ",
    "type": "message",
    "role": "assistant",
    "content": [
      { "type": "text", "text": "..." },
      { "type": "tool_use", "id": "toolu_...", "name": "Bash", "input": {...} },
      { "type": "thinking", "thinking": "...", "signature": "..." }
    ],
    "stop_reason": null,            // or "end_turn", "tool_use"
    "stop_sequence": null,
    "usage": {
      "input_tokens": 3,
      "output_tokens": 180,
      "cache_creation_input_tokens": 8879,
      "cache_read_input_tokens": 10414,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 8879
      },
      "server_tool_use": {
        "web_search_requests": 0,
        "web_fetch_requests": 0
      },
      "service_tier": "standard"
    }
  },
  // common fields (cwd, version, gitBranch, etc.)
}
```

**Key observations:**
- A single API request may produce **multiple assistant entries** as content streams in (partial text, then tool use, then more text). Each entry carries the same `requestId` and `message.id` but different `uuid` values.
- The `message.usage` block is repeated on each streaming entry for the same request. To avoid double-counting, **deduplicate by `requestId`** (or `message.id`) and take the usage from the **last entry for each request**.
- The `output_tokens` field is cumulative within a single request's streaming entries — it grows with each entry. Use the **final value** for the request.

### 3.3 Entry Type: `"user"`

User messages and tool results.

```jsonc
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "user prompt text here"
    // OR for tool results:
    // "content": [{ "type": "tool_result", "tool_use_id": "toolu_...", "content": "..." }]
  },
  "isMeta": true,  // present on system-injected messages (not user-typed)
  // common fields
}
```

- No token usage data on user entries.
- `isMeta: true` indicates system-generated messages (like command expansions), not actual user input.

### 3.4 Entry Type: `"file-history-snapshot"`

Tracks file state for undo/restore capability.

```jsonc
{
  "type": "file-history-snapshot",
  "messageId": "72904397-2807-4ce8-8c77-458627e3c7fc",
  "snapshot": {
    "messageId": "72904397-...",
    "trackedFileBackups": {},  // or { "CLAUDE.md": { "backupFileName": null, "version": 1, ... }}
    "timestamp": "2026-02-08T13:00:16.804Z"
  },
  "isSnapshotUpdate": false  // true when updating an existing snapshot
}
```

- No token usage data. Not relevant for token tracking.

### 3.5 Entry Type: `"progress"`

Hook execution progress updates.

```jsonc
{
  "type": "progress",
  "data": {
    "type": "hook_progress",
    "hookEvent": "PostToolUse",
    "hookName": "PostToolUse:Glob",
    "command": "callback"
  },
  "parentToolUseID": "toolu_...",
  "toolUseID": "toolu_...",
  // common fields
}
```

- No token usage data. Not relevant for token tracking.

---

## 4. Token Usage Fields (Detail)

All token usage is found at `message.usage` on `type: "assistant"` entries.

| Field Path                                    | Type   | Description                                    |
|-----------------------------------------------|--------|------------------------------------------------|
| `message.usage.input_tokens`                  | number | Non-cached input tokens sent to the model      |
| `message.usage.output_tokens`                 | number | Tokens generated by the model                  |
| `message.usage.cache_creation_input_tokens`   | number | Input tokens written to cache                  |
| `message.usage.cache_read_input_tokens`       | number | Input tokens read from cache                   |
| `message.usage.cache_creation.ephemeral_5m_input_tokens`  | number | Tokens in 5-minute ephemeral cache   |
| `message.usage.cache_creation.ephemeral_1h_input_tokens`  | number | Tokens in 1-hour ephemeral cache     |
| `message.usage.server_tool_use.web_search_requests`       | number | Web search tool invocations          |
| `message.usage.server_tool_use.web_fetch_requests`        | number | Web fetch tool invocations           |
| `message.usage.service_tier`                  | string | API service tier (e.g., `"standard"`)          |

### Model Identification

The model name is at `message.model`. Observed values:

| Model ID                           | Display Name       |
|------------------------------------|--------------------|
| `claude-opus-4-6`                  | Claude Opus 4.6    |
| `claude-opus-4-5-20251101`         | Claude Opus 4.5    |
| `claude-sonnet-4-5-20250929`       | Claude Sonnet 4.5  |

### Cost Calculation

No `costUSD` field is present on individual session entries. Costs must be calculated from token counts. Current Anthropic API pricing (verify against current rates):

| Token Type                | Cost per Million Tokens |
|---------------------------|------------------------|
| Input tokens              | $15.00                 |
| Output tokens             | $75.00                 |
| Cache creation tokens     | $18.75                 |
| Cache read tokens         | $1.50                  |

> **Note:** These prices are for Opus-class models. Sonnet/Haiku models have different (lower) pricing. The extension should maintain a pricing table per model family.

---

## 5. Supporting Files

### 5.1 `stats-cache.json`

Location: `~/.claude/stats-cache.json`

Pre-aggregated usage statistics across all projects and sessions. This file could serve as a quick-read data source for high-level summaries.

```jsonc
{
  "version": 2,
  "lastComputedDate": "2026-02-07",
  "dailyActivity": [
    { "date": "2026-01-05", "messageCount": 114, "sessionCount": 4, "toolCallCount": 37 }
  ],
  "dailyModelTokens": [
    { "date": "2026-01-05", "tokensByModel": { "claude-sonnet-4-5-20250929": 20445 } }
  ],
  "modelUsage": {
    "claude-sonnet-4-5-20250929": {
      "inputTokens": 3403,
      "outputTokens": 18142,
      "cacheReadInputTokens": 1846776,
      "cacheCreationInputTokens": 244437,
      "webSearchRequests": 0,
      "costUSD": 0,
      "contextWindow": 0,
      "maxOutputTokens": 0
    }
  },
  "totalSessions": 11,
  "totalMessages": 629,
  "longestSession": {
    "sessionId": "3e52aef4-...",
    "duration": 194703288,
    "messageCount": 133,
    "timestamp": "2026-01-23T19:51:50.031Z"
  },
  "firstSessionDate": "2026-01-05T17:31:51.827Z",
  "hourCounts": { "12": 1, "13": 1, "14": 2 },
  "totalSpeculationTimeSavedMs": 0
}
```

**Caveats:**
- `lastComputedDate` indicates when this cache was last rebuilt — it may lag behind real-time
- `costUSD` is always `0` in observed data (not populated by Claude Code)
- `dailyModelTokens[].tokensByModel` values appear to be **output tokens only** (not total)
- This file is written by Claude Code itself and may not update on every session

### 5.2 `history.jsonl`

Location: `~/.claude/history.jsonl`

Each line records a user prompt/command across all sessions:

```jsonc
{
  "display": "This is the user prompt text",
  "pastedContents": {},
  "timestamp": 1770556322806,          // Unix epoch milliseconds
  "project": "C:\\Users\\dcabr\\Repos\\claude_token_plugin",
  "sessionId": "4b6ff35f-6038-4689-89f5-12a12a793d0d"
}
```

- Useful for mapping sessions to projects and tracking activity timestamps
- Not relevant for token counting

---

## 6. Log Lifecycle and Retention

| Aspect          | Behavior                                                                 |
|-----------------|--------------------------------------------------------------------------|
| Creation        | New `.jsonl` file per session (each `claude` launch without `--continue`)|
| Growth          | Appended in real-time as conversation progresses                         |
| Rotation        | **None** — files accumulate indefinitely                                 |
| Deletion        | Manual only; Claude Code does not auto-prune                             |
| File size       | Varies widely; a single session can be 50KB to 500KB+                    |
| Update frequency| Lines appended after each API round-trip (typically every few seconds)   |

---

## 7. Deduplication Strategy

Because Claude Code streams responses, a single API request generates **multiple JSONL entries** of type `"assistant"` with the same `requestId`. Each carries cumulative `output_tokens`.

**Recommended approach:**
1. Filter entries to `type === "assistant"`
2. Group by `requestId` (or `message.id`)
3. Take the **last entry** in each group (highest `output_tokens`)
4. Sum `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` across all unique requests

---

## 8. Platform Differences

| Aspect               | Windows                              | macOS / Linux                    |
|-----------------------|--------------------------------------|----------------------------------|
| Base path             | `%USERPROFILE%\.claude\`             | `~/.claude/`                     |
| Alt. path (newer CLI) | `%USERPROFILE%\.config\claude\`      | `~/.config/claude/`              |
| Path separator in dir names | `--` (same)                    | `--` (same)                      |
| Drive letter in dir names   | Included (e.g., `C--Users-...`) | Not applicable                  |

> **Note:** Newer versions of Claude Code may store data under `~/.config/claude/` instead of `~/.claude/`. The extension should check both locations.
