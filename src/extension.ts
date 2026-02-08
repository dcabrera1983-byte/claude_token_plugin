import * as vscode from 'vscode';
import { createStatusBar, updateStatusBar, applyStatusBarVisibility } from './statusBar.js';
import { createFileWatcher } from './fileWatcher.js';
import { showDetailsPanel, refreshDetailsPanel } from './webviewPanel.js';
import { createSidebarView, refreshSidebarView } from './sidebarView.js';

function applySidebarVisibility(): void {
	const config = vscode.workspace.getConfiguration('claudeTokenTracker');
	const show = config.get<boolean>('showSidebar', true);
	vscode.commands.executeCommand('setContext', 'claudeTokenTracker.showSidebar', show);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Claude Token Tracker is now active');

	// Apply initial sidebar visibility from settings
	applySidebarVisibility();

	// Create status bar item
	const statusBar = createStatusBar();
	context.subscriptions.push(statusBar);

	// Create sidebar tree view (visibility controlled by when-clause in package.json)
	const sidebarDisposables = createSidebarView();
	for (const d of sidebarDisposables) {
		context.subscriptions.push(d);
	}

	// Create file watcher for live updates
	const watcher = createFileWatcher();
	if (watcher) {
		context.subscriptions.push(watcher);
	}

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('claudeTokenTracker.refreshUsage', () => {
			updateStatusBar();
			refreshSidebarView();
			refreshDetailsPanel();
			vscode.window.showInformationMessage('Claude Token Tracker: Usage refreshed');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('claudeTokenTracker.showDetails', () => {
			showDetailsPanel();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('claudeTokenTracker.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', 'claudeTokenTracker');
		})
	);

	// Refresh displays when configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('claudeTokenTracker')) {
				applyStatusBarVisibility();
				applySidebarVisibility();
				updateStatusBar();
				refreshSidebarView();
				refreshDetailsPanel();
			}
		})
	);
}

export function deactivate() {}
