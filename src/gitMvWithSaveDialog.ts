import * as vscode from 'vscode';
import {
	findWorkspaceFolder,
	getRelativePath
} from './lib/utils';
import path from 'node:path';
import { execGitCommand } from './lib/execGitCommands';

export async function gitMvWithSaveDialog()
{
	const editor = vscode.window.activeTextEditor;
	if (! editor)
	{
		return;
	}

	const oldUri = editor.document.uri;
	const workspaceFolder = findWorkspaceFolder( oldUri.fsPath );
	if( workspaceFolder === undefined )
	{
		vscode.window.showErrorMessage(`"${oldUri.fsPath}" is not a file in the workspace folder.`);
		return;
	}
	
	let oldRelPath = getRelativePath( oldUri.fsPath , workspaceFolder);
	if (! oldRelPath)
	{
		oldRelPath = path.basename( oldUri.fsPath );
	}

	const newUri = await vscode.window.showSaveDialog(
	{
		defaultUri: oldUri,
		saveLabel: 'Move Here (git mv)',
		title: `git mv "{oldRelPath}" to:`,
    });

	if (! newUri)
	{
		return;
	}
	
	const newRelPath = getRelativePath( newUri.fsPath, workspaceFolder );
	if (! newRelPath)
	{
		vscode.window.showErrorMessage(`"${newUri.fsPath}" is not a file in the workspace folder."`);
		return;
	}

	const gitMvResult = await execGitCommand(
		{
			command: 'mv',
			files: [ oldRelPath, newRelPath ],
			cwd: workspaceFolder,
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


/**
 * oldUri で開かれたタブを探し、newUri で開き直します。
 *
 * @async
 * @param {vscode.Uri} oldUri 
 * @param {vscode.Uri} newUri 
 * @returns {*} 
 */
async function updateEditorUri( oldUri: vscode.Uri, newUri: vscode.Uri )
{
	const newDoc	= await vscode.workspace.openTextDocument(newUri);

	while( true )
	{
		// オリジンファイルを失った閉じるべきタブを探します
		const oldTab = findOldTab( oldUri );
		if( ! oldTab ){ break; } // 古いタブが見つからなければ終了

		const activeTabInfo = await getActiveTabInfo( oldTab.group );
	
		await vscode.window.tabGroups.close( oldTab ); // 古いタブを閉じる
		await vscode.window.showTextDocument(newDoc, 
			{
				viewColumn: oldTab.group.viewColumn,
				preview: oldTab.isPreview,
				preserveFocus: true,
			}
		);

		if( ! activeTabInfo ){ continue; }
		if( activeTabInfo.doc.uri.fsPath === oldUri.fsPath ) { continue; }

		await vscode.window.showTextDocument(
			activeTabInfo.doc, 
			{
				viewColumn: activeTabInfo.viewColumn,
				preview: activeTabInfo.isPreview,
				preserveFocus: false,
			}
		);
	}
	
}



/**
 * タブグループのアクティブなタブの情報を取得します。
 *
 * 古いタブをクローズして新しいファイルをオープンする処理の前にアクティブだった
 * タブの情報を取得するための関数です。
 *
 * @async
 * @param {vscode.TabGroup} tagGroup 
 * @returns {Promise<{
 * 	doc: vscode.TextDocument;
 * 	viewColumn: vscode.ViewColumn;
 * 	isPreview: boolean;
 * } | undefined>} 
 */
async function getActiveTabInfo( tagGroup: vscode.TabGroup )
: Promise<{
	doc: vscode.TextDocument;
	viewColumn: vscode.ViewColumn;
	isPreview: boolean;
} | undefined>
{
	if( ! tagGroup.activeTab ) { return undefined ;}
	if( tagGroup.activeTab.input instanceof vscode.TabInputText )
	{
		const doc = await vscode.workspace.openTextDocument( tagGroup.activeTab.input.uri );
		return {
			doc ,
			viewColumn: tagGroup.viewColumn,
			isPreview: tagGroup.activeTab.isPreview
		};
	}

	return undefined;
}



/**
 * vscode.window.tabGroups.all から指定された URI と一致する古いタブ
 * = 閉じるべきタブを一つ返します。
 *
 * 最初に一度だけ取得した vscode.window.tabGroups.all の結果を保持したまま
 *「開き直し」の処理を行うと、二つ目以降のクローズ処理で機能拡張がクラッシュするため
 *「開き直し」を行う度に次の古いタブを取得して処理する必要があります。
 *
 * @param {vscode.Uri} oldUri 
 * @returns {(vscode.Tab | undefined)} 
 */
function findOldTab( oldUri: vscode.Uri ): vscode.Tab | undefined
{
	return vscode.window.tabGroups.all
		.flatMap(group => group.tabs)
		.find((tab) =>
			{
				return tab.input instanceof vscode.TabInputText
					&& tab.input.uri.fsPath === oldUri.fsPath;
			}
		);
}
