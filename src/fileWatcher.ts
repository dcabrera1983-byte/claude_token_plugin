import * as vscode from 'vscode';
import { getProjectsDir } from './logParser.js';
import { updateStatusBar } from './statusBar.js';
import { refreshSidebarView } from './sidebarView.js';

/**
 * Create a file system watcher on all .jsonl files under the Claude projects directory.
 * Returns the watcher disposable, or null if the projects directory was not found.
 */
export function createFileWatcher(): vscode.Disposable | null {
    const projectsDir = getProjectsDir();
    if (!projectsDir) {
        return null;
    }

    const pattern = new vscode.RelativePattern(projectsDir, '**/*.jsonl');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange(() => {
        updateStatusBar();
        refreshSidebarView();
    });

    watcher.onDidCreate(() => {
        updateStatusBar();
        refreshSidebarView();
    });

    return watcher;
}
