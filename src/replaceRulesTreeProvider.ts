import * as vscode from 'vscode';

// Sort mode enum
export enum SortMode {
    LastUsed = 'lastUsed',
    Alphabetical = 'alphabetical'
}

// Interface for rule usage history
export interface RuleUsage {
    timestamp: number;
    count: number;
}

// Tree item types
export class RuleTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly ruleKey: string,
        public readonly lastUsed?: number,
        public readonly useCount?: number
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        // Create a human-readable last used message if available
        let lastUsedDescription = '';
        if (lastUsed) {
            const date = new Date(lastUsed);
            lastUsedDescription = `Used ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            if (useCount && useCount > 1) {
                lastUsedDescription += ` (${useCount} times)`;
            }
        }

        this.tooltip = `${this.label}${lastUsedDescription ? '\n' + lastUsedDescription : ''}`;
        this.description = lastUsedDescription;
        this.contextValue = 'rule';
        this.iconPath = new vscode.ThemeIcon('symbol-string');
        this.command = {
            command: 'replacerules.runRuleFromExplorer',
            title: 'Run Rule',
            arguments: [this]
        };
    }
}

export class RulesetTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly rulesetKey: string,
        public readonly lastUsed?: number,
        public readonly useCount?: number
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        // Create a human-readable last used message if available
        let lastUsedDescription = '';
        if (lastUsed) {
            const date = new Date(lastUsed);
            lastUsedDescription = `Used ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            if (useCount && useCount > 1) {
                lastUsedDescription += ` (${useCount} times)`;
            }
        }

        this.tooltip = `${this.label}${lastUsedDescription ? '\n' + lastUsedDescription : ''}`;
        this.description = lastUsedDescription;
        this.contextValue = 'ruleset';
        this.iconPath = new vscode.ThemeIcon('list-tree');
        this.command = {
            command: 'replacerules.runRulesetFromExplorer',
            title: 'Run Ruleset',
            arguments: [this]
        };
    }
}

export class RulesCategoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = 'category';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

// Tree data provider
export class ReplaceRulesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // Store rule usage history
    private ruleUsageHistory: Map<string, RuleUsage> = new Map();

    // Current sort mode
    private sortMode: SortMode = SortMode.LastUsed;

    constructor(private context: vscode.ExtensionContext) {
        // Load rule usage history from global state
        const savedHistory = this.context.globalState.get<{ [key: string]: RuleUsage }>('ruleUsageHistory');
        if (savedHistory) {
            this.ruleUsageHistory = new Map(Object.entries(savedHistory));
        }
        // Load saved sort mode
        const savedSortMode = this.context.globalState.get<string>('sortMode');
        if (savedSortMode && Object.values(SortMode).includes(savedSortMode as SortMode)) {
            this.sortMode = savedSortMode as SortMode;
        }
    }

    // Change the sort mode
    setSortMode(mode: SortMode): void {
        this.sortMode = mode;

        // Save to global state
        this.context.globalState.update('sortMode', mode);

        // Refresh the view
        this.refresh();
    }

    // Get current sort mode
    getSortMode(): SortMode {
        return this.sortMode;
    }

    // Update usage for a rule
    updateRuleUsage(ruleKey: string): void {
        const now = Date.now();
        const currentUsage = this.ruleUsageHistory.get(ruleKey) || { timestamp: now, count: 0 };

        const updatedUsage: RuleUsage = {
            timestamp: now,
            count: currentUsage.count + 1
        };

        this.ruleUsageHistory.set(ruleKey, updatedUsage);

        // Save to global state
        this.saveUsageHistory();

        // Refresh the view
        this.refresh();
    }

    // Save usage history to global state
    private saveUsageHistory(): void {
        const historyObj = Object.fromEntries(this.ruleUsageHistory.entries());
        this.context.globalState.update('ruleUsageHistory', historyObj);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        // If no element is provided, return the root categories
        if (!element) {
            return Promise.resolve(this.getRootCategories());
        }

        // Handle category elements
        if (element instanceof RulesCategoryTreeItem) {
            if (element.label === 'Rules') {
                return Promise.resolve(this.getRules());
            } else if (element.label === 'Rulesets') {
                return Promise.resolve(this.getRulesets());
            }
        }

        return Promise.resolve([]);
    }

    private getRootCategories(): vscode.TreeItem[] {
        const categories: vscode.TreeItem[] = [];

        categories.push(new RulesCategoryTreeItem(
            'Rules',
            vscode.TreeItemCollapsibleState.Expanded
        ));

        categories.push(new RulesCategoryTreeItem(
            'Rulesets',
            vscode.TreeItemCollapsibleState.Expanded
        ));

        return categories;
    }

    private getRules(): vscode.TreeItem[] {
        const config = vscode.workspace.getConfiguration("replacerules");
        const rules = config.get<any>("rules");
        const items: RuleTreeItem[] = [];

        if (rules) {
            for (const ruleKey in rules) {
                const rule = rules[ruleKey];
                if (rule.find) {
                    const usage = this.ruleUsageHistory.get(ruleKey);
                    items.push(new RuleTreeItem(
                        ruleKey,
                        ruleKey,
                        usage?.timestamp,
                        usage?.count
                    ));
                }
            }
        }

        // Sort based on the current sort mode
        if (this.sortMode === SortMode.LastUsed) {
            // Sort by last used (most recent first)
            items.sort((a, b) => {
                // If neither has been used, sort alphabetically
                if (!a.lastUsed && !b.lastUsed) {
                    return a.label.localeCompare(b.label);
                }
                // If only one has been used, it should come first
                if (!a.lastUsed) return 1;
                if (!b.lastUsed) return -1;
                // Otherwise sort by timestamp (descending)
                return b.lastUsed - a.lastUsed;
            });
        } else {
            // Sort alphabetically
            items.sort((a, b) => a.label.localeCompare(b.label));
        }

        return items;
    }

    private getRulesets(): vscode.TreeItem[] {
        const config = vscode.workspace.getConfiguration("replacerules");
        const rulesets = config.get<any>("rulesets");
        const items: RulesetTreeItem[] = [];

        if (rulesets) {
            for (const rulesetKey in rulesets) {
                const ruleset = rulesets[rulesetKey];
                if (Array.isArray(ruleset.rules)) {
                    const usage = this.ruleUsageHistory.get(rulesetKey);
                    items.push(new RulesetTreeItem(
                        rulesetKey,
                        rulesetKey,
                        usage?.timestamp,
                        usage?.count
                    ));
                }
            }
        }

        // Sort based on the current sort mode
        if (this.sortMode === SortMode.LastUsed) {
            // Sort by last used (most recent first)
            items.sort((a, b) => {
                // If neither has been used, sort alphabetically
                if (!a.lastUsed && !b.lastUsed) {
                    return a.label.localeCompare(b.label);
                }
                // If only one has been used, it should come first
                if (!a.lastUsed) return 1;
                if (!b.lastUsed) return -1;
                // Otherwise sort by timestamp (descending)
                return b.lastUsed - a.lastUsed;
            });
        } else {
            // Sort alphabetically
            items.sort((a, b) => a.label.localeCompare(b.label));
        }

        return items;
    }
}