#!/usr/bin/env node
// Validates the schemas of schema/, every tests/cases/**/expected.ast.json and every ast field of
// tests/fixtures/expr/cases.json, and checks that every case whose input.tpl parses has its expected.ast.json,
// expected.tokens.json and expected.format.json, the last two valid against schema/tokens.schema.json and
// schema/format.schema.json with sorted, non-overlapping tokens (CNF-2, CNF-15).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { astPresenceFailures, caseFileValidators, formatFileFailures, readCaseFiles } from './conformance-case-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = 'schema/ast.schema.json';
const schema = JSON.parse(readFileSync(join(root, schemaPath), 'utf8'));
const errors = [];
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

for (const path of [schemaPath, 'schema/tokens.schema.json', 'schema/format.schema.json']) {
  if (ajv.validateSchema(JSON.parse(readFileSync(join(root, path), 'utf8')))) continue;
  errors.push(`${path}: ${ajv.errorsText(ajv.errors)}`);
}
if (errors.length) report();

const cases = readCaseFiles();
for (const failure of [...astPresenceFailures(cases), ...formatFileFailures(cases, caseFileValidators(ajv, root))]) errors.push(failure);

const validateTemplate = ajv.compile(schema);
const validateExpr = ajv.compile({ $ref: `${schema.$id}#/definitions/Expr` });

function collectAstFiles(directory, files) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectAstFiles(path, files);
    else if (entry.name === 'expected.ast.json') files.push(path);
  }
  return files;
}

const astFiles = collectAstFiles(join(root, 'tests', 'cases'), []).sort();
for (const path of astFiles) {
  const relative = path.slice(root.length + 1);
  let ast;
  try {
    ast = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    continue;
  }
  if (!validateTemplate(ast)) errors.push(`${relative}: ${ajv.errorsText(validateTemplate.errors)}`);
}

let exprCount = 0;
const exprPath = join(root, 'tests', 'fixtures', 'expr', 'cases.json');
if (existsSync(exprPath)) {
  const cases = JSON.parse(readFileSync(exprPath, 'utf8'));
  for (const item of cases) {
    if (item.ast === undefined) continue;
    exprCount += 1;
    if (!validateExpr(item.ast)) errors.push(`tests/fixtures/expr/cases.json: ${item.name}: ${ajv.errorsText(validateExpr.errors)}`);
  }
}

report();

function report() {
  if (errors.length) {
    for (const error of errors) process.stderr.write(`[schema] ${error}\n`);
    process.exit(1);
  }
  process.stdout.write(`[schema] schema valid; AST, token and format files checked in ${cases.length} cases; ${astFiles.length} AST files and ${exprCount} expression ASTs passed\n`);
  process.exit(0);
}
