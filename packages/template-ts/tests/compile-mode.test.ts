import { describe, expect, it } from 'vitest';
import { Engine } from '../src/index.js';

describe('compile mode', () => {
  it('uses the supplied generated renderer without loading an AST artifact', () => {
    const engine = new Engine({ compile: { mode: 'gen', generatedRenderer: () => ({ render: () => '<generated>' }) } });
    const prepared = engine.prepare('ignored', {});
    expect(prepared.render()).toBe('<generated>');
    expect(engine.render('ignored', {})).toBe('<generated>');
  });

  it('fails when generated mode has no generated renderer', () => {
    const engine = new Engine({ compile: { mode: 'gen' } });
    expect(() => engine.render('ignored', {})).toThrow('requires generatedRenderer');
  });
});
