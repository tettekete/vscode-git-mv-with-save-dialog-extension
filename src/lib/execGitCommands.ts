import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import {
	sleep,
	escapeArgumentForShell
} from './utils';

const execAsync = promisify(exec);

type CommandResult = {
	error: Error | undefined,
	stdout: string,
	stderr: string
};

const kGitIndexLockedRegex = /^fatal: Unable to create(?:.+)\.git\/index\.lock': File exists/;


/**
 * Executes a Git command with the specified options and files.
 * 
 * @param {Object} params - The parameters for the command execution.
 * @param {string} params.command - The Git command to execute (e.g., 'git add', 'git commit').
 * @param {string[]} [params.options=[]] - Additional options for the command.
 * @param {string[]} [params.files=[]] - Files to include in the command.
 * @param {string} params.cwd - The current working directory for the command.
 * @param {boolean} [params.usePeriodWhenEmptyFiles=false] - Whether to use '.' when no files are provided.
 * @returns {Promise<CommandResult>} A promise that resolves to the result of the command execution.
 */
export async function execGitCommand(
	{
		 command
		,options = []
		,files = []
		,cwd
		,usePeriodWhenEmptyFiles = false
	}:
	{
		command: string,
		options?: string[],
		files?: string[] ,
		cwd: string,
		usePeriodWhenEmptyFiles?: boolean,
	}
):Promise<CommandResult>
{
	const commandText = _buildGitCommand({
		command,
		options,
		files,
		cwd,
		usePeriodWhenEmptyFiles
	});

	const execOption:{[key: string]:unknown} = {};

	if( cwd )
	{
		execOption['cwd'] = cwd;
	}
	
	let _stdout:string = '';
	let _stderr:string = '';
	let error:Error|undefined = undefined;
	let gitIndexLocked = false;
	
	const tryExecGitCommand = async () =>
	{
		try
		{
			const { stdout , stderr } = await execAsync(
				commandText,
				execOption,
			);

			_stdout = stdout;
			_stderr = stderr;
		}
		catch( e )
		{
			if( e instanceof Error )
			{
				if( 'stderr' in e )
				{
					const stderr:string = e['stderr'] as string;
					if( kGitIndexLockedRegex.test( stderr ) )
					{
						gitIndexLocked = true;
					}

				}
				error = e;
				
			}
			else
			{
				error = Error(`${e}`);
			}
		}
	};

	let maxRetry = 8;
	const retryWaitSec = 0.4;
	while( maxRetry -- > 0 )
	{
		gitIndexLocked	= false;
		_stdout			= '';
		_stderr			= '';
		error			= undefined;

		await tryExecGitCommand();
		if( error && gitIndexLocked )
		{
			console.debug('.git/index.lock exists.');
			await sleep( retryWaitSec );
			continue;
		}
		
		break;
	}


	return {
		error: error,
		stdout: _stdout,
		stderr: _stderr
	};
}



function _buildGitCommand(
	{
		command
		,options = []
		,files = []
		,cwd
		,usePeriodWhenEmptyFiles = false
	}:
	{
		command: string,
		options?: string[],
		files?: string[] ,
		cwd: string,
		usePeriodWhenEmptyFiles?: boolean
	}
):string
{
	const cmdList:string[] = ['git' , command];
	const filesAsArgs = files.map((file) =>
	{
		let relPath = file;
		if( path.isAbsolute( relPath ) )
		{
			relPath = path.relative( cwd , file );
		}

		return escapeArgumentForShell( relPath );
	});

	// handle command options
	if( options.length > 0 )
	{
		options.forEach(( _option ) =>
		{
			cmdList.push( _option );
		});
	}

	// append files
	if( filesAsArgs.length > 0 )
	{
		filesAsArgs.forEach(( file ) =>
		{
			cmdList.push( file );
		});
	}
	else if( usePeriodWhenEmptyFiles )
	{
		cmdList.push( '.' );
	}

	// build command
	const commandText = cmdList.join(' ');
	
	return commandText;
}

