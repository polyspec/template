// RT-55: the TypeScript library exposes no generated-program class and no source-compiler operation. The generated
// programs of the TypeScript backend are emitted by the build compiler, so the package keeps none of these names.
import * as api from '../src/index.js';
import { describe, expect, it } from 'vitest';

describe('level absence', () => {
  it('the library exports no generated-program class or source-compiler operation', () => {
    const exported = Object.keys(api);
    for (const name of ['GeneratedProgram', 'encodeArtifact', 'emitArtifact']) {
      expect(exported).not.toContain(name);
    }
  });
});
