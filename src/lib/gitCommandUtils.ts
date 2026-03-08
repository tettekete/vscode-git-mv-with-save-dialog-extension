import {execGitCommand} from './execGitCommands';
import { escapeArgumentForShell } from './utils';
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
	const safePath = escapeArgumentForShell( relPath );
	const result = await execGitCommand({
		command: 'ls-files',
		options: ['--error-unmatch'],
		files: [ safePath ],
		cwd: repo_dir,
	});

	return ! result.error;
}