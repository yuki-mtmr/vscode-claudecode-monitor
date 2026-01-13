import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode'; // Added for workspace root

export interface QuotaStats {
    totalMessages: number;
    totalSessions: number;
    modelUsage: Record<string, any>;
    dailyActivity: Array<{
        date: string;
        messageCount: number;
        sessionCount: number;
    }>;
}

export interface QuotaGroup {
    name: string;
    percentage: number;
    resetTime?: string;
    resetCountdown?: string;
    status: 'Healthy' | 'Warning' | 'Critical';
    includedModels: string[];
    details?: {
        label: string;
        percentage: number;
        valueStr: string;
    };
    activeModel?: string; // Newly added
    usedCount?: number;
    limitCount?: number;
}

export class QuotaService {
    private baseDir: string;
    private statsPath: string;
    private historyPath: string;
    private projectsDir: string;

    constructor() {
        this.baseDir = path.join(os.homedir(), '.claude');
        this.statsPath = path.join(this.baseDir, 'stats-cache.json');
        this.historyPath = path.join(this.baseDir, 'history.jsonl');
        this.projectsDir = path.join(this.baseDir, 'projects');
    }

    public getLocalStats(): QuotaStats | null {
        try {
            if (fs.existsSync(this.statsPath)) {
                return JSON.parse(fs.readFileSync(this.statsPath, 'utf8'));
            }
        } catch (error) {
            console.error('Error reading stats-cache.json:', error);
        }
        return null;
    }

    // Generic model name parser updates automatically with new models
    public getQuotaModelName(rawId: string): string {
        // Remove 'claude-' prefix
        let name = rawId.replace(/^claude-/, '');

        // Remove date suffix if present (e.g. -20250929)
        name = name.replace(/-\d{8}$/, '');

        // Replace hyphens with spaces
        name = name.replace(/-/g, ' ');

        // Fix version numbers: "4 5" -> "4.5"
        name = name.replace(/(\d)\s+(\d)/g, '$1.$2');

        // Remove marketing suffixes like "· Best For Everyday Tasks"
        if (name.includes('·')) {
            name = name.split('·')[0].trim();
        }

        // Title Case (capitalize first letter of each word)
        return name.split(' ')
            .map(word => {
                // Keep numbers/versions as is (e.g. 3.5), capitalize words
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    private getIncludedModels(stats: QuotaStats | null): string[] {
        // Default models that we know exist
        const defaults = ["Sonnet 4.5", "Opus 4.5", "Haiku 4.5"];
        if (!stats || !stats.modelUsage) {
            return defaults;
        }

        const rawIds = Object.keys(stats.modelUsage);
        const readableNames = rawIds.map(id => this.getQuotaModelName(id));

        // Merge defaults with used models, removing duplicates
        return Array.from(new Set([...defaults, ...readableNames]));
    }

    // Helper to strip ANSI codes
    private stripAnsi(str: string): string {
        return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    }

    private async getLastActiveProjectRoot(): Promise<string | null> {
        try {
            if (!fs.existsSync(this.historyPath)) return null;

            // Read last line of global history to find the project path
            const fileStats = fs.statSync(this.historyPath);
            const bufferSize = Math.min(fileStats.size, 1024); // Last 1KB is enough
            const fd = fs.openSync(this.historyPath, 'r');
            const buffer = Buffer.alloc(bufferSize);
            fs.readSync(fd, buffer, 0, bufferSize, Math.max(0, fileStats.size - bufferSize));
            fs.closeSync(fd);

            const content = buffer.toString('utf8');
            const lines = content.trim().split('\n');
            if (lines.length === 0) return null;

            const lastLine = lines[lines.length - 1];
            const entry = JSON.parse(lastLine);
            if (entry && entry.project) {
                return entry.project;
            }
        } catch (e) {
            console.error('Error finding active project from history:', e);
        }
        return null;
    }

    // Public for testing
    public normalizeProjectPath(projectRoot: string): string {
        // Convert to safe name:
        // Mac/Linux: /Users/foo/bar -> -Users-foo-bar
        // Windows: C:\Users\foo -> -C-Users-foo (assuming similar logic in Claude CLI)
        // Replacing both / and \ with - for cross-platform safety
        let safeName = projectRoot.replace(/[\\/]/g, '-');

        // Ensure logic matches Claude CLI (which seems to prepend - on Mac if absolute path starts with /)
        if (!safeName.startsWith('-')) safeName = '-' + safeName;

        return safeName;
    }

    private async getActiveModelFromProjectLogs(): Promise<string | null> {
        try {
            let projectRoot = await this.getLastActiveProjectRoot();

            // Fallback to workspace if history failed
            if (!projectRoot && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            }

            if (!projectRoot) return null;

            const safeName = this.normalizeProjectPath(projectRoot);

            const projectDir = path.join(this.projectsDir, safeName);

            if (!fs.existsSync(projectDir)) {
                // console.log('Project dir not found:', projectDir);
                return null;
            }

            // Find latest .jsonl file
            const files = fs.readdirSync(projectDir)
                .filter(f => f.endsWith('.jsonl'))
                .map(f => ({ name: f, time: fs.statSync(path.join(projectDir, f)).mtime.getTime() }))
                .sort((a, b) => b.time - a.time);

            if (files.length === 0) return null;

            const latestLogPath = path.join(projectDir, files[0].name);

            const fileStats = fs.statSync(latestLogPath);
            const bufferSize = Math.min(fileStats.size, 100 * 1024); // 100KB tail
            const fd = fs.openSync(latestLogPath, 'r');
            const buffer = Buffer.alloc(bufferSize);
            fs.readSync(fd, buffer, 0, bufferSize, Math.max(0, fileStats.size - bufferSize));
            fs.closeSync(fd);

            const content = buffer.toString('utf8');
            const lines = content.split('\n').reverse();

            // Look for "Set model to ..."
            for (const line of lines) {
                if (!line) continue;
                try {
                    const entry = JSON.parse(line);
                    // We look for local-command-stdout content
                    if (entry.message && entry.message.content) {
                        const cleanContent = this.stripAnsi(entry.message.content);
                        // Expected format: <local-command-stdout>Set model to opus (claude-opus-4-5-20251101)</local-command-stdout>
                        // Simplified check
                        if (cleanContent.includes('Set model to')) {
                            // Extract model name parens
                            const match = cleanContent.match(/Set model to\s+([^\(\)]+)(?:\(([^)]+)\))?/i);
                            if (match) {
                                // match[1] might be "opus ", match[2] might be "claude-opus-4-5-20251101"
                                // or match[1] might be "Default " match[2] might be "Sonnet 4.5 ..."

                                const p1 = match[1].trim();
                                const p2 = match[2] ? match[2].trim() : '';

                                const target = p2 || p1; // Prefer p2 (detailed ID) if available

                                return this.getQuotaModelName(target);
                            }
                        }
                    }
                } catch (e) {
                    // ignore parse error for partial lines
                }
            }

        } catch (e) {
            console.error('Error finding active model:', e);
        }
        return null; // Not found
    }

    public async getRealtimeQuota(): Promise<QuotaGroup[]> {
        const stats = this.getLocalStats();
        let includedModels = this.getIncludedModels(stats);

        // Find Active Model
        const activeModel = await this.getActiveModelFromProjectLogs();

        // Ensure active model is in the list and possibly highlighted or handled in UI
        if (activeModel) {
            // Logic to move active model to top or mark it?
            // For now just ensuring it's in the list
            if (!includedModels.includes(activeModel)) {
                includedModels.push(activeModel);
            }
        }

        // --- 1. Session Usage (Log Parsing) ---
        let sessionMessageCount = 0;
        const now = Date.now();
        // Based on user observation: 21:04 msg -> 01:00 reset (approx 4h)
        const sessionWindowMs = 4 * 60 * 60 * 1000;
        const windowStart = now - sessionWindowMs;
        let oldestMessageTime = now; // Default to now (will be updated if messages found)
        let foundAnyMessage = false;

        try {
            if (fs.existsSync(this.historyPath)) {
                const fileStats = fs.statSync(this.historyPath);
                const fileSize = fileStats.size;
                const bufferSize = Math.min(fileSize, 64 * 1024);
                const fd = fs.openSync(this.historyPath, 'r');
                const buffer = Buffer.alloc(bufferSize);

                let pos = fileSize - bufferSize;
                let stop = false;
                let remainder = '';

                while (pos >= -bufferSize && !stop) {
                    const currentReadSize = pos < 0 ? bufferSize + pos : bufferSize;
                    const currentReadPos = Math.max(0, pos);
                    fs.readSync(fd, buffer, 0, currentReadSize, currentReadPos);

                    const chunk = buffer.toString('utf8', 0, currentReadSize);
                    const fullChunk = chunk + remainder;
                    const lines = fullChunk.split('\n');

                    if (pos > 0) {
                        remainder = lines[0];
                        lines.shift();
                    } else {
                        remainder = '';
                    }

                    for (let i = lines.length - 1; i >= 0; i--) {
                        if (!lines[i].trim()) continue;
                        try {
                            const entry = JSON.parse(lines[i]);

                            // Normalize timestamp
                            let tx = 0;
                            if (typeof entry.timestamp === 'string') {
                                tx = new Date(entry.timestamp).getTime();
                            } else if (typeof entry.timestamp === 'number') {
                                tx = entry.timestamp;
                            }

                            // Check window
                            if (tx && tx > windowStart) {
                                let isQuotaConsuming = false;
                                let content = '';

                                if (typeof entry.display === 'string') {
                                    content = entry.display;
                                    isQuotaConsuming = true;
                                } else if (entry.type === 'user_message' || entry.role === 'user') {
                                    isQuotaConsuming = true;
                                    if (typeof entry.content === 'string') content = entry.content;
                                    else if (entry.message && typeof entry.message.content === 'string') content = entry.message.content;
                                    else if (Array.isArray(entry.content) && entry.content.length > 0) {
                                        const textItem = entry.content.find((c: any) => c.type === 'text' || (c.text && typeof c.text === 'string'));
                                        if (textItem) content = textItem.text || textItem.content || '';
                                    }
                                }

                                if (content && content.trim().startsWith('/')) {
                                    isQuotaConsuming = false;
                                }

                                if (isQuotaConsuming) {
                                    sessionMessageCount++;
                                    if (tx < oldestMessageTime) {
                                        oldestMessageTime = tx;
                                    }
                                    foundAnyMessage = true;
                                }
                            } else if (tx && tx <= windowStart) {
                                stop = true;
                                break;
                            }
                        } catch (e) { }
                    }
                    pos -= bufferSize;
                    if (pos < -bufferSize) break;
                }
                fs.closeSync(fd);
            }
        } catch (error) {
            console.error('Error reading history.jsonl:', error);
        }

        // Adjust limits
        const estimatedLimit = 55;
        const sessionUsedPct = Math.min(100, Math.round((sessionMessageCount / estimatedLimit) * 100));
        const sessionRemaining = 100 - sessionUsedPct;

        let resetTimeMs = now;
        if (sessionMessageCount > 0 && foundAnyMessage) {
            resetTimeMs = oldestMessageTime + sessionWindowMs;
        }

        const resetDate = new Date(resetTimeMs);
        const resetHours = resetDate.getHours().toString().padStart(2, '0');
        const resetMinutes = resetDate.getMinutes().toString().padStart(2, '0');
        const resetTimeStr = (sessionMessageCount === 0) ? 'Now' : `${resetHours}:${resetMinutes}`;

        let diffMs = resetTimeMs - now;
        if (diffMs < 0) diffMs = 0;
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const countdownStr = (sessionMessageCount === 0) ? 'Fully Charged' : `${diffHrs}h ${diffMins}m`;

        let status: 'Healthy' | 'Warning' | 'Critical' = 'Healthy';
        if (sessionRemaining < 10) status = 'Critical';
        else if (sessionRemaining < 30) status = 'Warning';

        // --- 2. Weekly Usage ---
        let weeklyMessageCount = 0;
        if (stats && stats.dailyActivity) {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];

            stats.dailyActivity.forEach(day => {
                if (day.date >= oneWeekAgoStr) {
                    weeklyMessageCount += day.messageCount;
                }
            });
        }

        const weeklyLimitEstimate = 4000;
        const weeklyUsedPct = Math.min(100, Math.round((weeklyMessageCount / weeklyLimitEstimate) * 100));

        return [
            {
                name: "Claude Code",
                percentage: sessionRemaining,
                resetTime: resetTimeStr,
                resetCountdown: countdownStr,
                status: status,
                includedModels: includedModels,
                activeModel: activeModel || 'Sonnet 4.5', // Pass active model to UI
                usedCount: sessionMessageCount,
                limitCount: estimatedLimit,
                details: {
                    label: "Weekly Activity (Local)", // Revert to English
                    percentage: weeklyUsedPct,
                    valueStr: `${weeklyUsedPct}% Used`
                }
            }
        ];
    }
}
