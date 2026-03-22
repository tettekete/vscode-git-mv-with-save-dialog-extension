import * as vscode from 'vscode';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelPriority: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

const PRODUCTION_DEFAULT_LEVEL: LogLevel = 'warn';

class LoggerCore
{
	private channel?: vscode.OutputChannel;
	private name: string = 'Extension';
	private level: LogLevel = 'info';

	// --- 初期化（activateから1回呼ぶ） ---
	// vscode.ExtensionContext は activate() のタイミングでしか
	// 取得できないので、activate() からコールする必要があります。
	init(context: vscode.ExtensionContext)
	{
		this.level = this.detectDefaultLevel(context);
	}

	// --- 名前設定 ---
	setName(name: string)
	{
		this.name = name;

		// channel作り直し（名前反映）
		this.channel?.dispose();
		this.channel = vscode.window.createOutputChannel(name);
	}

	setLevel(level: LogLevel)
	{
		this.level = level;
	}

	// --- 内部 ---
	private detectDefaultLevel(context: vscode.ExtensionContext): LogLevel
	{
		switch(context.extensionMode)
		{
			case vscode.ExtensionMode.Development:
			case vscode.ExtensionMode.Test:
				return 'debug';

			case vscode.ExtensionMode.Production:
			default:
				return PRODUCTION_DEFAULT_LEVEL;
		}
	}

	private shouldLog(level: LogLevel): boolean
	{
		return levelPriority[level] >= levelPriority[this.level];
	}

	private ensureChannel()
	{
		if( !this.channel )
		{
			this.channel = vscode.window.createOutputChannel(this.name);
		}
	}

	private format(level: LogLevel, message: string): string
	{
		return `[${level.toUpperCase()}] ${this.name}: ${message}`;
	}

	private write(level: LogLevel, message: string)
	{
		if( !this.shouldLog(level) ) {return;};

		this.ensureChannel();

		const line = this.format(level, message);

		// OUTPUT
		this.channel!.appendLine(line);

		// console
		switch(level)
		{
			case 'debug':
			case 'info':
				console.log(line);
				break;

			case 'warn':
				console.warn(line);
				break;

			case 'error':
				console.error(line);
				break;
		}
	}

	// --- public API ---
	debug(msg: string)
	{
		this.write('debug', msg);
	}

	info(msg: string)
	{
		this.write('info', msg);
	}

	warn(msg: string)
	{
		this.write('warn', msg);
	}

	error(err: unknown)
	{
		if( err instanceof Error )
		{
			this.write('error', err.message);
			if( err.stack )
			{
				this.ensureChannel();
				this.channel!.appendLine(err.stack);
			}
		}
		else
		{
			this.write('error', String(err));
		}
	}

	show()
	{
		this.channel?.show();
	}
}

// --- シングルトン ---
const core = new LoggerCore();

// --- export ---
/**
 * VSCodeのOutputにログを出力するロガー。
 * 
 * - activate() から1回 init() を呼ぶ必要があります。
 * - ログレベルは、開発モードでは "debug"、本番モードでは "warn" がデフォルトです。
 * - setLevel() でログレベルを変更できます。
 * - setName() でチャンネル名を変更できます（デフォルトは "Extension"）。
 * - show() でOutputパネルを表示できます。
 * 
 * @example
 * import logger from './Logger4VSCode';
 * 
 * export function activate(context: vscode.ExtensionContext)
 * {
 * 	logger.init(context);          // ← ログレベルの自動設定のために必須
 * 	logger.setName('My Extension');
 * 
 * 	logger.debug('activated');
 * 	logger.info('ready');
 * }
 */

export default {
	init: (context: vscode.ExtensionContext) => core.init(context),
	setName: (name: string) => core.setName(name),
	setLevel: (level: LogLevel) => core.setLevel(level),

	debug: (msg: string) => core.debug(msg),
	info: (msg: string) => core.info(msg),
	warn: (msg: string) => core.warn(msg),
	error: (err: unknown) => core.error(err),

	show: () => core.show(),
};
