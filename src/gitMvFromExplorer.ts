import * as vscode from 'vscode';
import {
	getRelativePath,
	updateEditorUri
} from './lib/utils';
import {
	getExplorerTargets,
	normalizeTargets
} from './lib/explorerTargetUtils';
import { execGitCommand } from './lib/execGitCommands';
import logger from './lib/Logger4VSCode';
import {
	findGitRepoRoot,
	isGitTrackedFile
} from './lib/gitCommandUtils';

const kWarnOnSkippingUntrackedExplorerFiles = 'warnOnSkippingUntrackedExplorerFiles';
const kSkipWarningOk = 'OK';
const kSkipWarningOkDoNotShowAgain = 'OK (Do not show again)';
const kSkipWarningCancel = 'Cancel';

type MoveTarget =
{
	uri: vscode.Uri;
	relPath: string;
	kind: 'file' | 'directory';
};

type FilterGitMovableTargetsResult =
{
	targets: MoveTarget[];
	skippedTargets: MoveTarget[];
};

/**
 * Explorer のコンテキストメニューから `git mv` を実行します。
 *
 * `selected` を主な移動対象として扱い、正規化後に対象が 0 件であれば何もせず終了します。
 * 対象の数と種類に応じて、単一ファイル、単一ディレクトリ、複数選択の各処理へ振り分けます。
 *
 * @async
 * @param {vscode.Uri} uri - 右クリックされた項目の URI。
 * @param {vscode.Uri[]} selected - Explorer で選択されている URI 群。
 * @returns {Promise<void>}
 */
export async function gitMvFromExplorer( uri: vscode.Uri ,selected: vscode.Uri[] )
{
	const explorerTargets = normalizeTargets( getExplorerTargets( uri, selected ) );
	if( explorerTargets.length === 0 )
	{
		return;
	}

	const resolved = await resolveMoveTargets( explorerTargets );
	if( ! resolved )
	{
		return;
	}

	const {
		repoRoot,
		targets
	} = resolved;

	const filtered = await filterGitMovableTargets( repoRoot, targets );
	if( filtered.skippedTargets.length > 0 )
	{
		const shouldContinue = await handleSkippedUntrackedTargets( filtered.skippedTargets );
		if( ! shouldContinue )
		{
			return;
		}
	}

	if( filtered.targets.length === 0 )
	{
		vscode.window.showInformationMessage('No tracked files or folders to move.');
		return;
	}

	if( filtered.targets.length === 1 )
	{
		const target = filtered.targets[0];
		if( target.kind === 'file' )
		{
			await moveSingleFile( repoRoot, target );
			return;
		}

		await moveSingleDirectory( repoRoot, target );
		return;
	}

	await moveMultipleTargets( repoRoot, filtered.targets );
}

/**
 * 与えられた Uri リストから有効な Uri を抽出し,MoveTarget データ構造のデータを返す。
 * 
 * 「有効な」の条件:
 * - Git リポジトリ配下のファイルであること
 * - 同一の Git リポジトリ配下のファイルであること
 * - ファイルの種類を特定できること
 * エラーがあった場合はエラーメッセージを表示し、undefined を返す。
 *
 * 返却される `MoveTarget.relPath` は repo root からの相対パスです。
 * また、返却される `repoRoot` は後続の `git mv` 実行時に `cwd` として利用されます。
 * 
 * @async
 * @param {vscode.Uri[]} explorerTargets - 正規化済みの Explorer 選択対象。
 * @returns {Promise<{repoRoot: string; targets: MoveTarget[]} | undefined>}
 */
async function resolveMoveTargets( explorerTargets: vscode.Uri[] )
:Promise<{
	repoRoot: string;
	targets: MoveTarget[];
} | undefined>
{
	const repoRoot = await findGitRepoRoot( explorerTargets[0].fsPath );
	if( ! repoRoot )
	{
		vscode.window.showErrorMessage(`"${explorerTargets[0].fsPath}" is not in a Git repository.`);
		return undefined;
	}

	const targets:MoveTarget[] = [];
	for( const targetUri of explorerTargets )
	{
		const targetRepoRoot = await findGitRepoRoot( targetUri.fsPath );
		if( targetRepoRoot !== repoRoot )
		{
			vscode.window.showErrorMessage('Please select files/folders in the same Git repository.');
			return undefined;
		}

		const relPath = getRelativePath( targetUri.fsPath, repoRoot );
		if( ! relPath )
		{
			vscode.window.showErrorMessage(`"${targetUri.fsPath}" is not in the same Git repository.`);
			return undefined;
		}

		let stat:vscode.FileStat;
		try
		{
			stat = await vscode.workspace.fs.stat( targetUri );
		}
		catch( error )
		{
			const message = error instanceof Error ? error.message : `${error}`;
			vscode.window.showErrorMessage(`Failed to get target type for "${relPath}": ${message}`);
			return undefined;
		}

		const kind = (stat.type & vscode.FileType.Directory) === vscode.FileType.Directory
			? 'directory'
			: 'file';

		targets.push({
			uri: targetUri,
			relPath,
			kind
		});
	}

	return {
		repoRoot,
		targets
	};
}

/**
 * `git mv` の移動ソースとして採用可能な対象だけを抽出します。
 *
 * 単体 file は Git 管理対象かどうかを確認し、未追跡 file は除外対象へ分けます。
 * directory は配下に未追跡ファイルを含んでいても、そのまま移動対象として残します。
 *
 * @async
 * @param {string} repoRoot - tracked 判定を行う Git リポジトリルート。
 * @param {MoveTarget[]} targets - `resolveMoveTargets()` で解決済みの移動対象。
 * @returns {Promise<FilterGitMovableTargetsResult>} 採用対象と除外対象。
 */
async function filterGitMovableTargets(
	repoRoot: string,
	targets: MoveTarget[]
):Promise<FilterGitMovableTargetsResult>
{
	const movableTargets:MoveTarget[] = [];
	const skippedTargets:MoveTarget[] = [];

	for( const target of targets )
	{
		if( target.kind === 'directory' )
		{
			movableTargets.push( target );
			continue;
		}

		if( await isGitTrackedFile( repoRoot, target.relPath ) )
		{
			movableTargets.push( target );
			continue;
		}

		skippedTargets.push( target );
	}

	return {
		targets: movableTargets,
		skippedTargets
	};
}

/**
 * 未追跡 file を除外して続行するかどうかをユーザーへ確認します。
 *
 * 設定で警告が無効化されている場合は、ダイアログを表示せずに続行します。
 * `OK (Do not show again)` が選ばれた場合は、以後この警告を表示しない設定をユーザー設定へ保存します。
 *
 * @async
 * @param {MoveTarget[]} skippedTargets - `git mv` の source から除外する未追跡 file 群。
 * @returns {Promise<boolean>} 続行する場合は `true`。
 */
async function handleSkippedUntrackedTargets( skippedTargets: MoveTarget[] ):Promise<boolean>
{
	const config = vscode.workspace.getConfiguration('git-mv-with-save-dialog');
	const warnOnSkippingUntrackedExplorerFiles = config.get<boolean>(
		kWarnOnSkippingUntrackedExplorerFiles,
		true
	);

	if( ! warnOnSkippingUntrackedExplorerFiles )
	{
		return true;
	}

	const skippedTargetMessage = formatSkippedTargetMessage( skippedTargets );
	const selected = await vscode.window.showWarningMessage(
		`The following untracked files will be skipped because they cannot be moved with git mv: ${skippedTargetMessage}. Continue?`,
		kSkipWarningOk,
		kSkipWarningOkDoNotShowAgain,
		kSkipWarningCancel
	);

	if( selected === kSkipWarningOk )
	{
		return true;
	}

	if( selected === kSkipWarningOkDoNotShowAgain )
	{
		await config.update(
			kWarnOnSkippingUntrackedExplorerFiles,
			false,
			vscode.ConfigurationTarget.Global
		);
		return true;
	}

	return false;
}

/**
 * 警告ダイアログに表示する未追跡 file 一覧の要約文字列を生成します。
 *
 * 先頭数件のみ列挙し、件数が多い場合は残件数を付記します。
 *
 * @param {MoveTarget[]} skippedTargets - 除外対象の未追跡 file 群。
 * @returns {string} ダイアログ表示用の要約文字列。
 */
function formatSkippedTargetMessage( skippedTargets: MoveTarget[] ):string
{
	const maxDisplayCount = 3;
	const labels = skippedTargets
		.slice( 0, maxDisplayCount )
		.map((target) => `"${target.relPath}"`);

	if( skippedTargets.length <= maxDisplayCount )
	{
		return labels.join(', ');
	}

	const remainingCount = skippedTargets.length - maxDisplayCount;
	return `${labels.join(', ')}, and ${remainingCount} more`;
}

/**
 * 単一ファイルを対象に保存ダイアログを表示し、選択先へ `git mv` を実行します。
 *
 * 移動成功時のみ、元ファイルを開いているエディタを移動先 URI で開き直します。
 *
 * @async
 * @param {string} repoRoot - `git mv` を実行する Git リポジトリルート。
 * @param {MoveTarget} target - 移動対象のファイル。
 * @returns {Promise<void>}
 */
async function moveSingleFile( repoRoot: string, target: MoveTarget )
{
	const destinationUri = await vscode.window.showSaveDialog(
	{
		defaultUri: target.uri,
		saveLabel: 'Move Here (git mv)',
		title: `git mv "${target.relPath}" to:`,
	});

	if( ! destinationUri )
	{
		return;
	}

	const destinationRelPath = getRelativePath( destinationUri.fsPath, repoRoot );
	if( ! destinationRelPath )
	{
		vscode.window.showErrorMessage(`"${destinationUri.fsPath}" is not in the same Git repository.`);
		return;
	}

	const result = await execGitCommand(
		{
			command: 'mv',
			files: [ target.relPath, destinationRelPath ],
			cwd: repoRoot,
		}
	);

	if( result.error )
	{
		vscode.window.showErrorMessage(
			`git mv "${target.relPath}" to "${destinationRelPath}" failed: ${result.error.message}`
		);
		return;
	}

	updateEditorUri( target.uri, destinationUri );
}

/**
 * 単一ディレクトリを対象にフォルダ選択ダイアログを表示し、選択先配下へ `git mv` を実行します。
 *
 * 移動先として repo root 自身が選ばれた場合、`git mv` の destination 引数には `.` を使います。
 *
 * @async
 * @param {string} repoRoot - `git mv` を実行する Git リポジトリルート。
 * @param {MoveTarget} target - 移動対象のディレクトリ。
 * @returns {Promise<void>}
 */
async function moveSingleDirectory( repoRoot: string, target: MoveTarget )
{
	const destinationDirUri = await chooseDestinationDirectory( target.relPath );
	if( ! destinationDirUri )
	{
		return;
	}

	const destinationDirRelPath = getRelativePath( destinationDirUri.fsPath, repoRoot );
	if( destinationDirRelPath === undefined )
	{
		vscode.window.showErrorMessage(`"${destinationDirUri.fsPath}" is not in the same Git repository.`);
		return;
	}

	const result = await execGitCommand(
		{
			command: 'mv',
			files: [ target.relPath, destinationDirRelPath || '.' ],
			cwd: repoRoot,
		}
	);

	if( result.error )
	{
		vscode.window.showErrorMessage(
			`git mv "${target.relPath}" to "${destinationDirRelPath}" failed: ${result.error.message}`
		);
	}
}

/**
 * 複数のファイル・ディレクトリを 1 つの移動先ディレクトリへまとめて `git mv` します。
 *
 * `files: [ ...sourcePaths, destinationDir ]` は
 * `git mv <source>... <destination-directory>` の形式に対応しています。
 * 移動先として repo root 自身が選ばれた場合、destination 引数には `.` を使います。
 *
 * @async
 * @param {string} repoRoot - `git mv` を実行する Git リポジトリルート。
 * @param {MoveTarget[]} targets - 移動対象のファイル・ディレクトリ群。
 * @returns {Promise<void>}
 */
async function moveMultipleTargets( repoRoot: string, targets: MoveTarget[] )
{
	const destinationDirUri = await chooseDestinationDirectory();
	if( ! destinationDirUri )
	{
		return;
	}

	const destinationDirRelPath = getRelativePath( destinationDirUri.fsPath, repoRoot );
	if( destinationDirRelPath === undefined )
	{
		vscode.window.showErrorMessage(`"${destinationDirUri.fsPath}" is not in the same Git repository.`);
		return;
	}

	const sourcePaths = targets.map((target) => target.relPath);
	const result = await execGitCommand(
		{
			command: 'mv',
			files: [ ...sourcePaths, destinationDirRelPath || '.' ],
			cwd: repoRoot,
		}
	);

	if( result.error )
	{
		vscode.window.showErrorMessage(
			`git mv "${sourcePaths.join('" "')}" to "${destinationDirRelPath}" failed: ${result.error.message}`
		);
	}
}

/**
 * 移動先ディレクトリを選ぶためのフォルダ選択ダイアログを表示します。
 *
 * ユーザーが選択をキャンセルした場合は `undefined` を返します。
 * `oldRelPath` が与えられた場合は、ダイアログタイトルに対象パスを表示します。
 *
 * @async
 * @param {string} [oldRelPath] - 単一対象時にタイトルへ表示する元パス。
 * @returns {Promise<vscode.Uri | undefined>}
 */
async function chooseDestinationDirectory( oldRelPath?: string ):Promise<vscode.Uri | undefined>
{
	const result = await vscode.window.showOpenDialog(
		{
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Move Here (git mv)',
			title: oldRelPath ? `git mv "${oldRelPath}" to directory:` : 'git mv selected items to directory:',
		}
	);

	if( ! result || result.length === 0 )
	{
		return undefined;
	}

	return result[0];
}
