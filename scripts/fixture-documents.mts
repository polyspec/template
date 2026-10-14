// The shared fixtures of tests/fixtures that the generated checks read, described once: the bound data expectations
// (VAL-22, tests/fixtures/bound-data/cases.json) and the host value expectations (VAL-21, EXP-39,
// tests/fixtures/native-object/host-values.json), and the expression vectors (CNF-12 to CNF-14,
// tests/fixtures/expr/cases.json).
import { jsonDocument } from './json-document.mts';

/** The position of an error: its template, line and column. */
export interface ErrorPosition {
  template: string;
  line: number;
  col: number;
}

/**
 * The bound data expectations: the maps to bind, the output of each template and the position of each rejected
 * bound map. `assign` holds the list `list` and the map `m` that a test changes after binding.
 */
export interface BoundDataCases {
  assign: { list: unknown[]; m: Record<string, unknown>; [key: string]: unknown };
  second: Record<string, unknown>;
  mergedKeys: string[];
  definitionData: Record<string, unknown>;
  outputs: { page: string; merged: string; define: string; empty: string };
  rejections: Record<string, ErrorPosition>;
}

/** The host value expectations: the output of each passing template and the error code of each failing one. */
export interface HostValues {
  outputs: Record<string, string>;
  errors: Record<string, string>;
}

const strings = { type: 'object', additionalProperties: { type: 'string' } };

export const boundDataCasesDocument = jsonDocument<BoundDataCases>('bound data expectation', {
  type: 'object',
  required: ['assign', 'second', 'mergedKeys', 'definitionData', 'outputs', 'rejections'],
  properties: {
    assign: { type: 'object', required: ['list', 'm'], properties: { list: { type: 'array' }, m: { type: 'object' } } },
    second: { type: 'object' },
    mergedKeys: { type: 'array', items: { type: 'string' } },
    definitionData: { type: 'object' },
    outputs: {
      type: 'object',
      required: ['page', 'merged', 'define', 'empty'],
      properties: { page: { type: 'string' }, merged: { type: 'string' }, define: { type: 'string' }, empty: { type: 'string' } },
    },
    rejections: {
      type: 'object',
      additionalProperties: {
        type: 'object', required: ['template', 'line', 'col'], properties: { template: { type: 'string' }, line: { type: 'integer' }, col: { type: 'integer' } },
      },
    },
  },
});

export const hostValuesDocument = jsonDocument<HostValues>('host value expectation', {
  type: 'object',
  required: ['outputs', 'errors'],
  properties: { outputs: strings, errors: strings },
});

/**
 * An expression vector: its name and expression, and either the code of its parse error or its tokens, its AST and
 * the value of each evaluation with its data.
 */
export interface ExpressionVector {
  name: string;
  expr: string;
  error?: string;
  tokens?: { type: string; value: string }[];
  ast?: unknown;
  cases?: { data: unknown; value: unknown }[];
}

export const expressionVectorsDocument = jsonDocument<ExpressionVector[]>('expression vectors', {
  type: 'array',
  items: {
    type: 'object',
    required: ['name', 'expr'],
    properties: {
      name: { type: 'string' },
      expr: { type: 'string' },
      error: { type: 'string' },
      tokens: { type: 'array', items: { type: 'object', required: ['type', 'value'], properties: { type: { type: 'string' }, value: { type: 'string' } } } },
      ast: {},
      cases: { type: 'array', items: { type: 'object', required: ['data', 'value'], properties: { data: {}, value: {} } } },
    },
  },
});
