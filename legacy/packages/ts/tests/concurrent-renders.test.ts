// RT-70: renders of one program may run at the same time and share only the templates that the program loaded. Eight
// concurrent renders of one program, each with its own data, produce the output of its own data and no other.
import { describe, expect, it } from 'vitest';
import { AstProgram, MapLoader } from '../src/index.js';

describe('concurrent renders of one program (RT-70)', () => {
  it('renders one program concurrently with the output of each render own data', async () => {
    const program = new AstProgram({ loader: new MapLoader({ 'a.tpl': '<p>{= x}</p>' }) });
    const values = Array.from({ length: 8 }, (_, index) => `v${index}`);
    const outputs = await Promise.all(
      values.map(x => Promise.resolve().then(() => program.render('a.tpl', { x }))),
    );
    expect(outputs).toEqual(values.map(x => `<p>${x}</p>`));
  });
});
