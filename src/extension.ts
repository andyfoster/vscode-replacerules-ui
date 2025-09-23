import * as vscode from 'vscode';

import ReplaceRulesEditProvider from './editProvider';
import { ReplaceRulesProvider, RuleTreeItem, RulesetTreeItem } from './replaceRulesTreeProvider';

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
