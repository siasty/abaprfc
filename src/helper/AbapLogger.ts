import * as vscode from 'vscode';

/**
 * Centralized output channel logger for the AbapRfc extension.
 * All modules should use this instead of console.log/console.error.
 */
class AbapLogger {
    private readonly channel: vscode.OutputChannel;

    constructor() {
        this.channel = vscode.window.createOutputChannel('AbapRfc');
    }

    info(ctx: string, message: string): void {
        this.write('INFO ', ctx, message);
    }

    warn(ctx: string, message: string): void {
        this.write('WARN ', ctx, message);
    }

    error(ctx: string, err: unknown): void {
        const msg = err instanceof Error
            ? (err.stack ?? err.message)
            : String(err);
        this.write('ERROR', ctx, msg);
        console.error(`[AbapRfc][${ctx}]`, err);
    }

    /** Show the output channel panel (non-stealing focus). */
    show(): void {
        this.channel.show(true);
    }

    dispose(): void {
        this.channel.dispose();
    }

    private write(level: string, ctx: string, message: string): void {
        const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
        this.channel.appendLine(`[${ts}] ${level} [${ctx}] ${message}`);
    }
}

export const abapLogger = new AbapLogger();
