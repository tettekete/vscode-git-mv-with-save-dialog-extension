import * as vscode from 'vscode';
import path from 'node:path';

/**
 * Explorer の複数選択に祖先/子孫関係が含まれる場合の解決方針。
 *
 * - `preferChildren`: 親や祖先を除外し、より具体的な子孫側を残します。
 * - `preferAncestors`: 子孫を除外し、より上位の親や祖先を残します。
 */
export type SelectionConflictPolicy = 'preferChildren' | 'preferAncestors';

/**
 * Explorer コンテキストメニューから渡された引数から移動対象 URI 群を抽出します。
 *
 * `selected` が与えられている場合はそれを優先し、空配列であれば対象なしとして扱います。
 * `selected` が無く `uri` のみが与えられている場合は、その単一 URI を対象として返します。
 *
 * @param {vscode.Uri} [uri] - 右クリックされた項目の URI。
 * @param {vscode.Uri[]} [selected] - Explorer 上で選択されている URI 群。
 * @returns {vscode.Uri[]} 抽出された移動対象 URI 群。
 */
export function getExplorerTargets(
	uri?: vscode.Uri,
	selected?: vscode.Uri[]
):vscode.Uri[]
{
	if( selected )
	{
		if( selected.length === 0 )
		{
			return [];
		}

		return selected;
	}

	if( uri )
	{
		return [ uri ];
	}

	return [];
}

/**
 * Explorer から得た移動対象 URI 群を正規化します。
 *
 * まず重複を除去し、その後に親子競合がある場合は `policy` に従って不要な側を除外します。
 * 対象が 0 件または 1 件であれば、そのまま返します。
 *
 * @param {vscode.Uri[]} targets - 正規化対象の URI 群。
 * @param {SelectionConflictPolicy} [policy='preferChildren'] - 親子競合の解決方針。
 * @returns {vscode.Uri[]} 正規化後の URI 群。
 */
export function normalizeTargets(
	targets: vscode.Uri[],
	policy: SelectionConflictPolicy = 'preferChildren'
):vscode.Uri[]
{
	const deduplicatedTargets = dedupeTargets( targets );

	if( deduplicatedTargets.length <= 1 )
	{
		return deduplicatedTargets;
	}

	return pruneByPolicy( deduplicatedTargets, policy );
}

/**
 * fsPath ベースで重複する URI を除去し、最初に出現した要素だけを残します。
 *
 * VSCode Explorer の通常の選択状態では重複は発生しにくいですが、
 * この関数群が将来的に Explorer 以外の入力元からも利用される可能性を考慮し、
 * 入力正規化の一環として防御的に重複を除去しています。
 *
 * 併せて、親子関係の解決を行う `pruneByPolicy()` 側では
 * 「重複のない URI 集合に対して祖先/子孫の競合だけを扱う」
 * という前提を置けるようにし、責務を分離しています。
 *
 * @param {vscode.Uri[]} targets - 重複除去対象の URI 群。
 * @returns {vscode.Uri[]} 重複除去後の URI 群。
 */
function dedupeTargets( targets: vscode.Uri[] ):vscode.Uri[]
{
	const known = new Set<string>();
	const deduped:vscode.Uri[] = [];

	for( const target of targets )
	{
		if( known.has( target.fsPath ) )
		{
			continue;
		}

		known.add( target.fsPath );
		deduped.push( target );
	}

	return deduped;
}

/**
 * 親子関係を持つ URI が複数含まれる場合に、指定ポリシーに従って不要な側を除外します。
 *
 * @param {vscode.Uri[]} targets - 重複除去済みの URI 群。
 * @param {SelectionConflictPolicy} policy - 親子競合の解決方針。
 * @returns {vscode.Uri[]} ポリシー適用後の URI 群。
 */
function pruneByPolicy(
	targets: vscode.Uri[],
	policy: SelectionConflictPolicy
):vscode.Uri[]
{
	return targets.filter((candidate, candidateIndex) =>
	{
		for( const [ otherIndex, otherTarget ] of targets.entries() )
		{
			if( candidateIndex === otherIndex )
			{
				continue;
			}

			// 親子関係がない場合は競合しないので、次の比較対象に進みます。
			if( ! hasAncestorDescendantRelation( candidate.fsPath, otherTarget.fsPath ) )
			{
				continue;
			}

			// 親子関係がある場合に、どちらを残すかだけをここで決める。
			if( policy === 'preferChildren' && isAncestorPath( candidate.fsPath, otherTarget.fsPath ) )
			{
				return false;
			}

			if( policy === 'preferAncestors' && isDescendantPath( candidate.fsPath, otherTarget.fsPath ) )
			{
				return false;
			}
		}

		return true;
	});
}

/**
 * 2 つのパスが祖先/子孫の関係にあるかどうかを返します。
 *
 * @param {string} lhsPath - 比較対象の一方のパス。
 * @param {string} rhsPath - 比較対象のもう一方のパス。
 * @returns {boolean} 祖先/子孫関係がある場合は `true`。
 */
function hasAncestorDescendantRelation( lhsPath: string, rhsPath: string ):boolean
{
	return isAncestorPath( lhsPath, rhsPath ) || isAncestorPath( rhsPath, lhsPath );
}

/**
 * `ancestorPath` が `maybeDescendantPath` の祖先パスであるかどうかを返します。
 *
 * 同一パスは祖先とは見なしません。
 *
 * @param {string} ancestorPath - 祖先であることを期待するパス。
 * @param {string} maybeDescendantPath - 子孫であることを期待するパス。
 * @returns {boolean} 祖先関係にある場合は `true`。
 */
function isAncestorPath( ancestorPath: string, maybeDescendantPath: string ):boolean
{
	const relative = path.relative( ancestorPath, maybeDescendantPath );
	return relative !== ''
		&& ! relative.startsWith('..')
		&& ! path.isAbsolute( relative );
}

/**
 * `maybeDescendantPath` が `ancestorPath` の子孫パスであるかどうかを返します。
 *
 * @param {string} maybeDescendantPath - 子孫であることを期待するパス。
 * @param {string} ancestorPath - 祖先であることを期待するパス。
 * @returns {boolean} 子孫関係にある場合は `true`。
 */
function isDescendantPath( maybeDescendantPath: string, ancestorPath: string ):boolean
{
	return isAncestorPath( ancestorPath, maybeDescendantPath );
}
