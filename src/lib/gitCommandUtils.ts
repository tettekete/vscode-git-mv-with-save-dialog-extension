import {execGitCommand} from './execGitCommands';
import { escapeArgumentForShell,isFilePath } from './utils';
import path from 'node:path';

/**
 * Checks if a given directory is tracked by Git.
 * 
 * This function determines whether the specified directory is part of a Git repository
 * by executing the `git rev-parse --is-inside-work-tree` command within the directory.
 * 
 * @async
 * @param {string} directory - The path to the directory to check.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the directory is tracked by Git, or `false` otherwise.
 */
export async function isGitTrackedDir( directory: string ):Promise<boolean>
{
	const result = await execGitCommand({
		command: 'rev-parse',
		options: ['--is-inside-work-tree'],
		cwd: directory
	});

	return ! result.error;
}

/**
 * Checks if a given file is tracked by Git.
 * 
 * This function determines whether the specified file is part of a Git repository
 * by executing the `git ls-files --error-unmatch` command within the repository.
 * 
 * @async
 * @param {string} repo_dir - The path to the Git repository.
 * @param {string} file_path - The path to the file to check.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the file is tracked by Git, or `false` otherwise.
 */
export async function isGitTrackedFile( repo_dir: string ,file_path: string )
{
	const relPath = path.isAbsolute( file_path )
					? path.relative( repo_dir , file_path )
					: file_path;
	// const safePath = escapeArgumentForShell( relPath );
	const result = await execGitCommand({
		command: 'ls-files',
		options: ['--error-unmatch'],
		files: [ relPath ],
		cwd: repo_dir,
	});

	return ! result.error;
}


/**
 * 指定されたファイル・ディレクトリパスについて、git リポジトリ配下のファイル、ディレクトリか
 * チェックし、配下であればそのリポジトリルートのファイルパスを返す。
 * 
 * ファイルパスが指定された場合、そのファイルが git 追跡対象であるかどうかは問わない。
 *
 * @param {string} filePathOrDirectory 
 * @returns {Promise<string | undefined>} 
 */
export async function findGitRepoRoot( filePathOrDirectory : string )
:Promise<string | undefined>
{
	if( isFilePath( filePathOrDirectory ) )
	{
		filePathOrDirectory = path.dirname( filePathOrDirectory );
	}

	const result = await execGitCommand({
		command: 'rev-parse',
		options: [
			'--show-toplevel'
		],
		cwd: filePathOrDirectory
	});
	
	if (result.error) {
		return undefined;
	}

	return result.stdout.trim();
}

export const foundGitRepoRoot = findGitRepoRoot;
