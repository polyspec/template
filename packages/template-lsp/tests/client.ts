// Protocol client of the tests: starts the built command template-lsp as a child process and speaks JSON-RPC over its
// standard input and output.
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, type MessageConnection } from 'vscode-jsonrpc/node';
import type { ConfigurationParams, InitializeResult, PublishDiagnosticsParams } from 'vscode-languageserver';

const command = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'template-lsp.mjs');

/** Client capabilities that the tests vary. */
export interface ClientOptions {
  /** `workspace.configuration`. */
  configuration: boolean;
  /** `textDocument.semanticTokens.multilineTokenSupport`. */
  multiline: boolean;
}

/** A started server and the messages it sent to the client. */
export class Client {
  /** The settings section `polyspec-template` that the client returns to `workspace/configuration`. */
  settings: { format: { templateBlocks: string } } = { format: { templateBlocks: 'indent' } };
  /** Every `workspace/configuration` request of the server. */
  readonly configurationRequests: ConfigurationParams[] = [];
  /** Every `window/logMessage` message of the server. */
  readonly messages: string[] = [];
  private readonly diagnostics: PublishDiagnosticsParams[] = [];
  private readonly waiting: Array<() => void> = [];

  /** The result of `initialize`. */
  initialized: InitializeResult | null = null;

  private constructor(
    private readonly child: ChildProcess,
    readonly connection: MessageConnection,
  ) {
    connection.onRequest('workspace/configuration', (params: ConfigurationParams) => {
      this.configurationRequests.push(params);
      return params.items.map(() => this.settings);
    });
    connection.onNotification('window/logMessage', (params: { message: string }) => {
      this.messages.push(params.message);
    });
    connection.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
      this.diagnostics.push(params);
      this.waiting.splice(0).forEach(resolve => resolve());
    });
    connection.listen();
  }

  /** Starts the server, sends `initialize` and `initialized` and returns the client. */
  static async start(options: ClientOptions): Promise<Client> {
    const child = spawn(process.execPath, [command, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
    const client = new Client(child, createMessageConnection(new StreamMessageReader(child.stdout as NodeJS.ReadableStream), new StreamMessageWriter(child.stdin as NodeJS.WritableStream)));
    client.initialized = await client.request<InitializeResult>('initialize', {
      processId: process.pid,
      rootUri: null,
      capabilities: {
        general: { positionEncodings: ['utf-16'] },
        workspace: { configuration: options.configuration },
        textDocument: { semanticTokens: { multilineTokenSupport: options.multiline, requests: { full: true }, tokenTypes: [], tokenModifiers: [], formats: ['relative'] } },
      },
    });
    await client.connection.sendNotification('initialized', {});
    return client;
  }

  /** Sends `textDocument/didOpen`. */
  async open(uri: string, text: string, version = 1): Promise<void> {
    await this.connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'polyspec-template', version, text } });
  }

  /** Sends `textDocument/didChange` with the full text. */
  async change(uri: string, text: string, version: number): Promise<void> {
    await this.connection.sendNotification('textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text }] });
  }

  /** Sends `textDocument/didClose`. */
  async close(uri: string): Promise<void> {
    await this.connection.sendNotification('textDocument/didClose', { textDocument: { uri } });
  }

  /** Sends a request and returns its result. */
  request<R>(method: string, params: unknown): Promise<R> {
    return this.connection.sendRequest(method, params) as Promise<R>;
  }

  /** Waits for the published diagnostics of a document that satisfy `accept`. */
  async diagnosticsOf(uri: string, accept: (params: PublishDiagnosticsParams) => boolean): Promise<PublishDiagnosticsParams> {
    for (;;) {
      const found = this.diagnostics.find(params => params.uri === uri && accept(params));
      if (found !== undefined) return found;
      await new Promise<void>(resolve => this.waiting.push(resolve));
    }
  }

  /** Sends `shutdown` and `exit` and waits until the process ends; returns its exit code. */
  async stop(): Promise<number | null> {
    const exited = new Promise<number | null>(resolve => this.child.once('exit', code => resolve(code)));
    await this.connection.sendRequest('shutdown');
    await this.connection.sendNotification('exit');
    const code = await exited;
    this.connection.dispose();
    return code;
  }
}
