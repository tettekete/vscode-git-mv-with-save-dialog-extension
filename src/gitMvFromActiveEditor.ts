import * as vscode from 'vscode';
import path from 'node:path';
import { execGitCommand } from './lib/execGitCommands';
import {
	getRelativePath,
	updateEditorUri,
} from './lib/utils';
import {
	findGitRepoRoot,
	isGitTrackedFile
} from './lib/gitCommandUtils';

function getCurrentTargetUrl(): vscode.Uri | undefined
{
	const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
	const input = tab?.input;

	if( input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputNotebook )
	{
		return input.uri;
	}
	
	return undefined;
}

export async function gitMvFromActiveEditor()
{
	const oldUri = getCurrentTargetUrl();
	if( ! oldUri )
	{
		vscode.window.showErrorMessage('The file is not open, or this is an unsupported tab.');
		return;
	}

	const repoRoot = await findGitRepoRoot( oldUri.fsPath );
	if( repoRoot === undefined )
	{
		vscode.window.showErrorMessage(`"${oldUri.fsPath}" is not in a Git repository.`);
		return;
	}
	
	let oldRelPath = getRelativePath( oldUri.fsPath , repoRoot );
	if( ! oldRelPath )
	{
		oldRelPath = path.basename( oldUri.fsPath );
	}

	if( ! await isGitTrackedFile( repoRoot, oldRelPath ) )
	{
		vscode.window.showErrorMessage(`"${oldRelPath}" is not tracked by Git.`);
		return;
	}

	const newUri = await vscode.window.showSaveDialog(
	{
		defaultUri: oldUri,
		saveLabel: 'Move Here (git mv)',
		title: `git mv "${oldRelPath}" to:`,
	});

	if( ! newUri )
	{
		return;
	}
	
	const newRelPath = getRelativePath( newUri.fsPath, repoRoot );
	if( ! newRelPath )
	{
		vscode.window.showErrorMessage(`"${newUri.fsPath}" is not in the same Git repository.`);
		return;
	}

	const gitMvResult = await execGitCommand(
		{
			command: 'mv',
			files: [ oldRelPath, newRelPath ],
			cwd: repoRoot,
		}
	);

	if( gitMvResult.error )
	{
		vscode.window.showErrorMessage(
			`git mv "${oldRelPath}" to "${newRelPath}" failed: ${gitMvResult.error.message}`
		);
		return;
	}

	updateEditorUri( oldUri, newUri );
}
