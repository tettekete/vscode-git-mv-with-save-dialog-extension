import * as vscode from 'vscode';
import path from 'node:path';
import * as os from 'node:os';
import fs from 'node:fs';

/**
 * Find the workspace folder that contains the given file path.
 * @param filePath The file path to check.
 * @returns The root path of the workspace folder, or `undefined` if not found.
 */
export function findWorkspaceFolder(filePath: string): string | undefined
{
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if ( ! workspaceFolders )
	{
        return undefined;
    }

	for (const folder of workspaceFolders)
	{
		if (filePath.startsWith(folder.uri.fsPath))
		{
			return folder.uri.fsPath;
		}
	}

    return undefined;
}


export function getRelativePath( filePath: string, workspaceFolder?: string): string | undefined
{
	if (! workspaceFolder)
	{
		workspaceFolder = findWorkspaceFolder(filePath);
		if (! workspaceFolder)
		{
			return undefined;
		}
	}

	const relativePath = path.relative(workspaceFolder, filePath);
	if( path.isAbsolute( relativePath ) || relativePath.startsWith('..') || relativePath === '..' )
	{
		return undefined;
	}

	return relativePath;
}

/**
 * Escapes a string to make it safe for use as a shell command argument.
 * 
 * This function ensures that the provided argument is properly escaped for
 * the target platform (Windows or Unix-like systems), preventing issues
 * such as command injection or improper parsing of special characters.
 * 
 * @param {string} argument - The string to escape.
 * @returns {string} The escaped string, safe for use in a shell command.
 */
export function escapeArgumentForShell( argument: string ): string
{
	const platform = os.platform();

	if (platform === 'win32')
	{
		// Windows: Enclose in double quotes and escape the double quotes.
		return `"${argument.replace(/"/g, '\\"')}"`;
	}
	else
	{
		// macOS/Linux: Enclose in single quotes and escape the single quotes.
		return `'${argument.replace(/'/g, "'\\''")}'`;
	}
}


export async function sleep( sec:number ):Promise<void>
{
	const msec = Math.floor( sec * 1000 );
	return new Promise((resolve )=>
	{
		setTimeout(()=>
			{
				resolve();
			}
			,msec
		);
	});
}


/**
 * oldUri で開かれたタブを探し、newUri で開き直します。
 *
 * @async
 * @param {vscode.Uri} oldUri 
 * @param {vscode.Uri} newUri 
 * @returns {*} 
 */
export async function updateEditorUri( oldUri: vscode.Uri, newUri: vscode.Uri )
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


export function isFilePath( filePath: string ):boolean
{
	try
	{
		const stats = fs.statSync( filePath );
		return stats.isFile();
	}
	catch (err)
	{
		return false;
	}
}

export function isDirectoryPath( filePath: string ):boolean
{
	try
	{
		const stats = fs.statSync( filePath );
		return stats.isDirectory();
	}
	catch (err)
	{
		return false;
	}
}
