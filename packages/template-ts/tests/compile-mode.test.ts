import { describe, expect, it } from 'vitest';
import { Engine } from '../src/index.js';

describe('compile mode', () => {
  it('uses the supplied generated renderer without falling back to AST', () => {
    const engine = new Engine({ compileMode: 'gen', generatedRenderer: () => '<generated>' });
    expect(engine.render('ignored', {})).toBe('<generated>');
  });

  it('fails when generated mode has no generated renderer', () => {
    const engine = new Engine({ compileMode: 'gen' });
    expect(() => engine.render('ignored', {})).toThrow('requires generatedRenderer');
  });
});
