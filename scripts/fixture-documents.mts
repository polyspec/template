// The shared fixtures of tests/fixtures that the generated checks read, described once: the bound data expectations
// (VAL-22, tests/fixtures/bound-data/cases.json) and the host value expectations (VAL-21, EXP-39,
// tests/fixtures/native-object/host-values.json), and the expression vectors (CNF-12 to CNF-14,
// tests/fixtures/expr/cases.json).
import { jsonDocument } from './json-document.mts';

/** The bound data expectations: the maps to bind and the output of each template. */
export interface BoundDataCases {
  assign: Record<string, unknown>;
  second: Record<string, unknown>;
  mergedKeys: string[];
  definitionData: Record<string, unknown>;
  outputs: { page: string; merged: string; define: string; empty: string };
}

/** The host value expectations: the output of each passing template and the error code of each failing one. */
export interface HostValues {
  outputs: Record<string, string>;
  errors: Record<string, string>;
}

const strings = { type: 'object', additionalProperties: { type: 'string' } };

export const boundDataCasesDocument = jsonDocument<BoundDataCases>('bound data expectation', {
  type: 'object',
  required: ['assign', 'second', 'mergedKeys', 'definitionData', 'outputs'],
  properties: {
    assign: { type: 'object' },
    second: { type: 'object' },
    mergedKeys: { type: 'array', items: { type: 'string' } },
    definitionData: { type: 'object' },
    outputs: {
      type: 'object',
      required: ['page', 'merged', 'define', 'empty'],
      properties: { page: { type: 'string' }, merged: { type: 'string' }, define: { type: 'string' }, empty: { type: 'string' } },
    },
  },
});

export const hostValuesDocument = jsonDocument<HostValues>('host value expectation', {
  type: 'object',
  required: ['outputs', 'errors'],
  properties: { outputs: strings, errors: strings },
});

/** An expression vector: its name and expression, and either the code of its parse error or its AST. */
export interface ExpressionVector {
  name: string;
  expr: string;
  error?: string;
  ast?: unknown;
}

export const expressionVectorsDocument = jsonDocument<ExpressionVector[]>('expression vectors', {
  type: 'array',
  items: { type: 'object', required: ['name', 'expr'], properties: { name: { type: 'string' }, expr: { type: 'string' }, error: { type: 'string' }, ast: {} } },
});
