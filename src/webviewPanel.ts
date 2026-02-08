import * as vscode from 'vscode';
import { getUsageByProject, formatProjectName, DailyUsage, ModelDailyUsage } from './logParser.js';
import { getDisplayUnit, calculateModelCost, getUnitLabel, getModelDisplayName } from './units.js';

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Refresh the webview panel content if it is currently open.
 */
export function refreshDetailsPanel(): void {
    if (currentPanel) {
        currentPanel.webview.html = getWebviewContent();
    }
}

/**
 * Show or focus the usage details webview panel.
 */
export function showDetailsPanel(): void {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        currentPanel.webview.html = getWebviewContent();
        return;
    }

    currentPanel = vscode.window.createWebviewPanel(
        'claudeTokenDetails',
        'Claude Token Usage',
        vscode.ViewColumn.One,
        { enableScripts: false }
    );

    currentPanel.webview.html = getWebviewContent();

    currentPanel.onDidDispose(() => {
        currentPanel = undefined;
    });
}

/**
 * Build the HTML content for the webview.
 */
function getWebviewContent(): string {
    const projects = getUsageByProject();
    const unit = getDisplayUnit();

    let projectSections = '';
    let grandTotalInput = 0;
    let grandTotalOutput = 0;
    let grandTotalCacheCreate = 0;
    let grandTotalCacheRead = 0;
    let grandTotalRequests = 0;
    let grandTotalCost = 0;

    for (const project of projects) {
        const name = formatProjectName(project.projectDir);
        const projTotals = sumDays(project.dailyUsage);

        // Calculate project cost accurately using per-model pricing
        let projCost = 0;
        for (const m of project.modelDailyUsage) {
            projCost += calculateModelCost(m, m.model);
        }

        grandTotalInput += projTotals.input_tokens;
        grandTotalOutput += projTotals.output_tokens;
        grandTotalCacheCreate += projTotals.cache_creation_input_tokens;
        grandTotalCacheRead += projTotals.cache_read_input_tokens;
        grandTotalRequests += projTotals.requestCount;
        grandTotalCost += projCost;

        // Group modelDailyUsage by date
        const byDate = new Map<string, ModelDailyUsage[]>();
        for (const entry of project.modelDailyUsage) {
            const list = byDate.get(entry.date) || [];
            list.push(entry);
            byDate.set(entry.date, list);
        }
        const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

        let rows = '';
        for (const date of sortedDates) {
            const models = byDate.get(date)!;
            let first = true;
            for (const m of models) {
                rows += buildModelRow(m, first);
                first = false;
            }
            rows += buildDateTotalRow(models);
        }

        projectSections += `
        <h2>${escapeHtml(name)}</h2>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Model</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Cache Create</th>
                    <th>Cache Read</th>
                    <th>Requests</th>
                    <th>Est. Cost</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="8" style="text-align:center; color: var(--vscode-descriptionForeground);">No usage data</td></tr>'}
            </tbody>
            ${project.dailyUsage.length > 0 ? `<tfoot>
                <tr>
                    <td>Project Total</td>
                    <td></td>
                    <td>${projTotals.input_tokens.toLocaleString()}</td>
                    <td>${projTotals.output_tokens.toLocaleString()}</td>
                    <td>${projTotals.cache_creation_input_tokens.toLocaleString()}</td>
                    <td>${projTotals.cache_read_input_tokens.toLocaleString()}</td>
                    <td>${projTotals.requestCount}</td>
                    <td>$${projCost.toFixed(2)}</td>
                </tr>
            </tfoot>` : ''}
        </table>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Token Usage</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        h1 {
            font-size: 1.4em;
            margin-bottom: 4px;
        }
        h2 {
            font-size: 1.1em;
            margin-top: 28px;
            margin-bottom: 4px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 4px;
        }
        .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            text-align: right;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        th:first-child, td:first-child,
        th:nth-child(2), td:nth-child(2) {
            text-align: left;
        }
        th {
            color: var(--vscode-descriptionForeground);
            font-weight: 600;
        }
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        tfoot td {
            font-weight: 600;
            border-top: 2px solid var(--vscode-widget-border);
        }
        .day-total td {
            font-weight: 600;
            border-top: 1px solid var(--vscode-widget-border);
            color: var(--vscode-descriptionForeground);
        }
        .summary {
            margin-top: 28px;
            padding: 12px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
    </style>
</head>
<body>
    <h1>Claude Token Usage</h1>
    <p class="subtitle">Breakdown by project &middot; Display unit: ${getUnitLabel(unit)}</p>

    ${projectSections || '<p style="color: var(--vscode-descriptionForeground);">No usage data found</p>'}

    <div class="summary">
        <strong>All Projects Total:</strong>
        Input: ${grandTotalInput.toLocaleString()} &middot;
        Output: ${grandTotalOutput.toLocaleString()} &middot;
        Requests: ${grandTotalRequests} &middot;
        Est. cost: $${grandTotalCost.toFixed(2)}
    </div>
</body>
</html>`;
}

/**
 * Build a single table row for a model's usage within a date.
 * Shows the date only on the first row of each date group.
 */
function buildModelRow(entry: ModelDailyUsage, showDate: boolean): string {
    const cost = calculateModelCost(entry, entry.model);
    const displayName = getModelDisplayName(entry.model);

    return `<tr>
        <td>${showDate ? entry.date : ''}</td>
        <td>${escapeHtml(displayName)}</td>
        <td>${entry.input_tokens.toLocaleString()}</td>
        <td>${entry.output_tokens.toLocaleString()}</td>
        <td>${entry.cache_creation_input_tokens.toLocaleString()}</td>
        <td>${entry.cache_read_input_tokens.toLocaleString()}</td>
        <td>${entry.requestCount}</td>
        <td>$${cost.toFixed(2)}</td>
    </tr>`;
}

/**
 * Build a subtotal row for a date group. Only shown when 2+ models exist for that date.
 */
function buildDateTotalRow(models: ModelDailyUsage[]): string {
    if (models.length <= 1) { return ''; }

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreate = 0;
    let totalCacheRead = 0;
    let totalRequests = 0;
    let totalCost = 0;

    for (const m of models) {
        totalInput += m.input_tokens;
        totalOutput += m.output_tokens;
        totalCacheCreate += m.cache_creation_input_tokens;
        totalCacheRead += m.cache_read_input_tokens;
        totalRequests += m.requestCount;
        totalCost += calculateModelCost(m, m.model);
    }

    return `<tr class="day-total">
        <td></td>
        <td>Day Total</td>
        <td>${totalInput.toLocaleString()}</td>
        <td>${totalOutput.toLocaleString()}</td>
        <td>${totalCacheCreate.toLocaleString()}</td>
        <td>${totalCacheRead.toLocaleString()}</td>
        <td>${totalRequests}</td>
        <td>$${totalCost.toFixed(2)}</td>
    </tr>`;
}

/**
 * Sum daily usage entries into a single totals object.
 */
function sumDays(days: DailyUsage[]): DailyUsage {
    return days.reduce(
        (acc, day) => {
            acc.input_tokens += day.input_tokens;
            acc.output_tokens += day.output_tokens;
            acc.cache_creation_input_tokens += day.cache_creation_input_tokens;
            acc.cache_read_input_tokens += day.cache_read_input_tokens;
            acc.requestCount += day.requestCount;
            return acc;
        },
        { date: 'Total', input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, requestCount: 0 }
    );
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
