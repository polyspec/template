// Package entry points export the public API.
import { describe, expect, it } from 'vitest';
import * as main from '../src/index.js';
import * as render from '../src/render.js';
import * as node from '../src/node/index.js';

describe('entry points', () => {
  it('export the documented API', () => {
    expect(typeof main.parse).toBe('function');
    expect(typeof main.Engine).toBe('function');
    expect(typeof main.MapLoader).toBe('function');
    expect(typeof main.TemplateError).toBe('function');
    expect(typeof render.Engine).toBe('function');
    expect(typeof node.FsLoader).toBe('function');
  });
});
