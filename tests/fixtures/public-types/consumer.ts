// A consumer can name the AST, loader and runtime types in public signatures
// without importing an unexported implementation path.
import type {
  RenderAstProgram, Output, Binary, BindErrorCode, Block, Call, ClassCall, DefineEntry, Echo,
  For, If, IfBlock, Include, Index, LineIndex, List, Literal, LoadedAst,
  LoadedSource, LoopMetaExpression, MapLiteral, Member, MemberCall,
  ParseFunction, RuntimeLimit, RuntimeLoopMeta, SetNode, SourceSpan,
  SyntaxTokenKind, TagRange, Ternary, Text, Unary, Var,
} from '@polyspec/template';

export type SignatureTypes = [
  RenderAstProgram, Output, Binary, BindErrorCode, Block, Call, ClassCall, DefineEntry, Echo,
  For, If, IfBlock, Include, Index, LineIndex, List, Literal, LoadedAst,
  LoadedSource, LoopMetaExpression, MapLiteral, Member, MemberCall,
  ParseFunction, RuntimeLimit, RuntimeLoopMeta, SetNode, SourceSpan,
  SyntaxTokenKind, TagRange, Ternary, Text, Unary, Var,
];
