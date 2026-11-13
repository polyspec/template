// A consumer can name the AST, loader and runtime types in public signatures
// without importing an unexported implementation path.
import type {
  Formatter, FormatError, FormatOptions, FormatResult, PrefixAnalysis, ErrorCode, Span, LoadResult, Node, Expr, Spread, MapEntry, ParseOptions, Delimiters,
  RenderAstProgram, Output, Binary, BindErrorCode, Block, Call, ClassCall, DefineEntry, Echo,
  For, If, IfBlock, Include, Index, LineIndex, List, Literal, LoadedAst,
  LoadedSource, LoopMetaExpression, MapLiteral, Member, MemberCall,
  ParseFunction, RuntimeLimit, RuntimeLoopMeta, SetNode, SourceSpan,
  SyntaxTokenKind, TagRange, Ternary, Text, Unary, Var,
} from '@polyspec/template-legacy';
import { format, type Formatter as LanguageFormatter } from '@polyspec/template-language';

// FMT-16: the formatter of the language package has the contract of its own package, with the options of FMT-17 and
// FMT-18. The legacy package names the contract of the retired FMT-9, which a consumer can still name.
export const languageFormatter: LanguageFormatter = format;
export declare const formatter: Formatter;
export const formatterOptions: FormatOptions = { name: 'sdk.tpl', delimiters: '[]', range: { start: 0, end: 4 }, indent: null, templateBlocks: 'flat' };
export const formatterResult: FormatResult = formatter('text', formatterOptions);

export type SignatureTypes = [
  RenderAstProgram, Output, Binary, BindErrorCode, Block, Call, ClassCall, DefineEntry, Echo,
  For, If, IfBlock, Include, Index, LineIndex, List, Literal, LoadedAst,
  LoadedSource, LoopMetaExpression, MapLiteral, Member, MemberCall,
  ParseFunction, RuntimeLimit, RuntimeLoopMeta, SetNode, SourceSpan,
  SyntaxTokenKind, TagRange, Ternary, Text, Unary, Var,
];

import { Source } from '@polyspec/template-legacy';
export function sourceContext() {
  const source = Source.fromBytes('example.tpl', new Uint8Array([97, 10, 98]));
  const text = Source.fromText(source.name, source.text);
  const metadata: [Uint8Array, LineIndex, number] = [source.bytes, source.lines, source.length];
  const offset: number = source.byteAt(1);
  const span: SourceSpan = source.span(0, 1);
  const lines: LineIndex = Source.lineIndex(metadata[0]);
  const position = Source.position(lines, offset);
  return { metadata, span, position, error: text.error('E_PARSE_UNEXPECTED_TOKEN', 0, 1, 'example') };
}

export const formatterError: FormatError = { reason: 'invariant', code: null, line: 2, col: 3, message: 'message' };
export const formatterReasons: FormatError['reason'][] = ['parse', 'invariant', 'html'];
export const formatterSuccess: FormatResult = { ok: true, text: 'text', changed: false };
export const formatterFailure: FormatResult = { ok: false, error: formatterError };

type PublicKeys<T> = T extends unknown ? keyof T : never;
export const prefixAnalysisFields: Record<PublicKeys<PrefixAnalysis>, true> = { ast: true, error: true, tags: true, tokens: true };

export const locationCode: ErrorCode = 'E_PARSE_UNEXPECTED_TOKEN';
export const sourceByteSpan: SourceSpan = [1, 4];
export const astByteSpan: Span = [sourceByteSpan[0], sourceByteSpan[1]];
export const verifiedLineStarts: LineIndex = [0, 2, 5];

export const loadedSource: LoadedSource = { source: new Uint8Array([97]), version: 'source-v1' };
export function loadedAst(ast: LoadedAst['ast']): LoadResult {
  return { ast, version: 'ast-v1' } satisfies LoadedAst;
}

export type AstSumTypes = [Node, Expr, MapEntry | Spread];
export const literalValues: Literal['value'][] = [null, true, 12.5, 'é😀', false];

export const outputFields: Record<keyof Output, true> = { write: true, toString: true };

export const parseConfiguration: ParseOptions = { delimiters: '[]' };
export const delimiterPair: Delimiters = { open: '[', close: ']' };

import type { EngineOptions, RenderOptions, Env, FunctionContext, HostFunction, ArtifactRefresh } from '@polyspec/template-legacy';
import { MapLoader } from '@polyspec/template-legacy';
export const callbackEnvironment: Env = { timezone: '+09:00', now: 123 };
export const callbackContext: FunctionContext = { env: callbackEnvironment };
export const hostCallback: HostFunction = (_args, context) => context.env.now;
export const refreshPolicies: ArtifactRefresh[] = ['dev', 'true', 'false'];
export const engineConfiguration: EngineOptions = {
  loader: new MapLoader(), functions: { custom: hostCallback }, classFunctions: { 'Box::value': hostCallback },
  limits: { outputBytes: 128 }, delimiters: '[]', artifactRefresh: 'false',
  parse: (_source, name) => ({ ast: { type: 'Template', name, body: [], comments: [] }, lines: null }),
};
export const renderConfiguration: RenderOptions = { env: callbackEnvironment, define: { layout: { html: 'ready' } } };

import { NativeObject, SafeString, type Value, type ListValue, type MapValue } from '@polyspec/template-legacy';
export const safeText = new SafeString('<i>');
export const safePayload: string = safeText.text;
export const nativeValues: ListValue = [null, true, 12.5, 'é😀', safeText, [], new Map(), new NativeObject({ field: 'value' })];
export const orderedValues: MapValue = new Map<string, Value>([['first', nativeValues], ['second', false]]);
export const collectionValue: Value = orderedValues;

import * as nodeSDK from "@polyspec/template-legacy/node";
export const completeNodeSDK: typeof import("@polyspec/template-legacy") = nodeSDK;
