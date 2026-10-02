// Default colors of the template marks for dark and light editor themes.
import { EditorView } from '@codemirror/view';

type Colors = Record<string, string>;

const dark: Colors = {
  delimiter: '#ff7b72',
  keyword: '#ff7b72',
  variable: '#ffa657',
  property: '#79c0ff',
  function: '#d2a8ff',
  string: '#a5d6ff',
  number: '#79c0ff',
  operator: '#e6edf3',
  comment: '#8b949e',
  path: '#a5d6ff',
};

const light: Colors = {
  delimiter: '#cf222e',
  keyword: '#cf222e',
  variable: '#953800',
  property: '#0550ae',
  function: '#8250df',
  string: '#0a3069',
  number: '#0550ae',
  operator: '#1f2328',
  comment: '#6e7781',
  path: '#0a3069',
};

function rules(mode: '&dark' | '&light', colors: Colors, tag: string, outline: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {
    [`${mode} .cm-template-tag`]: { backgroundColor: tag },
    [`${mode} .cm-template-highlight`]: { outline: `1px solid ${outline}` },
  };
  for (const [type, color] of Object.entries(colors)) result[`${mode} .cm-template-${type}`] = { color };
  return result;
}

/** The tag backgrounds of EDT-9, the token colors and the matching tag outline for dark and light themes. */
export const templateTheme = EditorView.baseTheme({
  ...rules('&dark', dark, '#16351c', '#7ee787'),
  ...rules('&light', light, '#e3f6dd', '#1a7f37'),
  '.cm-template-comment': { fontStyle: 'italic' },
});
