#!/usr/bin/env node
// Validates schema/ast.schema.json, every tests/cases/**/expected.ast.json and every
// ast field of tests/fixtures/expr/cases.json.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = 'schema/ast.schema.json';
const schema = JSON.parse(readFileSync(join(root, schemaPath), 'utf8'));
const errors = [];

const ajv = new Ajv({ strict: true, allErrors: true });
addFormats(ajv);

if (!ajv.validateSchema(schema)) {
  for (const error of ajv.errors ?? []) errors.push(`${schemaPath}: ${error.instancePath} ${error.message}`);
  report();
}

const validateTemplate = ajv.compile(schema);
const validateExpr = ajv.compile({ $ref: `${schema.$id}#/definitions/Expr` });

function describe(validate) {
  return (validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`).join('; ');
}

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
  if (!validateTemplate(ast)) errors.push(`${relative}: ${describe(validateTemplate)}`);
}

let exprCount = 0;
const exprPath = join(root, 'tests', 'fixtures', 'expr', 'cases.json');
if (existsSync(exprPath)) {
  const cases = JSON.parse(readFileSync(exprPath, 'utf8'));
  for (const item of cases) {
    if (item.ast === undefined) continue;
    exprCount += 1;
    if (!validateExpr(item.ast)) errors.push(`tests/fixtures/expr/cases.json: ${item.name}: ${describe(validateExpr)}`);
  }
}

report();

function report() {
  if (errors.length) {
    for (const error of errors) process.stderr.write(`[schema] ${error}\n`);
    process.exit(1);
  }
  process.stdout.write(`[schema] schema valid; ${astFiles.length} AST files and ${exprCount} expression ASTs passed\n`);
  process.exit(0);
}
