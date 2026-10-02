// Command entry of template-lsp: serves the Language Server Protocol over standard input and output (EDT-14).
import { createConnection } from 'vscode-languageserver/node';
import { startServer } from './server.js';

startServer(createConnection(process.stdin, process.stdout));
