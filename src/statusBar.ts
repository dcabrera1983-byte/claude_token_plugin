import * as vscode from 'vscode';
import { getTodayProjectUsage, getTodayUsage } from './logParser.js';
import { getDisplayUnit, formatUsage, calculateCost } from './units.js';

let statusBarItem: vscode.StatusBarItem;

/**
 * Format a token count for display (e.g., 1234 -> "1.2k", 1234567 -> "1.2M").
 */
function formatTokenCount(count: number): string {
    if (count >= 1_000_000) {
        return (count / 1_000_000).toFixed(1) + 'M';
    }
    if (count >= 1_000) {
        return (count / 1_000).toFixed(1) + 'k';
    }
    return count.toString();
}

/**
 * Create and return the status bar item.
 */
export function createStatusBar(): vscode.StatusBarItem {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'claudeTokenTracker.showDetails';
    updateStatusBar();
    applyStatusBarVisibility();
    return statusBarItem;
}

/**
 * Show or hide the status bar item based on user settings.
 */
export function applyStatusBarVisibility(): void {
    if (!statusBarItem) {
        return;
    }
    const config = vscode.workspace.getConfiguration('claudeTokenTracker');
    const show = config.get<boolean>('showStatusBar', true);
    if (show) {
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

/**
 * Refresh the status bar text with current usage data.
 */
export function updateStatusBar(): void {
    if (!statusBarItem) {
        return;
    }

    // Use project-specific usage if a workspace is open, otherwise fall back to all projects
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const today = workspaceFolder
        ? getTodayProjectUsage(workspaceFolder)
        : getTodayUsage();

    if (!today) {
        statusBarItem.text = '$(pulse) Claude: No usage today';
        statusBarItem.tooltip = 'Claude Token Tracker — no usage recorded today';
        return;
    }

    const unit = getDisplayUnit();
    const usage = {
        input_tokens: today.input_tokens,
        output_tokens: today.output_tokens,
        cache_creation_input_tokens: today.cache_creation_input_tokens,
        cache_read_input_tokens: today.cache_read_input_tokens,
    };

    if (unit === 'tokens') {
        const inCount = formatTokenCount(today.input_tokens);
        const outCount = formatTokenCount(today.output_tokens);
        statusBarItem.text = `$(pulse) Claude: ${inCount} in / ${outCount} out`;
    } else {
        const formatted = formatUsage(usage, unit);
        statusBarItem.text = `$(pulse) Claude: ${formatted}`;
    }

    const cost = calculateCost(usage);
    statusBarItem.tooltip = [
        `Claude Token Tracker — Today`,
        `Input: ${today.input_tokens.toLocaleString()} tokens`,
        `Output: ${today.output_tokens.toLocaleString()} tokens`,
        `Cache create: ${today.cache_creation_input_tokens.toLocaleString()} tokens`,
        `Cache read: ${today.cache_read_input_tokens.toLocaleString()} tokens`,
        `Est. cost: $${cost.toFixed(4)}`,
        `Requests: ${today.requestCount}`,
    ].join('\n');
}
