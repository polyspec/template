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
