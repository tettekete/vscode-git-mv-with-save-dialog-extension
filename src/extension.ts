import * as vscode from 'vscode';
import logger from './lib/Logger4VSCode';
import {
	gitMvFromActiveEditor,
	gitMvFromExplorer
} from './gitMvWithSaveDialog';


export function activate(context: vscode.ExtensionContext)
{
	logger.init(context);
	logger.setName('Git Move with Save Dialog');

	vscode.commands.executeCommand('setContext', 'git-mv-with-save-dialog.notShowInCommandPalette', false);

	const _gitMvFromActiveEditor = vscode.commands.registerCommand(
		'git-mv-with-save-dialog.gitMvFromActiveEditor', 
		gitMvFromActiveEditor
	);

	const _gitMvFromExplorer = vscode.commands.registerCommand(
		'git-mv-with-save-dialog.gitMvFromExplorer', 
		gitMvFromExplorer
	);

	context.subscriptions.push( _gitMvFromActiveEditor );
	context.subscriptions.push( _gitMvFromExplorer );
}

export function deactivate() {}
