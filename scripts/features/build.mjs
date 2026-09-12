#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const manifest = JSON.parse(await readFile(resolve(root, 'contracts/features.json'), 'utf8'));
const clients = ['go', 'php', 'rust', 'typescript'];
const docLink = (feature, ko) => {
  let doc = feature.docs[0] ?? '';
  if (ko && doc.endsWith('.md')) doc = doc.replace(/\.md$/, '.ko.md');
  doc = doc.replace(/^docs\//, '').replace(/\.ko\.md$|\.md$/, '');
  return doc || '.';
};
const table = (ko) => manifest.features.map(feature => `| ${feature.id} | ${ko ? feature.title_ko : feature.title} | ${feature.status} | ${clients.map(client => `${client}: ${feature.clients[client]}`).join('<br>')} | [${ko ? '근거' : 'Evidence'}](${docLink(feature, ko)}) |`).join('\n');
const body = `# Feature status\n\nThe executable source is [contracts/features.json](../contracts/features.json). Each entry defines inputs, outputs, state transitions, errors, client support, fixtures, tests, verification commands and paired documentation.\n\n| ID | Feature | Status | Client support | Evidence |\n|---|---|---|---|---|\n${table(false)}\n\nRun \`make feature-check\` to validate every contract and referenced path. An implemented feature requires executable verification and paired documentation; partial and planned are incomplete.\n`;
const korean = `# 기능 상태\n\n실행 정본은 [contracts/features.json](../contracts/features.json)이다. 각 항목은 input, output, 상태 전이, 오류, client 지원 상태, fixture, test, 검증 명령과 paired document를 정의한다.\n\n| ID | 기능 | 상태 | Client 지원 | 근거 |\n|---|---|---|---|---|\n${table(true)}\n\n\`make feature-check\`로 모든 계약과 참조 경로를 검사한다. implemented 항목은 실행 가능한 검증과 언어별 문서 쌍이 필요하며 partial과 planned는 미완료 상태다.\n`;
const outputs = [['docs/features.md', body], ['docs/features.ko.md', korean]];
if (process.argv.includes('--check')) {
  for (const [relative, expected] of outputs) {
    const actual = await readFile(resolve(root, relative), 'utf8').catch(() => '');
    if (actual !== expected) throw new Error(`features: generated document is stale: ${relative}`);
  }
} else {
  for (const [relative, content] of outputs) await writeFile(resolve(root, relative), content);
}
console.log(`features: ${process.argv.includes('--check') ? 'checked' : 'generated'} ${manifest.features.length} feature rows`);
