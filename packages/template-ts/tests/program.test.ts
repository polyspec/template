import { describe, expect, it } from 'vitest';
import { Engine, type Program } from '../src/index.js';

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
});
