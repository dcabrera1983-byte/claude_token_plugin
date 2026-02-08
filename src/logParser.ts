import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Types for JSONL entry data

export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
}

export interface ParsedEntry {
    requestId: string;
    model: string;
    timestamp: string;
    usage: TokenUsage;
}

export interface DailyUsage {
    date: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    requestCount: number;
}

export interface ModelDailyUsage {
    date: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    requestCount: number;
}

/**
 * Find the Claude projects directory.
 * Checks ~/.claude/projects/ first, falls back to ~/.config/claude/projects/
 */
export function getProjectsDir(): string | null {
    const home = os.homedir();
    const primary = path.join(home, '.claude', 'projects');
    const fallback = path.join(home, '.config', 'claude', 'projects');

    if (fs.existsSync(primary)) {
        return primary;
    }
    if (fs.existsSync(fallback)) {
        return fallback;
    }
    return null;
}

/**
 * Convert a workspace folder path to the Claude project directory name format.
 * Claude encodes paths by replacing ':' and path separators with '-'.
 * e.g. 'C:\Users\dcabr\Repos\my-project' -> 'C--Users-dcabr-Repos-my-project'
 */
export function workspacePathToProjectDir(workspacePath: string): string {
    return workspacePath.replace(/:/g, '-').replace(/[\\/]/g, '-');
}

/**
 * Convert an encoded project directory name back to a readable display name.
 * e.g. "C--Users-dcabr-Repos-my-project" -> "my project"
 */
export function formatProjectName(encodedDir: string): string {
    const parts = encodedDir.split('-');

    const commonParents = ['repos', 'projects', 'src', 'documents', 'desktop', 'home', 'users'];
    let lastParentIndex = -1;
    for (let i = 0; i < parts.length; i++) {
        if (commonParents.includes(parts[i].toLowerCase())) {
            lastParentIndex = i;
        }
    }

    if (lastParentIndex >= 0 && lastParentIndex < parts.length - 1) {
        return parts.slice(lastParentIndex + 1).join(' ');
    }

    return encodedDir;
}

/**
 * Find all .jsonl session files under the projects directory.
 * If projectDirFilter is provided, only includes files from that specific project directory.
 */
export function findSessionFiles(projectsDir: string, projectDirFilter?: string): string[] {
    const files: string[] = [];

    let projectDirs: string[];
    try {
        projectDirs = fs.readdirSync(projectsDir);
    } catch {
        return files;
    }

    for (const dir of projectDirs) {
        // If a filter is set, skip directories that don't match (case-insensitive)
        if (projectDirFilter && dir.toLowerCase() !== projectDirFilter.toLowerCase()) {
            continue;
        }

        const dirPath = path.join(projectsDir, dir);
        let stat;
        try {
            stat = fs.statSync(dirPath);
        } catch {
            continue;
        }
        if (!stat.isDirectory()) {
            continue;
        }

        let entries: string[];
        try {
            entries = fs.readdirSync(dirPath);
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (entry.endsWith('.jsonl')) {
                files.push(path.join(dirPath, entry));
            }
        }
    }

    return files;
}

/**
 * Parse a single JSONL file and extract deduplicated assistant entries.
 * Deduplicates by requestId, keeping the last entry per request.
 */
export function parseSessionFile(filePath: string): ParsedEntry[] {
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch {
        return [];
    }

    const lines = content.split('\n').filter(line => line.trim().length > 0);

    // Collect assistant entries, keyed by requestId (last one wins)
    const byRequestId = new Map<string, ParsedEntry>();

    for (const line of lines) {
        let entry: any;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }

        if (entry.type !== 'assistant') {
            continue;
        }

        const requestId = entry.requestId;
        if (!requestId) {
            continue;
        }

        const usage = entry.message?.usage;
        if (!usage) {
            continue;
        }

        byRequestId.set(requestId, {
            requestId,
            model: entry.message?.model || 'unknown',
            timestamp: entry.timestamp || '',
            usage: {
                input_tokens: usage.input_tokens || 0,
                output_tokens: usage.output_tokens || 0,
                cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
                cache_read_input_tokens: usage.cache_read_input_tokens || 0,
            },
        });
    }

    return Array.from(byRequestId.values());
}

/**
 * Parse all session files and aggregate usage by date.
 */
export function aggregateByDate(entries: ParsedEntry[]): DailyUsage[] {
    const byDate = new Map<string, DailyUsage>();

    for (const entry of entries) {
        const date = entry.timestamp.slice(0, 10); // "2026-02-08"
        if (!date) {
            continue;
        }

        let daily = byDate.get(date);
        if (!daily) {
            daily = {
                date,
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                requestCount: 0,
            };
            byDate.set(date, daily);
        }

        daily.input_tokens += entry.usage.input_tokens;
        daily.output_tokens += entry.usage.output_tokens;
        daily.cache_creation_input_tokens += entry.usage.cache_creation_input_tokens;
        daily.cache_read_input_tokens += entry.usage.cache_read_input_tokens;
        daily.requestCount += 1;
    }

    // Sort by date descending (most recent first)
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Aggregate parsed entries by date AND model.
 * Returns entries sorted by date descending, then model name ascending.
 */
export function aggregateByDateAndModel(entries: ParsedEntry[]): ModelDailyUsage[] {
    const byKey = new Map<string, ModelDailyUsage>();

    for (const entry of entries) {
        const date = entry.timestamp.slice(0, 10);
        if (!date) {
            continue;
        }

        const key = `${date}|${entry.model}`;
        let item = byKey.get(key);
        if (!item) {
            item = {
                date,
                model: entry.model,
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                requestCount: 0,
            };
            byKey.set(key, item);
        }

        item.input_tokens += entry.usage.input_tokens;
        item.output_tokens += entry.usage.output_tokens;
        item.cache_creation_input_tokens += entry.usage.cache_creation_input_tokens;
        item.cache_read_input_tokens += entry.usage.cache_read_input_tokens;
        item.requestCount += 1;
    }

    return Array.from(byKey.values()).sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) { return dateCompare; }
        return a.model.localeCompare(b.model);
    });
}

/**
 * Get today's date string in YYYY-MM-DD format (local time).
 */
export function getTodayDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export interface ProjectUsage {
    projectDir: string;
    dailyUsage: DailyUsage[];
    modelDailyUsage: ModelDailyUsage[];
}

/**
 * Get usage for every project directory, returned as an array of per-project summaries.
 * Each entry contains the encoded project directory name and its daily usage breakdown.
 */
export function getUsageByProject(): ProjectUsage[] {
    const projectsDir = getProjectsDir();
    if (!projectsDir) {
        return [];
    }

    let projectDirs: string[];
    try {
        projectDirs = fs.readdirSync(projectsDir);
    } catch {
        return [];
    }

    const results: ProjectUsage[] = [];

    for (const dir of projectDirs) {
        const dirPath = path.join(projectsDir, dir);
        let stat;
        try {
            stat = fs.statSync(dirPath);
        } catch {
            continue;
        }
        if (!stat.isDirectory()) {
            continue;
        }

        let entries: string[];
        try {
            entries = fs.readdirSync(dirPath);
        } catch {
            continue;
        }

        const allEntries: ParsedEntry[] = [];
        for (const entry of entries) {
            if (entry.endsWith('.jsonl')) {
                const parsed = parseSessionFile(path.join(dirPath, entry));
                allEntries.push(...parsed);
            }
        }

        if (allEntries.length > 0) {
            results.push({
                projectDir: dir,
                dailyUsage: aggregateByDate(allEntries),
                modelDailyUsage: aggregateByDateAndModel(allEntries),
            });
        }
    }

    return results;
}

/**
 * Main entry point: parse all logs and return daily usage summaries.
 * Reads from all project directories.
 */
export function getAllUsage(): DailyUsage[] {
    const projectsDir = getProjectsDir();
    if (!projectsDir) {
        return [];
    }

    const sessionFiles = findSessionFiles(projectsDir);
    const allEntries: ParsedEntry[] = [];

    for (const file of sessionFiles) {
        const entries = parseSessionFile(file);
        allEntries.push(...entries);
    }

    return aggregateByDate(allEntries);
}

/**
 * Get usage for a specific project only.
 * @param workspacePath The absolute path of the workspace root folder.
 */
export function getProjectUsage(workspacePath: string): DailyUsage[] {
    const projectsDir = getProjectsDir();
    if (!projectsDir) {
        return [];
    }

    const projectDirName = workspacePathToProjectDir(workspacePath);
    const sessionFiles = findSessionFiles(projectsDir, projectDirName);
    const allEntries: ParsedEntry[] = [];

    for (const file of sessionFiles) {
        const entries = parseSessionFile(file);
        allEntries.push(...entries);
    }

    return aggregateByDate(allEntries);
}

/**
 * Get today's usage for a specific project. Returns null if no data for today.
 * @param workspacePath The absolute path of the workspace root folder.
 */
export function getTodayProjectUsage(workspacePath: string): DailyUsage | null {
    const today = getTodayDate();
    const usage = getProjectUsage(workspacePath);
    return usage.find(d => d.date === today) || null;
}

/**
 * Get today's usage summary across all projects. Returns null if no data for today.
 */
export function getTodayUsage(): DailyUsage | null {
    const today = getTodayDate();
    const allUsage = getAllUsage();
    return allUsage.find(d => d.date === today) || null;
}
