import * as vscode from 'vscode';

import ReplaceRulesEditProvider from './editProvider';
import { ReplaceRulesProvider, RuleTreeItem, RulesetTreeItem, SortMode } from './replaceRulesTreeProvider';

// Define interfaces for configuration objects
interface RuleConfig {
    find: string | string[];
    replace?: string | string[];
    flags?: string | string[];
    languages?: string[];
    literal?: boolean;
}

interface RulesetConfig {
    rules: string[];
}

interface RulesConfigObject {
    [key: string]: RuleConfig;
}

interface RulesetsConfigObject {
    [key: string]: RulesetConfig;
}

export function activate(context: vscode.ExtensionContext) {
    // Register existing commands
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('replacerules.runRule', runSingleRule));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('replacerules.runRuleset', runRuleset));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('replacerules.pasteAndReplace', pasteReplace));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('replacerules.pasteAndReplaceRuleset', pasteReplaceRuleset));
    context.subscriptions.push(vscode.commands.registerCommand('replacerules.stringifyRegex', stringifyRegex));

    // Create tree data provider and store it for global access
    const replaceRulesProvider = new ReplaceRulesProvider(context);
    // Store the provider in a global variable for access from command handlers
    globalReplaceRulesProvider = replaceRulesProvider;

    // Register the tree data provider
    const treeView = vscode.window.createTreeView('replacerulesExplorer', {
        treeDataProvider: replaceRulesProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Register the refresh command
    context.subscriptions.push(vscode.commands.registerCommand('replacerules.refreshRules', () => {
        replaceRulesProvider.refresh();
    }));

    // Register sorting commands
    context.subscriptions.push(vscode.commands.registerCommand('replacerules.sortByName', () => {
        replaceRulesProvider.setSortMode(SortMode.Alphabetical);
        vscode.window.showInformationMessage('Rules sorted alphabetically');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('replacerules.sortByLastUsed', () => {
        replaceRulesProvider.setSortMode(SortMode.LastUsed);
        vscode.window.showInformationMessage('Rules sorted by last used');
    }));

    // Register rule management commands
    context.subscriptions.push(vscode.commands.registerCommand('replacerules.createRule', async () => {
        // Get rule name
        const ruleName = await vscode.window.showInputBox({
            prompt: 'Enter a name for the new rule',
            placeHolder: 'my-rule-name'
        });

        if (!ruleName) return;

        // Get find pattern
        const findPattern = await vscode.window.showInputBox({
            prompt: 'Enter the regex search pattern',
            placeHolder: '(.*)'
        });

        if (!findPattern) return;

        // Get replace pattern
        const replacePattern = await vscode.window.showInputBox({
            prompt: 'Enter the replacement pattern',
            placeHolder: '$1'
        });

        if (replacePattern === undefined) return; // Allow empty replace string

        // Get flags
        const flags = await vscode.window.showInputBox({
            prompt: 'Enter regex flags (optional)',
            placeHolder: 'gm',
            value: 'gm'
        });

        // Create the rule
        const config = vscode.workspace.getConfiguration('replacerules');
        const rules = config.get<RulesConfigObject>('rules') || {} as RulesConfigObject;

        rules[ruleName] = {
            find: findPattern,
            replace: replacePattern,
            flags: flags || 'gm'
        };

        await config.update('rules', rules, vscode.ConfigurationTarget.Global);
        replaceRulesProvider.refresh();
        vscode.window.showInformationMessage(`Rule '${ruleName}' created`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('replacerules.editRule', async (item: RuleTreeItem) => {
        const config = vscode.workspace.getConfiguration('replacerules');
        const rules = config.get<RulesConfigObject>('rules') || {} as RulesConfigObject;
        const rule = rules[item.ruleKey];

        if (!rule) {
            vscode.window.showErrorMessage(`Rule '${item.ruleKey}' not found`);
            return;
        }

        // Get updated find pattern
        const findPattern = await vscode.window.showInputBox({
            prompt: 'Edit the regex search pattern',
            value: Array.isArray(rule.find) ? rule.find[0] : rule.find
        });

        if (!findPattern) return;

        // Get updated replace pattern
        const replaceValue = Array.isArray(rule.replace) ? rule.replace[0] : rule.replace || '';
        const replacePattern = await vscode.window.showInputBox({
            prompt: 'Edit the replacement pattern',
            value: replaceValue
        });

        if (replacePattern === undefined) return; // Allow empty replace string

        // Get updated flags
        const flagsValue = Array.isArray(rule.flags) ? rule.flags[0] : rule.flags || 'gm';
        const flags = await vscode.window.showInputBox({
            prompt: 'Edit regex flags',
            value: flagsValue
        });

        // Update the rule
        rules[item.ruleKey] = {
            find: findPattern,
            replace: replacePattern,
            flags: flags || 'gm'
        };

        await config.update('rules', rules, vscode.ConfigurationTarget.Global);
        replaceRulesProvider.refresh();
        vscode.window.showInformationMessage(`Rule '${item.ruleKey}' updated`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('replacerules.deleteRule', async (item: RuleTreeItem) => {
        const confirmed = await vscode.window.showWarningMessage(
            `Are you sure you want to delete rule '${item.ruleKey}'?`,
            { modal: true },
            'Delete'
        );

        if (confirmed !== 'Delete') return;

        const config = vscode.workspace.getConfiguration('replacerules');
        const rules = config.get<RulesConfigObject>('rules') || {} as RulesConfigObject;

        if (rules[item.ruleKey]) {
            delete rules[item.ruleKey];
            await config.update('rules', rules, vscode.ConfigurationTarget.Global);
            replaceRulesProvider.refresh();
            vscode.window.showInformationMessage(`Rule '${item.ruleKey}' deleted`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('replacerules.addRuleToRuleset', async (item: RuleTreeItem) => {
        const config = vscode.workspace.getConfiguration('replacerules');
        const rulesets = config.get<RulesetsConfigObject>('rulesets') || {} as RulesetsConfigObject;

        // Build the list of rulesets
        const rulesetItems = Object.keys(rulesets).map(name => ({
            label: name,
            description: ''
        }));

        // Option to create a new ruleset
        rulesetItems.push({
            label: '+ Create new ruleset',
            description: ''
        });

        const selected = await vscode.window.showQuickPick(rulesetItems, {
            placeHolder: 'Select a ruleset or create a new one'
        });

        if (!selected) return;

        let rulesetName = selected.label;

        // Handle creating a new ruleset
        if (rulesetName === '+ Create new ruleset') {
            rulesetName = await vscode.window.showInputBox({
                prompt: 'Enter a name for the new ruleset',
                placeHolder: 'my-ruleset-name'
            }) || '';

            if (!rulesetName) return;
        }

        // Update or create the ruleset
        if (!rulesets[rulesetName]) {
            rulesets[rulesetName] = { rules: [item.ruleKey] };
        } else {
            const rules = rulesets[rulesetName].rules || [];
            if (!rules.includes(item.ruleKey)) {
                rules.push(item.ruleKey);
                rulesets[rulesetName].rules = rules;
            }
        }

        await config.update('rulesets', rulesets, vscode.ConfigurationTarget.Global);
        replaceRulesProvider.refresh();
        vscode.window.showInformationMessage(`Rule '${item.ruleKey}' added to ruleset '${rulesetName}'`);
    }));

    // Register commands for running rules from the tree view
    context.subscriptions.push(vscode.commands.registerCommand('replacerules.runRuleFromExplorer', (item: RuleTreeItem) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const editProvider = new ReplaceRulesEditProvider(editor);
            editProvider.runSingleRule(item.ruleKey);

            // Update usage history
            replaceRulesProvider.updateRuleUsage(item.ruleKey);
        } else {
            vscode.window.showErrorMessage('No active text editor found. Please open a file to apply the rule.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('replacerules.runRulesetFromExplorer', (item: RulesetTreeItem) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const editProvider = new ReplaceRulesEditProvider(editor);
            editProvider.runRuleset(item.rulesetKey);

            // Update usage history
            replaceRulesProvider.updateRuleUsage(item.rulesetKey);
        } else {
            vscode.window.showErrorMessage('No active text editor found. Please open a file to apply the ruleset.');
        }
    }));

    // Listen to configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('replacerules')) {
            replaceRulesProvider.refresh();
        }
    }));
}

export function deactivate() {
    // Clean up global reference
    globalReplaceRulesProvider = null;
}

// Global reference to the tree provider
let globalReplaceRulesProvider: ReplaceRulesProvider | null = null;

function runSingleRule(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, args?: any) {
    let editP = new ReplaceRulesEditProvider(textEditor);
    if (args) {
        let ruleName = args['ruleName'];
        editP.runSingleRule(ruleName);

        // Update rule usage tracking
        if (globalReplaceRulesProvider) {
            globalReplaceRulesProvider.updateRuleUsage(ruleName);
        }
    } else {
        editP.pickRuleAndRun();
    }
    return;
}

function runRuleset(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, args?: any) {
    let editP = new ReplaceRulesEditProvider(textEditor);
    if (args) {
        let rulesetName = args['rulesetName'];
        editP.runRuleset(rulesetName);

        // Update rule usage tracking
        if (globalReplaceRulesProvider) {
            globalReplaceRulesProvider.updateRuleUsage(rulesetName);
        }
    } else {
        editP.pickRulesetAndRun();
    }
    return;
}

function pasteReplace(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, args?: any) {
    let editP = new ReplaceRulesEditProvider(textEditor);
    if (args) {
        let ruleName = args['ruleName'];
        editP.pasteReplace(ruleName);

        // Update rule usage tracking
        if (globalReplaceRulesProvider) {
            globalReplaceRulesProvider.updateRuleUsage(ruleName);
        }
    } else {
        editP.pickRuleAndPaste();
    }
    return;
}

function pasteReplaceRuleset(textEditor: vscode.TextEditor, _edit: vscode.TextEditorEdit, args?: any) {
    let editP = new ReplaceRulesEditProvider(textEditor);
    if (args) {
        let rulesetName = args['rulesetName'];
        editP.pasteReplaceRuleset(rulesetName);

        // Update rule usage tracking
        if (globalReplaceRulesProvider) {
            globalReplaceRulesProvider.updateRuleUsage(rulesetName);
        }
    } else {
        editP.pickRulesetAndPaste();
    }
    return;
}

function stringifyRegex() {
    let options = { prompt: 'Enter a valid regular expression.', placeHolder: '(.*)' };
    vscode.window.showInputBox(options).then(input => {
        if (input) {
            // Strip forward slashes if regex string is enclosed in them
            input = (input.startsWith('/') && input.endsWith('/')) ? input.slice(1, -1) : input;
            try {
                let regex = new RegExp(input);
                let jString = JSON.stringify(regex.toString().slice(1, -1));
                let msg = 'JSON-escaped RegEx: ' + jString;
                vscode.window.showInformationMessage(msg, 'Copy to clipboard').then(choice => {
                    if (choice && choice === 'Copy to clipboard') {
                        vscode.env.clipboard.writeText(jString);
                    }
                });
            } catch (err: any) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    });
}
