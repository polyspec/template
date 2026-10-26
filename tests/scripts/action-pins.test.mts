// Tests that every action pin of a workflow names the commit that GitHub holds for its version comment (T22.4-8). The
// list below holds each pin used by the workflows with the commit of its version tag, each checked against GitHub
// when the list was written; the test reads no network. A pin whose commit is not in the list fails with its file,
// line, action and commit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { pinsOf, WORKFLOWS } from './workflows.mts';

const VERIFIED = [
  { action: 'actions/download-artifact', version: 'v8.0.2', commit: '9000827ccba6bdab643e8b6fd33ac0654aef8333' },
  { action: 'actions/checkout', version: 'v7.0.1', commit: '3d3c42e5aac5ba805825da76410c181273ba90b1' },
  { action: 'actions/configure-pages', version: 'v6.0.0', commit: '45bfe0192ca1faeb007ade9deae92b16b8254a0d' },
  { action: 'actions/deploy-pages', version: 'v5.0.1', commit: '368f82528645a54fb793d4d04e342629a3f51346' },
  { action: 'actions/setup-node', version: 'v7.1.0', commit: '949feb2413d6458794dcd2491c4babbbce0c15c1' },
  { action: 'actions/upload-artifact', version: 'v7.0.1', commit: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a' },
  { action: 'actions/upload-pages-artifact', version: 'v5.0.0', commit: 'fc324d3547104276b827a68afc52ff2a11cc49c9' },
  { action: 'shivammathur/setup-php', version: '2.40.0', commit: 'eb7c497e18156a6bbabfef1d3a82760b9eda3962' },
];

// Each `uses:` value of every workflow, with its file, line, action, commit and version comment.
function pins() {
  return WORKFLOWS.flatMap(pinsOf).map(pin => {
    const at = pin.uses.indexOf('@');
    if (at <= 0) throw new Error(`${pin.file}:${pin.line}: ${pin.uses} names no action and commit`);
    return { file: pin.file, line: pin.line, action: pin.uses.slice(0, at), commit: pin.uses.slice(at + 1), version: pin.comment };
  });
}

test('every action pin names a commit that GitHub holds for its version', () => {
  const found = pins();
  assert.ok(found.length > 0, 'no action pin was found in .github/workflows; the check verified nothing');
  const failures = [];
  for (const pin of found) {
    const where = `${pin.file}:${pin.line}: ${pin.action}@${pin.commit}`;
    if (!/^[0-9a-f]{40}$/.test(pin.commit)) {
      failures.push(`${where} is not a full 40-character commit`);
      continue;
    }
    const verified = VERIFIED.find(entry => entry.action === pin.action && entry.commit === pin.commit);
    if (!verified) {
      failures.push(`${where} is not a commit that GitHub holds for ${pin.action}; expected the commit of the version comment (${pin.version ?? 'none'}) listed in VERIFIED`);
      continue;
    }
    if (pin.version !== verified.version) {
      failures.push(`${where} has the version comment ${pin.version ?? 'none'}; the commit is ${verified.version}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
