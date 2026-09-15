import { describe, expect, it } from 'vitest';
import { AstProgram, Engine, MapLoader, type Program } from '../src/index.js';

describe('program', () => {
  it('delegates prepare and render to one complete program', () => {
    let prepared = 0;
    let rendered = 0;
    const program: Program = {
      prepare: () => ({ render: () => { prepared++; return '<generated>'; } }),
      render: () => { rendered++; return '<generated>'; },
    };
    const engine = new Engine(program);
    expect(engine.prepare('page.tpl', {}).render()).toBe('<generated>');
    expect(engine.render('page.tpl', {})).toBe('<generated>');
    expect({ prepared, rendered }).toEqual({ prepared: 1, rendered: 1 });
  });

  it('binds the original instance and calls its public method', () => {
    class Order {
      readonly total = 12;
      status_label(prefix: string): string { return `${prefix}:${this.total}`; }
    }
    const engine = new AstProgram({
      loader: new MapLoader(new Map([['page.tpl', '{= order.total}|{= order.status_label("ready")}']])),
    });
    const order = new Order();
    expect(engine.render('page.tpl', { order })).toBe('12|ready:12');
  });

  it('calls a registered logical class function', () => {
    const engine = new AstProgram({
      loader: new MapLoader(new Map([['page.tpl', '{= Order::status_label("ready")}']])),
      classFunctions: { 'Order::status_label': ([value]) => `${value}:ok` },
    });
    expect(engine.render('page.tpl', {})).toBe('ready:ok');
  });
});
