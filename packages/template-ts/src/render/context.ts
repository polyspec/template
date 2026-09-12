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

// One rendered template file: local scope, context data and active loops (RT-11 to RT-14).
export class Frame {
  readonly locals = new Map<string, Value>();
  readonly loops = new Map<string, LoopMeta[]>();

  constructor(readonly template: ParsedTemplate, readonly context: MapValue) {}

  get name(): string {
    return this.template.ast.name;
  }

  lookup(name: string): Value {
    if (this.locals.has(name)) return this.locals.get(name) as Value;
    if (this.context.has(name)) return this.context.get(name) as Value;
    return null;
  }

  loopMeta(name: string): LoopMeta | null {
    const stack = this.loops.get(name);
    return stack && stack.length ? (stack[stack.length - 1] as LoopMeta) : null;
  }
}

export interface RuntimeServices {
  limits(): Limits;
  hostFunction(name: string): HostFunction | undefined;
}

export class RenderContext {
  readonly output: Output;
  readonly registry = new Map<string, DefineEntry>();
  readonly chain: string[] = [];
  iterations = 0;
  private currentSpan: Span = [0, 0];
  private currentFrame: Frame | null = null;

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

  fail(code: ErrorCode, frame: Frame | null, span: Span | null, message: string): TemplateError {
    if (frame === null || span === null) return errorWithoutPosition(code, frame ? frame.name : this.entryName, message);
    return errorAt(code, frame.name, frame.template.lines, span, message);
  }

  enter(name: string, frame: Frame | null, span: Span | null): void {
    if (this.chain.includes(name)) throw this.fail('E_LOAD_CYCLE', frame, span, `${name} is already being rendered`);
    const limits = this.services.limits();
    if (this.chain.length > limits.depth) {
      throw this.fail('E_RUNTIME_DEPTH', frame, span, `nesting depth exceeds ${limits.depth}`);
    }
    this.chain.push(name);
  }

  leave(): void {
    this.chain.pop();
  }

}
