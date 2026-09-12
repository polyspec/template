// Render state: frames, loop metas, template definitions, limits and error creation (docs/spec/runtime.md).
import type { Template } from '../ast.js';
import { errorAt, errorWithoutPosition, type ErrorCode, type LineIndex, type Span, type TemplateError } from '../errors.js';
import type { Env, HostFunction } from '../functions/index.js';
import { Output } from '../output.js';
import type { MapValue, Value } from '../value/value.js';

// The resource limits of one render (RT-33). The engine options override single fields.
export interface Limits {
  iterations: number;
  depth: number;
  outputBytes: number;
  expressionDepth: number;
}

export const DEFAULT_LIMITS: Limits = {
  iterations: 1_000_000,
  depth: 32,
  outputBytes: 16 * 1024 * 1024,
  expressionDepth: 64,
};

// A parsed template together with the line index that error positions are computed from. The
// index is absent when the template was loaded as an AST.
export interface ParsedTemplate {
  ast: Template;
  // Line index of the source, or null when the template was loaded as an AST.
  lines: LineIndex | null;
}

export type DefineEntry = { template: string; data: MapValue | null } | { html: string };

export interface LoopMeta {
  index: number;
  key: Value;
  value: Value;
  first: boolean;
  last: boolean;
  size: number;
}

// One rendered template location and its context data.
export class Frame {
  /** Creates one source-position and data frame for AST or generated execution. */
  constructor(readonly name: string, readonly lines: LineIndex | null, readonly context: MapValue) {}
}

// Local variables and active loops shared by an include and isolated by a block.
export class Scope {
  readonly locals = new Map<string, Value>();
  readonly loops = new Map<string, LoopMeta[]>();

  /** Resolves a local before the current frame data. */
  lookup(frame: Frame, name: string): Value {
    if (this.locals.has(name)) return this.locals.get(name) as Value;
    if (frame.context.has(name)) return frame.context.get(name) as Value;
    return null;
  }

  /** Returns the innermost active loop metadata for a variable. */
  loopMeta(name: string): LoopMeta | null {
    const stack = this.loops.get(name);
    return stack && stack.length ? (stack[stack.length - 1] as LoopMeta) : null;
  }
}

export interface RuntimeServices {
  limits(): Limits;
  hostFunction(name: string): HostFunction | undefined;
}

/** Owns the mutable state and bounded output of one AST or generated render. */
export class RenderContext {
  readonly output: Output;
  readonly registry = new Map<string, DefineEntry>();
  readonly chain: string[] = [];
  iterations = 0;
  private currentSpan: Span = [0, 0];
  private currentFrame: Frame | null = null;

  /** Creates isolated render state using shared runtime services and bound root data. */
  constructor(
    readonly services: RuntimeServices,
    readonly rootData: MapValue,
    readonly env: Env,
    readonly entryName: string,
  ) {
    const limits = services.limits();
    this.output = new Output(limits.outputBytes, () => {
      throw this.fail('E_RUNTIME_LIMIT', this.currentFrame, this.currentSpan, `output exceeds ${limits.outputBytes} bytes`);
    });
  }

  // Records the node being rendered so that limit errors can point at it.
  at(frame: Frame, span: Span): void {
    this.currentFrame = frame;
    this.currentSpan = span;
  }

  /** Creates a template error at a frame span, or an entry error without a position. */
  fail(code: ErrorCode, frame: Frame | null, span: Span | null, message: string): TemplateError {
    if (frame === null || span === null) return errorWithoutPosition(code, frame ? frame.name : this.entryName, message);
    return errorAt(code, frame.name, frame.lines, span, message);
  }

  /** Enters a template while enforcing cycle and nesting-depth limits. */
  enter(name: string, frame: Frame | null, span: Span | null): void {
    if (this.chain.includes(name)) throw this.fail('E_LOAD_CYCLE', frame, span, `${name} is already being rendered`);
    const limits = this.services.limits();
    if (this.chain.length > limits.depth) {
      throw this.fail('E_RUNTIME_DEPTH', frame, span, `nesting depth exceeds ${limits.depth}`);
    }
    this.chain.push(name);
  }

  /** Leaves the current template after a direct include or block call. */
  leave(): void {
    this.chain.pop();
  }

}
