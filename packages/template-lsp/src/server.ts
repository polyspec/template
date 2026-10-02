// Server: declares the capabilities of EDT-14 and answers every request from the analysis of the document version.
import { TOKEN_TYPES } from '@polyspec/template-language';
import { TextDocuments, TextDocumentSyncKind, type Connection, type InitializeResult } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Analyses } from './documents.js';
import { formatEdits, templateBlocksOf, typingEdits, type TemplateBlocks } from './formatting.js';
import {
  MATCHING_TAG_METHOD,
  SETTINGS_SECTION,
  TAG_RANGES_METHOD,
  type MatchingTagParams,
  type MatchingTagResult,
  type TagRangesParams,
  type TagRangesResult,
} from './index.js';
import { diagnosticsOf, foldingRangesOf, highlightsOf, matchingTagOf, semanticTokensOf, tagRangesOf } from './results.js';

/** The characters that request typing indentation. */
const TYPING_TRIGGERS = ['\n', '>', '}'] as const;

/** Registers every handler on the connection and starts listening. */
export function startServer(connection: Connection): void {
  const texts = new TextDocuments(TextDocument);
  const analyses = new Analyses();
  let configuration = false;
  let multiline = false;

  // Reads polyspec-template.format.templateBlocks of the document; a client without workspace/configuration gets the default.
  const templateBlocks = async (uri: string): Promise<TemplateBlocks> => {
    if (!configuration) return 'indent';
    return templateBlocksOf(await connection.workspace.getConfiguration({ scopeUri: uri, section: SETTINGS_SECTION }));
  };

  connection.onInitialize((params): InitializeResult => {
    configuration = params.capabilities.workspace?.configuration === true;
    multiline = params.capabilities.textDocument?.semanticTokens?.multilineTokenSupport === true;
    return {
      capabilities: {
        positionEncoding: 'utf-16',
        textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Full },
        semanticTokensProvider: { legend: { tokenTypes: [...TOKEN_TYPES], tokenModifiers: [] }, full: true },
        foldingRangeProvider: true,
        documentHighlightProvider: true,
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true,
        documentOnTypeFormattingProvider: { firstTriggerCharacter: TYPING_TRIGGERS[0], moreTriggerCharacter: TYPING_TRIGGERS.slice(1) },
      },
      serverInfo: { name: 'template-lsp' },
    };
  });

  texts.onDidChangeContent(({ document: text }) => {
    void connection.sendDiagnostics({ uri: text.uri, version: text.version, diagnostics: diagnosticsOf(text, analyses.of(text)) });
  });
  texts.onDidClose(({ document: text }) => {
    analyses.delete(text.uri);
    void connection.sendDiagnostics({ uri: text.uri, diagnostics: [] });
  });

  connection.languages.semanticTokens.on(({ textDocument }) => {
    const text = texts.get(textDocument.uri);
    return { data: text === undefined ? [] : semanticTokensOf(text, analyses.of(text), multiline) };
  });
  connection.onFoldingRanges(({ textDocument }) => {
    const text = texts.get(textDocument.uri);
    return text === undefined ? null : foldingRangesOf(text, analyses.of(text));
  });
  connection.onDocumentHighlight(({ textDocument, position }) => {
    const text = texts.get(textDocument.uri);
    return text === undefined ? null : highlightsOf(text, analyses.of(text), position);
  });
  connection.onDocumentFormatting(async ({ textDocument, options }) => {
    const text = texts.get(textDocument.uri);
    if (text === undefined) return null;
    const blocks = await templateBlocks(text.uri);
    return formatEdits(text, analyses.of(text), options, blocks, null, message => connection.console.warn(message));
  });
  connection.onDocumentRangeFormatting(async ({ textDocument, range, options }) => {
    const text = texts.get(textDocument.uri);
    if (text === undefined) return null;
    const blocks = await templateBlocks(text.uri);
    return formatEdits(text, analyses.of(text), options, blocks, range, message => connection.console.warn(message));
  });
  connection.onDocumentOnTypeFormatting(async ({ textDocument, position, options }) => {
    const text = texts.get(textDocument.uri);
    if (text === undefined) return null;
    const blocks = await templateBlocks(text.uri);
    return typingEdits(text, analyses.of(text), position, options, blocks);
  });
  connection.onRequest(TAG_RANGES_METHOD, ({ textDocument }: TagRangesParams): TagRangesResult => {
    const text = texts.get(textDocument.uri);
    return text === undefined ? null : tagRangesOf(text, analyses.of(text));
  });
  connection.onRequest(MATCHING_TAG_METHOD, ({ textDocument, position }: MatchingTagParams): MatchingTagResult => {
    const text = texts.get(textDocument.uri);
    return text === undefined ? null : matchingTagOf(text, analyses.of(text), position);
  });

  texts.listen(connection);
  connection.listen();
}
