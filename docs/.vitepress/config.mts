import { defineConfig } from 'vitepress';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.VITEPRESS_BASE ?? '/';

const englishNav = [
  { text: 'Specification', link: '/spec/lexical' },
  { text: 'Feature status', link: '/features' },
  { text: 'Operations', link: '/operations/development' },
];

const koreanNav = [
  { text: '명세', link: '/ko/spec/lexical' },
  { text: '기능 상태', link: '/ko/features' },
  { text: '절차', link: '/ko/operations/development' },
];

const ebnfLanguage = {
  name: 'EBNF',
  scopeName: 'source.ebnf',
  aliases: ['ebnf'],
  patterns: [
    { name: 'comment.line.number-sign.ebnf', match: '#.*$' },
    { name: 'string.quoted.single.ebnf', begin: "'", end: "'", patterns: [{ name: 'constant.character.escape.ebnf', match: '\\\\.' }] },
    { name: 'string.quoted.double.ebnf', begin: '"', end: '"', patterns: [{ name: 'constant.character.escape.ebnf', match: '\\\\.' }] },
    { name: 'keyword.operator.ebnf', match: '::=|:=|=|\\||\\*|\\+|\\?|-' },
    { name: 'punctuation.definition.group.ebnf', match: '[(){}\\[\\],;]' },
    { name: 'entity.name.rule.ebnf', match: '\\b[A-Za-z_][A-Za-z0-9_-]*(?=\\s*(?:::=|:=|=))' },
    { name: 'variable.other.ebnf', match: '\\b[A-Za-z_][A-Za-z0-9_-]*\\b' },
  ],
};

const englishSidebar = [
  {
    text: 'Specification',
    items: [
      { text: 'Lexical rules', link: '/spec/lexical' },
      { text: 'Tag grammar', link: '/spec/grammar' },
      { text: 'Expressions', link: '/spec/expressions' },
      { text: 'Data model', link: '/spec/data-model' },
      { text: 'Functions', link: '/spec/functions' },
      { text: 'Runtime', link: '/spec/runtime' },
      { text: 'Typed compiler', link: '/spec/compiler' },
      { text: 'AST', link: '/spec/ast' },
      { text: 'Errors', link: '/spec/errors' },
      { text: 'Conformance', link: '/spec/conformance' },
      { text: 'Examples', link: '/spec/examples' },
    ],
  },
  {
    text: 'Operations',
    items: [
      { text: 'Development', link: '/operations/development' },
      { text: 'Conformance', link: '/operations/conformance' },
      { text: 'Release testing', link: '/operations/testing' },
      { text: 'Dependencies', link: '/operations/dependencies' },
      { text: 'Browser rendering', link: '/operations/browser' },
      { text: 'Example site', link: '/operations/showcase' },
      { text: 'Publication', link: '/operations/publication' },
      { text: 'Documentation', link: '/operations/documentation' },
    ],
  },
  {
    text: 'Status',
    items: [
      { text: 'Feature status', link: '/features' },
      { text: 'Execution checklist', link: '/plans/execution-checklist' },
    ],
  },
];

const koreanSidebar = [
  {
    text: '명세',
    items: [
      { text: '렉시컬 규칙', link: '/ko/spec/lexical' },
      { text: '태그 문법', link: '/ko/spec/grammar' },
      { text: '표현식', link: '/ko/spec/expressions' },
      { text: '데이터 모델', link: '/ko/spec/data-model' },
      { text: '함수', link: '/ko/spec/functions' },
      { text: '런타임', link: '/ko/spec/runtime' },
      { text: '타입 고정 컴파일러', link: '/ko/spec/compiler' },
      { text: 'AST', link: '/ko/spec/ast' },
      { text: '오류', link: '/ko/spec/errors' },
      { text: '적합성', link: '/ko/spec/conformance' },
      { text: '예제', link: '/ko/spec/examples' },
    ],
  },
  {
    text: '절차',
    items: [
      { text: '개발', link: '/ko/operations/development' },
      { text: '적합성 절차', link: '/ko/operations/conformance' },
      { text: '릴리스 테스트', link: '/ko/operations/testing' },
      { text: '의존성', link: '/ko/operations/dependencies' },
      { text: '브라우저 렌더링', link: '/ko/operations/browser' },
      { text: '예제 사이트', link: '/ko/operations/showcase' },
      { text: '발행', link: '/ko/operations/publication' },
      { text: '문서 절차', link: '/ko/operations/documentation' },
    ],
  },
  {
    text: '상태',
    items: [
      { text: '기능 상태', link: '/ko/features' },
      { text: '실행 체크리스트', link: '/ko/plans/execution-checklist' },
    ],
  },
];

const docsRoot = fileURLToPath(new URL('..', import.meta.url));

function koreanDocuments(directory = docsRoot): string[] {
  const documents: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.vitepress') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) documents.push(...koreanDocuments(path));
    else if (entry.name.endsWith('.ko.md')) documents.push(relative(docsRoot, path).split(sep).join('/'));
  }
  return documents;
}

const rewrites = Object.fromEntries(koreanDocuments().map((source) => {
  const destination = source === 'index.ko.md' ? 'ko/index.md' : `ko/${source.replace(/\.ko\.md$/, '.md')}`;
  return [source, destination];
}));

// The site renders the Markdown documents of docs/ plus the top-level README and CHANGELOG.
// Relative links to files outside docs/ resolve on the file system; scripts/check-documents.mjs
// verifies every link, so the site does not repeat that check.
export default defineConfig({
  base,
  title: 'Template',
  description: 'A template language with one specification, four implementations and a native PHP extension',
  srcDir: '.',
  outDir: '.vitepress/dist',
  cleanUrls: true,
  rewrites,
  ignoreDeadLinks: true,
  lastUpdated: false,
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      link: '/',
      themeConfig: { nav: englishNav, sidebar: englishSidebar },
    },
    ko: {
      label: '한국어',
      lang: 'ko-KR',
      link: '/ko/',
      themeConfig: { nav: koreanNav, sidebar: koreanSidebar },
    },
  },
  markdown: {
    languages: [ebnfLanguage],
  },
});
