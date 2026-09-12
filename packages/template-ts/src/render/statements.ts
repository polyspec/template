// Statement rendering: text, echo, if, loop, assignment, include, block (RT-11 to RT-32).
import type { Block, For, If, IfBlock, Node, Span } from '../ast.js';
import { PathError, resolvePath } from '../loader.js';
import { type MapValue, type Value } from '../value/value.js';
import { Frame, Scope, type DefineEntry, type LoopMeta, type RenderContext } from './context.js';
import { Evaluator } from './expressions.js';
import type { AstProgramCore } from './engine.js';

export class Renderer {
  private readonly evaluator: Evaluator;

  constructor(private readonly context: RenderContext, private readonly program: AstProgramCore) {
    this.evaluator = new Evaluator(context);
  }

  renderNodes(nodes: Node[], frame: Frame, scope: Scope): void {
    for (const node of nodes) this.renderNode(node, frame, scope);
  }

  private renderNode(node: Node, frame: Frame, scope: Scope): void {
    this.context.at(frame, node.span);
    switch (node.type) {
      case 'Text':
        this.context.output.write(node.value);
        return;
      case 'Echo': {
        const value = this.evaluator.evaluate(node.expr, frame, scope);
        this.context.output.write(this.evaluator.runtime.escape(value, frame, node.expr.span));
        return;
      }
      case 'If':
        this.renderIf(node, frame, scope);
        return;
      case 'For':
        this.renderFor(node, frame, scope);
        return;
      case 'Set':
        scope.locals.set(node.name, this.evaluator.evaluate(node.expr, frame, scope));
        return;
      case 'Include':
        this.renderInclude(node.path, node.span, frame, scope);
        return;
      case 'Block':
        this.renderBlock(node, frame, scope);
        return;
      case 'IfBlock':
        this.renderIfBlock(node, frame, scope);
        return;
    }
  }

  private renderIf(node: If, frame: Frame, scope: Scope): void {
    for (const branch of node.branches) {
      if (this.evaluator.runtime.truthy(this.evaluator.evaluate(branch.test, frame, scope))) {
        this.renderNodes(branch.body, frame, scope);
        return;
      }
    }
    if (node.else) this.renderNodes(node.else, frame, scope);
  }

  private renderFor(node: For, frame: Frame, scope: Scope): void {
    const iterable = this.evaluator.evaluate(node.iter, frame, scope);
    const entries = this.evaluator.runtime.entries(iterable, frame, node.span);

    if (entries.length === 0) {
      if (node.empty) this.renderNodes(node.empty, frame, scope);
      return;
    }
    const hadLocal = scope.locals.has(node.name);
    const previous = scope.locals.get(node.name);
    let stack = scope.loops.get(node.name);
    if (!stack) {
      stack = [];
      scope.loops.set(node.name, stack);
    }
    const meta: LoopMeta = { index: 0, key: null, value: null, first: true, last: false, size: entries.length };
    stack.push(meta);
    try {
      for (let index = 0; index < entries.length; index++) {
        const [key, value] = entries[index] as [Value, Value];
        this.context.iterations++;
        this.evaluator.runtime.limit('iteration', this.context.iterations, frame, node.span);
        meta.index = index;
        meta.key = key;
        meta.value = value;
        meta.first = index === 0;
        meta.last = index === entries.length - 1;
        scope.locals.set(node.name, value);
        this.renderNodes(node.body, frame, scope);
      }
    } finally {
      stack.pop();
      if (hadLocal) scope.locals.set(node.name, previous as Value);
      else scope.locals.delete(node.name);
    }
  }

  private resolve(path: string, frame: Frame, span: Span): string {
    try {
      return resolvePath(frame.name, path);
    } catch (error) {
      if (error instanceof PathError) throw this.context.fail('E_LOAD_OUTSIDE_ROOT', frame, span, error.message);
      throw error;
    }
  }

  private renderInclude(path: string, span: Span, frame: Frame, scope: Scope): void {
    const name = this.resolve(path, frame, span);
    const template = this.program.loadTemplate(name, frame, span);
    this.context.enter(name, frame, span);
    try {
      const included = new Frame(template.ast.name, template.lines, frame.context);
      this.renderNodes(template.ast.body, included, scope);
    } finally {
      this.context.leave();
    }
  }

  private renderBlock(node: Block, frame: Frame, scope: Scope): void {
    const registry = this.context.registry;
    let entry: DefineEntry;
    if (node.id !== null && node.path === null) {
      const registered = registry.get(node.id);
      if (!registered) throw this.context.fail('E_RUNTIME_BLOCK_UNDEFINED', frame, node.span, `define ${node.id} is not registered`);
      entry = registered;
    } else {
      const name = this.resolve(node.path as string, frame, node.span);
      if (node.id !== null) {
        const registered = registry.get(node.id);
        if (registered) {
          if ('html' in registered || registered.template !== name) {
            throw this.context.fail('E_RUNTIME_BLOCK_REDEFINED', frame, node.span, `define ${node.id} is registered with a different template`);
          }
          entry = registered;
        } else {
          entry = { template: name, data: null };
          registry.set(node.id, entry);
        }
      } else {
        entry = { template: name, data: null };
      }
    }
    if ('html' in entry) {
      this.context.output.write(entry.html);
      return;
    }
    const data: MapValue = new Map(this.context.rootData);
    if (entry.data) for (const [key, value] of entry.data) data.set(key, value);
    for (const item of node.scope) data.set(item.name, this.evaluator.evaluate(item.expr, frame, scope));
    const template = this.program.loadTemplate(entry.template, frame, node.span);
    this.context.enter(entry.template, frame, node.span);
    try {
      this.renderNodes(template.ast.body, new Frame(template.ast.name, template.lines, data), new Scope());
    } finally {
      this.context.leave();
    }
  }

  private renderIfBlock(node: IfBlock, frame: Frame, scope: Scope): void {
    if (this.context.registry.has(node.id)) this.renderNodes(node.body, frame, scope);
    else if (node.else) this.renderNodes(node.else, frame, scope);
  }
}
