// Tests that the Python support of each feature of contracts/features.json follows the Python coverage of its verification
// commands (T22.4-9). A command covers Python when a make target it names, one of its prerequisites or a script of its
// recipe runs Python, which means the target or script names python or python3. A feature whose commands cover no Python
// declares python: unsupported. A feature whose commands cover Python declares python: partial, or pass once the CI
// merge-group run of T22.4-7 passed. Each failure names the feature, the declared value and the expected value.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const manifest = JSON.parse(read('contracts/features.json'));

// The rules of the Makefile: a target, its prerequisites and its recipe lines. A variable assignment is not a rule.
function rules() {
  const map = new Map();
  let current = null;
  for (const line of read('Makefile').split('\n')) {
    const rule = line.match(/^([A-Za-z0-9_.-]+):(?!=)\s*([^#]*)/);
    if (rule && !/^\s/.test(line)) {
      current = { prerequisites: rule[2].split(/\s+/).filter(Boolean), recipe: '' };
      map.set(rule[1], current);
    } else if (current && line.startsWith('\t')) {
      current.recipe += `${line}\n`;
    } else if (line.trim() === '') {
      current = null;
    }
  }
  return map;
}

const RULES = rules();
const PYTHON = /\bpython3?\b/;

// The words of a one-line variable of the Makefile, such as CHECK_TARGETS, which a recipe names as $(CHECK_TARGETS).
function variableWords(name) {
  const assignment = read('Makefile').match(new RegExp(`^${name}\\s*:?=\\s*(.*)$`, 'm'));
  return assignment ? assignment[1].split(/\s+/).filter(Boolean) : [];
}

// The targets that a list of words names, with each $(VARIABLE) replaced by the words of its variable.
function expand(words) {
  return words.flatMap(word => {
    const variable = word.match(/^\$\((\w+)\)$/);
    return variable ? variableWords(variable[1]) : [word];
  });
}

function scriptText(recipe) {
  const scripts = [...recipe.matchAll(/node\s+(\S+\.m?js)/g)].map(match => match[1]);
  return scripts.map(file => {
    try {
      return read(file);
    } catch {
      return '';
    }
  }).join('\n');
}

function reaches(target, seen = new Set()) {
  if (seen.has(target)) return false;
  seen.add(target);
  if (PYTHON.test(target)) return true;
  const rule = RULES.get(target);
  if (!rule) return false;
  if (PYTHON.test(rule.recipe) || PYTHON.test(scriptText(rule.recipe))) return true;
  const named = [...rule.recipe.matchAll(/\$\((\w+)\)/g)].flatMap(match => variableWords(match[1]));
  return [...expand(rule.prerequisites), ...named].some(next => reaches(next, seen));
}

function covers(command) {
  const make = command.match(/^make\s+(.*)$/);
  if (make) {
    const targets = expand(make[1].split(/\s+/).filter(word => word && !word.includes('=') && !word.startsWith('-')));
    return targets.some(target => reaches(target));
  }
  const node = command.match(/^node\s+(\S+)/);
  if (node) return PYTHON.test(read(node[1]));
  return false;
}

test('each feature declares python as the coverage of its verification commands allows', () => {
  assert.ok(manifest.features.length > 0, 'contracts/features.json holds no feature; the check verified nothing');
  const failures = [];
  for (const feature of manifest.features) {
    const declared = feature.clients?.python;
    const covered = feature.verification.some(item => covers(item.command));
    if (!covered && declared !== 'unsupported') {
      failures.push(`${feature.id}: no verification command runs Python, so python must be unsupported; declared ${declared}`);
    }
    if (covered && declared !== 'partial' && declared !== 'pass') {
      failures.push(`${feature.id}: a verification command runs Python, so python must be partial or pass; declared ${declared}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
