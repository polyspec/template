import { defineConfig } from 'vitepress';

const base = process.env.VITEPRESS_BASE ?? '/';

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
      { text: '렉시컬 규칙', link: '/spec/lexical.ko' },
      { text: '태그 문법', link: '/spec/grammar.ko' },
      { text: '표현식', link: '/spec/expressions.ko' },
      { text: '데이터 모델', link: '/spec/data-model.ko' },
      { text: '함수', link: '/spec/functions.ko' },
      { text: '런타임', link: '/spec/runtime.ko' },
      { text: '타입 고정 컴파일러', link: '/spec/compiler.ko' },
      { text: 'AST', link: '/spec/ast.ko' },
      { text: '오류', link: '/spec/errors.ko' },
      { text: '적합성', link: '/spec/conformance.ko' },
      { text: '예제', link: '/spec/examples.ko' },
    ],
  },
  {
    text: '절차',
    items: [
      { text: '개발', link: '/operations/development.ko' },
      { text: '적합성 절차', link: '/operations/conformance.ko' },
      { text: '브라우저 렌더링', link: '/operations/browser.ko' },
      { text: '예제 사이트', link: '/operations/showcase.ko' },
      { text: '발행', link: '/operations/publication.ko' },
      { text: '문서 절차', link: '/operations/documentation.ko' },
    ],
  },
  {
    text: '상태',
    items: [
      { text: '기능 상태', link: '/features.ko' },
      { text: '실행 체크리스트', link: '/plans/execution-checklist.ko' },
    ],
  },
];

const koreanRoutes = [
  '/index.ko',
  '/guide.ko',
  '/features.ko',
  '/spec/lexical.ko',
  '/spec/grammar.ko',
  '/spec/expressions.ko',
  '/spec/data-model.ko',
  '/spec/functions.ko',
  '/spec/runtime.ko',
  '/spec/compiler.ko',
  '/spec/ast.ko',
  '/spec/errors.ko',
  '/spec/conformance.ko',
  '/spec/examples.ko',
  '/operations/development.ko',
  '/operations/conformance.ko',
  '/operations/browser.ko',
  '/operations/showcase.ko',
  '/operations/publication.ko',
  '/operations/documentation.ko',
  '/plans/execution-checklist.ko',
];

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
  ignoreDeadLinks: true,
  lastUpdated: false,
  themeConfig: {
    nav: [
      { text: 'Specification', link: '/spec/lexical' },
      { text: 'Feature status', link: '/features' },
      { text: 'Operations', link: '/operations/development' },
      { text: '한국어', link: '/index.ko' },
    ],
    sidebar: {
      '/': englishSidebar,
      ...Object.fromEntries(koreanRoutes.map((route) => [route, koreanSidebar])),
    },
  },
});
