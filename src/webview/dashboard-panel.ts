import * as vscode from 'vscode';
import { QuotaService, QuotaStats, QuotaGroup } from '../services/quota-service';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    public static readonly viewType = 'claudeQuotaDashboard';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _quotaService: QuotaService;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, quotaService: QuotaService) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._quotaService = quotaService;

        this.updateWebview();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.onDidChangeViewState(
            e => { if (this._panel.visible) this.updateWebview(); },
            null,
            this._disposables
        );

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this.updateWebview();
                        return;
                }
            },
            null,
            this._disposables
        );

        const config = vscode.workspace.getConfiguration('claudeQuota');
        const updateInterval = config.get('updateInterval', 30000);
        const interval = setInterval(() => {
            if (this._panel.visible) {
                this.updateWebview();
            }
        }, updateInterval);
        this._disposables.push({ dispose: () => clearInterval(interval) });
    }

    public static createOrShow(extensionUri: vscode.Uri, quotaService: QuotaService) {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DashboardPanel.viewType,
            'ClaudeCode Quota',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'assets')]
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, quotaService);
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private updateWebview() {
        const stats = this._quotaService.getLocalStats();
        this._quotaService.getRealtimeQuota().then(groups => {
            this._panel.webview.html = this._getHtmlForWebview(stats, groups);
        });
    }

    private _getHtmlForWebview(stats: QuotaStats | null, groups: QuotaGroup[]) {
        const groupsJson = JSON.stringify(groups);

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ClaudeCode Quota</title>
    <style>
        :root {
            --bg-color: #f7f5f2;
            --card-bg: #ffffff;
            --border-color: #ece8e3;
            --accent-primary: #da7756;
            --accent-success: #2d9d78;
            --accent-warning: #e5a44e;
            --accent-danger: #d95e59;
            --text-primary: #37352f;
            --text-secondary: #74726e;
            --font-family: "Sentient", "Söhne", -apple-system, BlinkMacSystemFont, sans-serif;
        }

        body.vscode-dark {
            --bg-color: #191919;
            --card-bg: #252525;
            --border-color: #333333;
            --text-primary: #ededed;
            --text-secondary: #a1a1a1;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-primary);
            font-family: var(--font-family);
            padding: 40px;
            margin: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .container {
            width: 100%;
            max-width: 600px;
        }

        .header-section {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 32px;
        }
        .main-title {
            font-family: "Tiempos Headline", serif;
            font-size: 24px;
            font-weight: 600;
        }

        .quota-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 32px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }

        .section-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--text-primary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* Session Circle Chart */
        .chart-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin: 24px 0 40px 0;
        }
        .circular-chart {
            display: block;
            width: 180px;
            height: 180px;
        }
        .circle-bg {
            fill: none;
            stroke: var(--border-color);
            stroke-width: 3.5;
        }
        .circle {
            fill: none;
            stroke-width: 3.5;
            stroke-linecap: round;
            transform-origin: center;
            transform: rotate(-90deg);
            transition: stroke-dasharray 0.6s ease;
        }
        .percentage-label {
            fill: var(--text-primary);
            font-family: "Tiempos Headline", serif;
            font-weight: 500;
            font-size: 42px;
            text-anchor: middle;
            dominant-baseline: middle;
        }

        .reset-info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            border-top: 1px solid var(--border-color);
            padding-top: 24px;
            margin-bottom: 32px;
        }
        .info-cell {
            text-align: center;
        }
        .info-label {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }
        .info-value {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
        }

        /* Weekly Progress Bar */
        .weekly-section {
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid var(--border-color);
        }
        .progress-container {
            height: 8px;
            background: var(--border-color);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        .progress-bar {
            height: 100%;
            background: #58a6ff; /* GitHub-like Blue or Claude Accent */
            border-radius: 4px;
        }
        .weekly-meta {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: var(--text-secondary);
        }

        /* Models List */
        .models-container {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: center;
            margin-top: 8px;
        }
        .model-pill {
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 13px;
            color: var(--text-secondary);
            font-family: -apple-system, system-ui, sans-serif;
            transition: all 0.2s;
        }
        .model-pill.active {
            background: rgba(88, 166, 255, 0.15); /* Soft blue highlight */
            border-color: #58a6ff;
            color: var(--text-primary);
            font-weight: 500;
            box-shadow: 0 0 8px rgba(88, 166, 255, 0.2);
        }

        /* Tooltip */
        .tooltip-container {
            position: relative;
            cursor: help;
        }

        .tooltip-text {
            visibility: hidden;
            width: 240px;
            background-color: #252526;
            color: #fff;
            text-align: left;
            border-radius: 6px;
            padding: 10px 14px;
            position: absolute;
            z-index: 100;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            margin-bottom: 10px;
            opacity: 0;
            transition: opacity 0.2s;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            border: 1px solid #454545;
            pointer-events: none;
        }

        .tooltip-text::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -6px;
            border-width: 6px;
            border-style: solid;
            border-color: #252526 transparent transparent transparent;
        }

        .tooltip-container:hover .tooltip-text {
            visibility: visible;
            opacity: 1;
        }

        .tooltip-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-weight: 500;
            font-size: 13px;
        }

        .tooltip-bar-bg {
            width: 100%;
            height: 4px;
            background: #444;
            border-radius: 2px;
            margin: 6px 0 8px 0;
            overflow: hidden;
        }
        .tooltip-bar-fill {
            height: 100%;
            border-radius: 2px;
            transition: width 0.3s;
        }

        .tooltip-sub {
            font-size: 11px;
            color: #ccc;
        }
        .tooltip-highlight {
            color: #da7756;
            font-weight: 600;
        }

    </style>
</head>
<body class="${stats ? '' : 'vscode-dark'}">
    <div class="container">
        <div class="header-section">
            <div class="main-title">Claude Code Quota</div>
            <button style="background:transparent; border:1px solid var(--border-color); color:var(--text-secondary); padding:6px 12px; border-radius:6px; cursor:pointer;" onclick="vscode.postMessage({command: 'refresh'})">Refresh</button>
        </div>

        <div id="content-area"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const groups = ${groupsJson};

         // Detect stats for theme fallback
        document.body.className = document.body.className || 'vscode-dark';

        const content = document.getElementById('content-area');

        groups.forEach(group => {
            // Colors
            let strokeColor = '#da7756'; // Orange default
            if (group.percentage < 10) strokeColor = '#d95e59';
            else if (group.percentage < 30) strokeColor = '#e5a44e';

            // Session Circle
            // Note: SVG circles need circumference calculation. r=80 -> C ~ 502
            const radius = 80;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (group.percentage / 100) * circumference;

            let weeklyHtml = '';
            if (group.details) {
                weeklyHtml = \`
                    <div class="weekly-section">
                        <div class="section-title">Weekly Activity <span style="font-size:11px; font-weight:400; color:var(--text-secondary); text-transform:none;">(This Device)</span></div>
                        <div class="progress-container">
                            <div class="progress-bar" style="width: \${group.details.percentage}%; background-color: #3b82f6;"></div>
                        </div>
                        <div class="weekly-meta">
                            <span>Local Usage Est.</span>
                            <span>\${group.details.percentage}% of Limit</span>
                        </div>
                         <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Resets Sunday 19:00</div>
                    </div>
                \`;
            }

            const card = document.createElement('div');
            card.className = 'quota-card';
            card.innerHTML = \`
                <div style="text-align:center; margin-bottom: 8px;">
                    <div class="section-title">Current Session</div>
                    <span style="background:\${group.percentage > 30 ? 'rgba(45, 157, 120, 0.1)' : 'rgba(217, 94, 89, 0.1)'}; color:\${group.percentage > 30 ? '#2d9d78' : '#d95e59'}; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">\${group.status}</span>
                </div>

                <div class="chart-wrapper">
                    <svg class="circular-chart" viewBox="0 0 200 200">
                        <circle class="circle-bg" cx="100" cy="100" r="\${radius}"></circle>
                        <circle class="circle" cx="100" cy="100" r="\${radius}"
                                stroke="\${strokeColor}"
                                stroke-dasharray="\${circumference}"
                                stroke-dashoffset="\${offset}"></circle>
                         <text x="50%" y="50%" class="percentage-label">\${group.percentage}%</text>
                    </svg>
                </div>

                <div class="reset-info-grid">
                    <div class="info-cell">
                        <div class="info-label" title="Estimated time based on local usage history. May vary from server-side quota.">Gets Reset In (Est.)</div>
                        <div class="info-value">\${group.resetCountdown || '-'}</div>
                    </div>
                    <div class="info-cell">
                        <div class="info-label" title="Estimated time when usage capacity will begin to recover.">Reset Time (Est.)</div>
                        <div class="info-value">\${group.resetTime || '-'}</div>
                    </div>
                </div>

                <div class="models-container">
                    \${group.includedModels.map(m => {
                        const isActive = m === group.activeModel;
                        return \`<div class="model-pill \${isActive ? 'active' : ''}">\${m} \${isActive ? '✓' : ''}</div>\`;
                    }).join('')}
                </div>

                \${weeklyHtml}

                <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--vscode-widget-border); font-size: 10px; color: var(--vscode-descriptionForeground); opacity: 0.8; text-align: center;">
                    * Usage data is estimated from local logs.<br>
                    Actual quota may vary from server-side status.
                </div>
            \`;

            content.appendChild(card);
        });
    </script>
</body>
</html>`;
    }
}
