import * as vscode from 'vscode';
import path from 'node:path';
import * as os from 'node:os';

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
