import * as vscode from 'vscode';
import { QuotaService, QuotaStats, QuotaGroup } from '../services/quota-service';

export class DashboardProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'claude-quota-dashboard';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _quotaService: QuotaService
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this.updateWebview();

        const config = vscode.workspace.getConfiguration('claudeQuota');
        const updateInterval = config.get('updateInterval', 30000);
        const interval = setInterval(() => this.updateWebview(), updateInterval);

        webviewView.onDidDispose(() => clearInterval(interval));
        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'refresh') this.updateWebview();
        });
    }

    private updateWebview() {
        if (!this._view) return;
        const stats = this._quotaService.getLocalStats();
        this._quotaService.getRealtimeQuota().then(groups => {
            this._view!.webview.html = this._getHtmlForWebview(stats, groups);
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
            --bg-color: #0d1117; /* GitHub Dark Dimmed Background */
            --card-bg: #161b22;
            --border-color: #30363d;
            --accent-primary: #ffffff; /* Solid White Accent */
            --accent-success: #2da44e; /* GitHub Green */
            --accent-warning: #bf8700;
            --accent-danger: #cf222e;
            --text-primary: #e6edf3;
            --text-secondary: #7d8590;
        }
        body {
            background-color: var(--bg-color);
            color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
            padding: 12px;
            margin: 0;
            line-height: 1.5;
        }
        
        /* Header */
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border-color);
        }
        .title {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: var(--text-primary);
        }
        .refresh-btn {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 4px 10px;
            border-radius: 4px; /* More square */
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.2s ease;
        }
        .refresh-btn:hover { 
            background: var(--border-color);
            border-color: var(--text-secondary);
        }

        /* Group Card */
        .group-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px; /* Reduced radius */
            padding: 0;
            margin-bottom: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        }
        .group-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color);
            background: rgba(255,255,255,0.02);
        }
        .group-title {
            font-weight: 600;
            font-size: 13px;
            color: var(--text-primary);
        }
        
        .card-content {
            padding: 16px;
        }

        /* Circular Progress - Solid Style */
        .chart-container {
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 8px 0 20px 0;
        }
        .circular-chart {
            display: block;
            margin: 0 auto;
            max-width: 100px;
            max-height: 100px;
        }
        .circle-bg {
            fill: none;
            stroke: #21262d;
            stroke-width: 8; /* Thicker solid feel */
        }
        .circle {
            fill: none;
            stroke-width: 8;
            stroke-linecap: butt; /* Square ends */
            transition: stroke-dasharray 0.5s ease;
        }
        .percentage-text {
            fill: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
            font-weight: 800;
            font-size: 0.6em;
            text-anchor: middle;
        }

        /* Info Grid */
        .info-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            padding: 4px 0;
            color: var(--text-secondary);
        }
        .info-value {
            color: var(--text-primary);
            font-weight: 500;
            font-variant-numeric: tabular-nums;
        }

        /* Model Tags - Minimalist */
        .models-section {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid var(--border-color);
        }
        .models-label {
            font-size: 10px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 8px;
            font-weight: 600;
        }
        .model-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .model-tag {
            background: transparent;
            color: var(--text-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 11px;
            font-family: "SF Mono", "Segoe UI Mono", monospace;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">CLAUDE QUOTA</div>
        <button class="refresh-btn" onclick="vscode.postMessage({command: 'refresh'})">UPDATE</button>
    </div>

    <div id="groups-container"></div>

    <script>
        const vscode = acquireVsCodeApi();
        const groups = ${groupsJson};

        // Solid Color Scheme
        function getStrokeColor(percentage) {
            if (percentage < 10) return '#cf222e'; // Red
            if (percentage < 30) return '#d29922'; // Warning
            return '#2da44e'; // Green
        }

        const container = document.getElementById('groups-container');
        
        groups.forEach(group => {
            const color = getStrokeColor(group.percentage);
            
            // Create Card
            const card = document.createElement('div');
            card.className = 'group-card';
            
            // Generate Circular Chart SVG
            const strokeDash = \`\${group.percentage}, 100\`;
            
            card.innerHTML = \`
                <div class="group-header">
                    <div class="group-title">\${group.name}</div>
                </div>

                <div class="card-content">
                    <div class="chart-container">
                        <svg viewBox="0 0 36 36" class="circular-chart">
                            <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <path class="circle" stroke-dasharray="\${strokeDash}" stroke="\${color}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <text x="18" y="20.35" class="percentage-text">\${group.percentage}%</text>
                        </svg>
                    </div>

                    <div style="margin-bottom: 8px;">
                        <div class="info-row">
                            <span>Reset Countdown</span>
                            <span class="info-value" style="font-weight:700;">\${group.resetCountdown || '-'}</span>
                        </div>
                        <div class="info-row">
                            <span>Target Time</span>
                            <span class="info-value">\${group.resetTime || '-'}</span>
                        </div>
                        <div class="info-row">
                            <span>Status</span>
                            <span class="info-value" style="color: \${color}">\${group.status}</span>
                        </div>
                    </div>

                    <div class="models-section">
                        <div class="models-label">Active Models</div>
                        <div class="model-list">
                            \${group.includedModels.map(m => \`<span class="model-tag">\${m}</span>\`).join('')}
                        </div>
                    </div>
                </div>
            \`;
            
            container.appendChild(card);
        });
    </script>
</body>
</html>`;
    }
}
