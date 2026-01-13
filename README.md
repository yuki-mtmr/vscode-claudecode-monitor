# ClaudeCode Quota Monitor

A VS Code extension that monitors Claude Code (CLI) quota usage and provides real-time status updates.

## Overview

This extension monitors Claude Code quota within VS Code, providing visual feedback and detailed statistics without requiring API authentication. It analyzes local log files to estimate usage and reset times.

## Key Features

### 📊 Real-time Monitoring
- **Status bar display** with customizable formats (6 options)
- **Visual dashboard** with glassmorphism design
- **Progress bars** and countdown timers
- **Active model detection** (Sonnet 4.5, Opus 4.5, Haiku 4.5)

### 🎨 Display Modes
Choose from multiple status bar formats:
- Percentage only: `75%`
- Percentage with icon: `● 75%`
- Percentage with progress bar: `● Claude Code: 75%`
- Countdown: `● 2h 30m`
- Full details: `● 75% → 2h 30m`

### 🔔 Smart Notifications
- Configurable threshold alerts
- Low quota warnings
- Optional notification system

### 🛠️ Privacy-Focused Design
- No API key required
- Analyzes local log files only (`~/.claude/history.jsonl`)
- All data stays on your machine

### 🌐 Cross-Platform Support
- macOS, Windows, and Linux compatible
- Automatic path handling for all platforms

## Installation

### Option 1: From Marketplace (Coming Soon)
Search for "ClaudeCode Quota Monitor" in the VS Code Extensions marketplace.

### Option 2: Build from Source
Requires Node.js v18+ and npm v9+.

```bash
git clone https://github.com/yourusername/vscode-claudecode-monitor.git
cd vscode-claudecode-monitor
npm install
npm run compile
```

### Option 3: VS Code Development Mode
1. Open this directory in VS Code
2. Press `F5` to launch the Extension Development Host
3. Run command: `Claude Code: Open ClaudeCode Quota`

## Configuration

Access settings via VS Code's Settings UI or `settings.json`:

### Core Settings

```json
{
  "claudeQuota.updateInterval": 30000,
  "claudeQuota.statusBarFormat": "percentage-with-progress",
  "claudeQuota.warningThreshold": 30,
  "claudeQuota.dangerThreshold": 10,
  "claudeQuota.enableNotifications": true,
  "claudeQuota.notificationThreshold": 30
}
```

### Setting Details

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `updateInterval` | number | 30000 | Update interval in milliseconds |
| `statusBarFormat` | string | "percentage-with-progress" | Display format (see Display Modes) |
| `warningThreshold` | number | 30 | Warning status threshold (%) |
| `dangerThreshold` | number | 10 | Danger status threshold (%) |
| `enableNotifications` | boolean | true | Enable low quota alerts |
| `notificationThreshold` | number | 30 | Notification trigger threshold (%) |

## MCP Server Integration

Register as an MCP server to query quota from within Claude Code conversations.

Add to `~/.claude/config.json`:

```json
{
  "mcpServers": {
    "quota-monitor": {
      "command": "node",
      "args": ["/absolute/path/to/vscode-claudecode-monitor/dist/mcp-server.js"]
    }
  }
}
```

Then ask Claude:
> "What's my current quota status?"

## How It Works

### Quota Calculation
- Parses `~/.claude/history.jsonl` to count messages within a 5-hour sliding window
- Estimates session usage based on local logs (not API data)
- Shows reset time with "(Est.)" suffix to indicate estimation

### Active Model Detection
- Reads project-specific logs in `~/.claude/projects/`
- Identifies currently active model (Sonnet, Opus, or Haiku)
- Highlights active model in dashboard

### Weekly Activity Tracking
- Aggregates message counts from `~/.claude/stats-cache.json`
- Displays 7-day activity summary

## Features Comparison

| Feature | ClaudeCode Quota Monitor | Other Extensions |
|---------|-------------------------|------------------|
| No API Key Required | ✅ | ❌ |
| Multiple Display Formats | ✅ (6 formats) | ⚠️ Limited |
| Configurable Thresholds | ✅ | ⚠️ Limited |
| Active Model Detection | ✅ | ❌ |
| MCP Server Integration | ✅ | ❌ |
| Cross-Platform Support | ✅ | ⚠️ Partial |
| Dashboard UI | ✅ (Glassmorphism) | ⚠️ Basic |

## Development

### Project Structure
```
src/
├── extension.ts              # Entry point
├── services/
│   └── quota-service.ts      # Core logic (log parsing)
└── webview/
    ├── dashboard-panel.ts    # Dashboard UI
    └── dashboard-provider.ts # Dashboard provider
```

### Build Commands
```bash
npm run compile      # Compile TypeScript
npm run watch        # Watch mode
npm run lint         # Run ESLint
npm run test         # Run tests
npm run package      # Create VSIX package
```

## Known Limitations

- **Quota limits are estimated** based on local logs, not official API data
- Reset times are **approximate** (±5 minutes possible)
- Requires Claude Code CLI to be installed and active
- Only tracks data available in local log files

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request with clear description

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/yourusername/vscode-claudecode-monitor/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/vscode-claudecode-monitor/discussions)

## License

MIT License - See [LICENSE](LICENSE) file for details.

**Note**: This extension is for personal use. Commercial use requires separate licensing.

## Acknowledgments

Inspired by [vscode-antigravity-cockpit](https://github.com/jlcodes99/vscode-antigravity-cockpit) and the Claude Code community.

---

Made with ❤️ for the Claude Code community