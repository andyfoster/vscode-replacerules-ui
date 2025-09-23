import * as vscode from 'vscode';

// Tree item types
export class RuleTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly ruleKey: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${this.label}`;
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
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${this.label}`;
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

    constructor() {}

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
        const items: vscode.TreeItem[] = [];

        if (rules) {
            for (const ruleKey in rules) {
                const rule = rules[ruleKey];
                if (rule.find) {
                    items.push(new RuleTreeItem(ruleKey, ruleKey));
                }
            }
        }

        return items;
    }

    private getRulesets(): vscode.TreeItem[] {
        const config = vscode.workspace.getConfiguration("replacerules");
        const rulesets = config.get<any>("rulesets");
        const items: vscode.TreeItem[] = [];

        if (rulesets) {
            for (const rulesetKey in rulesets) {
                const ruleset = rulesets[rulesetKey];
                if (Array.isArray(ruleset.rules)) {
                    items.push(new RulesetTreeItem(rulesetKey, rulesetKey));
                }
            }
        }

        return items;
    }
}