import * as vscode from 'vscode';
import { gitMvWithSaveDialog } from './gitMvWithSaveDialog';


export function activate(context: vscode.ExtensionContext)
{
	const _gitMvWithDialog = vscode.commands.registerCommand(
		'git-mv-with-save-dialog.gitMvWithSaveDialog', 
		gitMvWithSaveDialog
	);

	context.subscriptions.push( _gitMvWithDialog );
}

export function deactivate() {}
