import * as vscode from 'vscode';
import { QuotaService } from './services/quota-service';
import { DashboardPanel } from './webview/dashboard-panel';

let statusBarItem: vscode.StatusBarItem;
let hasWarnedLowQuota = false;

export function activate(context: vscode.ExtensionContext) {
    console.log('--- ClaudeCode Quota Activating ---');

    const quotaService = new QuotaService();

    // ステータスバー
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'claudeQuota.open';
    context.subscriptions.push(statusBarItem);
    updateStatusBar(quotaService);

    // コマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeQuota.open', () => {
            DashboardPanel.createOrShow(context.extensionUri, quotaService);
        })
    );

    const config = vscode.workspace.getConfiguration('claudeQuota');
    const updateInterval = config.get('updateInterval', 30000);
    const interval = setInterval(() => updateStatusBar(quotaService), updateInterval);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

async function updateStatusBar(quotaService: QuotaService) {
    try {
        const realtime = await quotaService.getRealtimeQuota();
        if (realtime && realtime.length > 0) {
            const session = realtime[0];
            if (session) {
                const config = vscode.workspace.getConfiguration('claudeQuota');
                const displayFormat = config.get('statusBarFormat', 'percentage-with-progress');
                const notificationEnabled = config.get('enableNotifications', true);
                const notificationThreshold = config.get('notificationThreshold', 30);

                let icon = '$(circle-filled)';
                // Create Progress Bar
                const width = 10;
                const filled = Math.round((session.percentage / 100) * width);
                const empty = width - filled;
                const progressBar = '█'.repeat(filled) + '░'.repeat(empty);

                // Format status bar text based on user preference
                switch (displayFormat) {
                    case 'percentage':
                        statusBarItem.text = `${session.percentage}%`;
                        break;
                    case 'percentage-with-icon':
                        statusBarItem.text = `${icon} ${session.percentage}%`;
                        break;
                    case 'percentage-with-progress':
                        statusBarItem.text = `${icon} Claude Code: ${session.percentage}%`;
                        break;
                    case 'countdown':
                        statusBarItem.text = `${icon} ${session.resetCountdown}`;
                        break;
                    case 'full':
                        statusBarItem.text = `${icon} ${session.percentage}% → ${session.resetCountdown}`;
                        break;
                    default:
                        statusBarItem.text = `${icon} Claude Code: ${session.percentage}%`;
                }

                const md = new vscode.MarkdownString();
                md.isTrusted = true;
                md.supportHtml = true;

                md.appendMarkdown(`**Claude Code Quota**\n\n`);
                md.appendMarkdown(`${progressBar} ${session.percentage}% → ${session.resetCountdown} (${session.resetTime})\n\n`);
                // Limit is estimated (55), so we only show the certain Used count to avoid confusion.
                md.appendMarkdown(`Used: ${session.usedCount ?? 0} msgs\n\n`);
                md.appendMarkdown(`---\n\n`);
                md.appendMarkdown(`$(dashboard) Click to open Quota Monitor`);
                statusBarItem.tooltip = md;

                // Low Quota Notification
                if (notificationEnabled && session.percentage < notificationThreshold) {
                    if (!hasWarnedLowQuota) {
                        vscode.window.showWarningMessage(`Claude Code quota is low (${session.percentage}%).`);
                        hasWarnedLowQuota = true;
                    }
                } else {
                    hasWarnedLowQuota = false;
                }

                statusBarItem.color = new vscode.ThemeColor('charts.orange');
                statusBarItem.show();
            }
        }
    } catch (e) {
        console.error('StatusBar Update Error:', e);
    }
}

export function deactivate() { }
