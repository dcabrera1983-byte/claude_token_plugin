import * as vscode from 'vscode';
import { getUsageByProject, formatProjectName, workspacePathToProjectDir, ModelDailyUsage, TokenUsage } from './logParser.js';
import { calculateModelCost, calculateEnergy, calculateTreesBurned, getModelDisplayName } from './units.js';

interface ModelTotal {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    requestCount: number;
}

/**
 * Aggregate modelDailyUsage entries by model (collapse all dates into cumulative totals).
 */
function aggregateByModel(entries: ModelDailyUsage[]): ModelTotal[] {
    const byModel = new Map<string, ModelTotal>();

    for (const entry of entries) {
        let item = byModel.get(entry.model);
        if (!item) {
            item = {
                model: entry.model,
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                requestCount: 0,
            };
            byModel.set(entry.model, item);
        }

        item.input_tokens += entry.input_tokens;
        item.output_tokens += entry.output_tokens;
        item.cache_creation_input_tokens += entry.cache_creation_input_tokens;
        item.cache_read_input_tokens += entry.cache_read_input_tokens;
        item.requestCount += entry.requestCount;
    }

    return Array.from(byModel.values()).sort((a, b) => a.model.localeCompare(b.model));
}

class SidebarWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: false, enableCommandUris: true };
        webviewView.webview.html = this.getHtml();
    }

    refresh(): void {
        if (this._view) {
            this._view.webview.html = this.getHtml();
        }
    }

    private getHtml(): string {
        // Determine the current project
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const projects = getUsageByProject();

        let projectName = 'No project';
        let modelTotals: ModelTotal[] = [];

        if (workspaceFolders && workspaceFolders.length > 0) {
            const wsPath = workspaceFolders[0].uri.fsPath;
            const projectDirName = workspacePathToProjectDir(wsPath).toLowerCase();

            const match = projects.find(
                p => p.projectDir.toLowerCase() === projectDirName
            );

            if (match) {
                projectName = formatProjectName(match.projectDir);
                modelTotals = aggregateByModel(match.modelDailyUsage);
            } else {
                projectName = workspaceFolders[0].name;
            }
        }

        // Build grand total across all models
        const grandTotal: ModelTotal = {
            model: 'total',
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            requestCount: 0,
        };
        for (const m of modelTotals) {
            grandTotal.input_tokens += m.input_tokens;
            grandTotal.output_tokens += m.output_tokens;
            grandTotal.cache_creation_input_tokens += m.cache_creation_input_tokens;
            grandTotal.cache_read_input_tokens += m.cache_read_input_tokens;
            grandTotal.requestCount += m.requestCount;
        }

        // Calculate per-model costs and total cost
        let totalCost = 0;
        const modelCosts = new Map<string, number>();
        for (const m of modelTotals) {
            const cost = calculateModelCost(m, m.model);
            modelCosts.set(m.model, cost);
            totalCost += cost;
        }

        let cards = '';
        if (modelTotals.length === 0) {
            cards = '<p class="empty">No usage data for this project</p>';
        } else {
            for (const m of modelTotals) {
                cards += this.buildModelCard(m, modelCosts.get(m.model)!);
            }
            if (modelTotals.length > 1) {
                cards += this.buildModelCard(grandTotal, totalCost, true);
            }
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 8px;
            margin: 0;
        }
        .project-name {
            font-size: 1.1em;
            font-weight: 600;
            margin-bottom: 12px;
            padding-bottom: 4px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .card {
            margin-bottom: 12px;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            overflow: hidden;
        }
        .card-header {
            font-weight: 600;
            padding: 6px 10px;
            background-color: var(--vscode-list-hoverBackground);
        }
        .card-header.total {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        td {
            padding: 3px 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        td:last-child {
            text-align: right;
        }
        tr:last-child td {
            border-bottom: none;
        }
        .section-label {
            padding: 4px 10px 2px;
            font-size: 0.85em;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .empty {
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
        }
        .actions {
            margin-top: 12px;
            display: flex;
            gap: 8px;
        }
        .actions a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-size: 0.9em;
            cursor: pointer;
        }
        .actions a:hover {
            text-decoration: underline;
        }
        .separator {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="project-name">${escapeHtml(projectName)}</div>
    ${cards}
    <div class="actions">
        <a href="command:claudeTokenTracker.showDetails">View Full Report</a>
        <span class="separator">|</span>
        <a href="command:claudeTokenTracker.openSettings">Settings</a>
    </div>
</body>
</html>`;
    }

    private buildModelCard(m: ModelTotal, cost: number, isTotal: boolean = false): string {
        const displayName = isTotal ? 'Total' : getModelDisplayName(m.model);

        const usage: TokenUsage = {
            input_tokens: m.input_tokens,
            output_tokens: m.output_tokens,
            cache_creation_input_tokens: m.cache_creation_input_tokens,
            cache_read_input_tokens: m.cache_read_input_tokens,
        };

        const energy = calculateEnergy(usage);
        const trees = calculateTreesBurned(usage);

        const headerClass = isTotal ? 'card-header total' : 'card-header';
        const costDisplay = '$' + cost.toFixed(4);

        return `<div class="card">
            <div class="${headerClass}">${escapeHtml(displayName)}${!isTotal ? ` (${m.requestCount} requests)` : ` (${m.requestCount} requests)`}</div>
            <div class="section-label">Tokens</div>
            <table>
                <tr><td>Input</td><td>${m.input_tokens.toLocaleString()}</td></tr>
                <tr><td>Output</td><td>${m.output_tokens.toLocaleString()}</td></tr>
                <tr><td>Cache Create</td><td>${m.cache_creation_input_tokens.toLocaleString()}</td></tr>
                <tr><td>Cache Read</td><td>${m.cache_read_input_tokens.toLocaleString()}</td></tr>
            </table>
            <div class="section-label">Conversions</div>
            <table>
                <tr><td>Cost</td><td>${costDisplay}</td></tr>
                <tr><td>Energy</td><td>${energy.toFixed(4)} kWh</td></tr>
                <tr><td>Trees Burned</td><td>${trees.toFixed(6)}</td></tr>
            </table>
        </div>`;
    }
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let sidebarProvider: SidebarWebviewProvider | undefined;

/**
 * Create and register the sidebar webview view.
 * Returns disposables to be pushed to context.subscriptions.
 */
export function createSidebarView(): vscode.Disposable[] {
    sidebarProvider = new SidebarWebviewProvider();
    const registration = vscode.window.registerWebviewViewProvider(
        'claudeTokenTracker.usageView',
        sidebarProvider,
    );
    return [registration];
}

/**
 * Refresh the sidebar webview content. Safe to call even if the sidebar is not visible.
 */
export function refreshSidebarView(): void {
    if (sidebarProvider) {
        sidebarProvider.refresh();
    }
}
