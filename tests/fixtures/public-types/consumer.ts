// A consumer can name the AST, loader and runtime types in public signatures
// without importing an unexported implementation path.
import type {
  Formatter, FormatOptions, FormatResult,
  RenderAstProgram, Output, Binary, BindErrorCode, Block, Call, ClassCall, DefineEntry, Echo,
  For, If, IfBlock, Include, Index, LineIndex, List, Literal, LoadedAst,
  LoadedSource, LoopMetaExpression, MapLiteral, Member, MemberCall,
  ParseFunction, RuntimeLimit, RuntimeLoopMeta, SetNode, SourceSpan,
  SyntaxTokenKind, TagRange, Ternary, Text, Unary, Var,
} from '@polyspec/template';
import { format } from '@polyspec/template-language';

// The language service's published callable implements the shared SDK contract.
export const formatter: Formatter = format;
export const formatterOptions: FormatOptions = { indent: null };
export const formatterResult: FormatResult = formatter('text', formatterOptions);

export type SignatureTypes = [
  RenderAstProgram, Output, Binary, BindErrorCode, Block, Call, ClassCall, DefineEntry, Echo,
  For, If, IfBlock, Include, Index, LineIndex, List, Literal, LoadedAst,
  LoadedSource, LoopMetaExpression, MapLiteral, Member, MemberCall,
  ParseFunction, RuntimeLimit, RuntimeLoopMeta, SetNode, SourceSpan,
  SyntaxTokenKind, TagRange, Ternary, Text, Unary, Var,
];

import { Source } from '@polyspec/template';
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
