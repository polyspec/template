// RT-1, RT-5, RT-6, RT-74, RT-22, RT-35, ERR-2: public render state is usable without constructing a program.
import { describe, expect, it } from 'vitest';
import * as sdk from '@polyspec/template';
import { RenderContext, RuntimeEnvironment, Frame, TemplateError } from '@polyspec/template';
import { AstProgram as RenderProgram } from '@polyspec/template/render';

describe('context SDK', () => {
  // VAL-1, VAL-4, VAL-6: native carriers preserve key order and shallow-copy isolation.
  it('preserves ordered value carriers and safe-text payloads', () => {
    const safe = new sdk.SafeString('<i>');
    const values: sdk.MapValue = new Map<string, sdk.Value>([['first', safe], ['second', false]]);
    values.set('first', safe);
    const copy = new Map(values);
    copy.set('third', null);
    const keys = [...values.keys()];
    keys[0] = 'changed';
    expect([...values.keys()]).toEqual(['first', 'second']);
    expect(values.size).toBe(2);
    expect(values.has('first')).toBe(true);
    expect(values.get('missing')).toBeUndefined();
    expect(copy.get('first')).toBe(safe);
    expect(safe.text).toBe('<i>');
    expect(copy.delete('second')).toBe(true);
    expect([...copy.values()]).toEqual([safe, null]);
    expect([...copy.entries()]).toEqual([['first', safe], ['third', null]]);
  });

  it('publishes the concrete AST program through Program and runtime services (RT-1, RT-74)', () => {
    const loader = new sdk.MapLoader({ 'a.tpl': '{= hello()}|{= Box::value()}' });
    const program = new sdk.AstProgram({ loader });
    const hello: sdk.HostFunction = () => 'host';
    const value: sdk.HostFunction = () => 'box';
    program.register('hello', hello);
    program.registerClass('Box', 'value', value);
    const services: sdk.RuntimeServices = program;
    expect(services.hostFunction('hello')).toBe(hello);
    expect(services.classFunction('Box', 'value')).toBe(value);
    expect(services.limits()).toEqual(program.runtime.limits());
    expect(program.loader).toBe(loader);
    expect(program.artifactRefresh).toBe('true');
    expect(program.delimiters).toEqual({ open: '{', close: '}' });
    const protocol: sdk.Program = program;
    expect(protocol.prepare('a.tpl', {}).render()).toBe('host|box');
    expect(protocol.render('a.tpl', {})).toBe('host|box');
    const renderOnly: sdk.RenderAstProgram = new RenderProgram({
      loader: new sdk.MapLoader({ 'a.tpl': sdk.parse('ready', 'a.tpl') }),
    });
    expect(renderOnly.render('a.tpl', {})).toBe('ready');
  });

  it('owns isolated state, positioned failures and bounded output', () => {
    expect('Output' in sdk).toBe(false);
    const services = new RuntimeEnvironment({ outputBytes: 2 });
    const root = new Map([['root', 'value']]);
    const env = { timezone: 'Z', now: 123 };
    const context = new RenderContext(services, root, env, 'entry.tpl');
    const other = new RenderContext(services, root, env, 'other.tpl');
    expect(context.services).toBe(services);
    expect(context.rootData).toBe(root);
    expect(context.env).toBe(env);
    expect(context.entryName).toBe('entry.tpl');
    expect(context.iterations).toBe(0);
    context.iterations++;
    context.registry.set('layout', { html: 'ready' });
    expect(context.registry.get('layout')).toEqual({ html: 'ready' });
    expect(other.registry.size).toBe(0);
    expect(other.iterations).toBe(0);
    const frame = new Frame('part.tpl', [0, 2], root);
    expect(context.fail('E_RUNTIME_TYPE', null, null, 'unpositioned').toObject()).toMatchObject({ template: 'entry.tpl', line: 0, col: 0, offset: 0, end: 0 });
    expect(context.fail('E_RUNTIME_TYPE', frame, [2, 3], 'positioned').toObject()).toMatchObject({ template: 'part.tpl', line: 2, col: 1, offset: 2, end: 3 });
    context.enter('entry.tpl', null, null);
    expect(context.chain).toEqual(['entry.tpl']);
    try { context.enter('entry.tpl', frame, [2, 3]); throw new Error('cycle was not rejected'); }
    catch (error) {
      if (!(error instanceof TemplateError)) throw error;
      expect(error.toObject()).toMatchObject({ code: 'E_LOAD_CYCLE', template: 'part.tpl', line: 2, col: 1, offset: 2, end: 3 });
    }
    expect(context.chain).toEqual(['entry.tpl']);
    context.leave();
    expect(context.chain).toEqual([]);
    context.at(frame, [2, 3]);
    context.output.write('é');
    expect(context.output.toString()).toBe('é');
    expect(other.output.toString()).toBe('');
    try { context.output.write('x'); throw new Error('limit was not enforced'); }
    catch (error) {
      expect(error).toBeInstanceOf(TemplateError);
      if (!(error instanceof TemplateError)) throw error;
      expect(error.toObject()).toMatchObject({ code: 'E_RUNTIME_LIMIT', template: 'part.tpl', line: 2, col: 1, offset: 2, end: 3 });
    }
  });
});
