// Indentation: the spaces and tabs at the start of each line, set by the nesting of HTML elements and template blocks.

/** A tag range of the parser that the indentation reads. */
export interface IndentTag {
  kind: string;
  start: number;
  end: number;
}

/** Options of {@link indentEdits}. */
export interface IndentOptions {
  /** The indent unit: a run of spaces or one tab. */
  unit: string;
  /** `indent`: template blocks add a level like HTML elements. `flat`: they add none. */
  templateBlocks: 'indent' | 'flat';
  /** String index range; only lines that start inside it are indented. */
  range: { start: number; end: number } | null;
}

/** A replacement of the indentation of one line. */
export interface IndentEdit {
  start: number;
  end: number;
  text: string;
}

/** Why the HTML structure cannot be indented. `index` is the string index of the tag where the structure fails. */
export interface IndentError {
  index: number;
  message: string;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// Elements whose content is not HTML markup: the indentation does not read tags inside them.
const RAW = new Set(['script', 'style', 'textarea']);
// Elements whose lines keep their indentation.
const KEPT = new Set(['pre', 'script', 'style', 'textarea']);
const OPEN_BLOCK = new Set(['if', 'for', 'ifblock']);
const BRANCH = new Set(['elseif', 'else']);

// A change of depth at a string index. `dedent` marks a tag that takes one level from its own line.
interface Step {
  index: number;
  delta: number;
  dedent: boolean;
}

interface Scan {
  steps: Step[];
  /** Ranges in which a line start keeps its indentation. */
  kept: Array<{ start: number; end: number }>;
  /** Ranges of HTML tags spanning lines, whose inner lines get one more level. */
  inside: Array<{ start: number; end: number }>;
}

// A template block: the open HTML elements at its start, at the end of its first branch, and whether it has an else branch.
interface Block {
  start: Array<{ name: string; start: number }>;
  branchEnd: string[] | null;
  hasElse: boolean;
}

/** The indentation of one line: its start, the end of its current indentation, and the indentation it gets. */
export interface LineIndentation {
  start: number;
  end: number;
  /** The indentation under the rule, or null for a line that keeps its indentation. */
  indentation: string | null;
}

/** Returns the edits that set the indentation of every line, or the reason why the HTML structure cannot be indented. */
export function indentEdits(text: string, tags: readonly IndentTag[], options: IndentOptions): { edits: IndentEdit[] } | { error: IndentError } {
  const lines = lineIndentations(text, tags, options.unit, options.templateBlocks, false);
  if ('error' in lines) return lines;
  const edits: IndentEdit[] = [];
  for (const line of lines.lines) {
    if (line.indentation === null) continue;
    if (options.range !== null && (line.start < options.range.start || line.start >= options.range.end)) continue;
    if (text.slice(line.start, line.end) !== line.indentation) edits.push({ start: line.start, end: line.end, text: line.indentation });
  }
  return { edits };
}

/**
 * Returns the indentation of every line. A tolerant computation does not require a balanced structure: an end tag
 * closes up to the open element of the same name and is ignored when no such element is open (EDT-13).
 */
export function lineIndentations(text: string, tags: readonly IndentTag[], unit: string, templateBlocks: 'indent' | 'flat', tolerant: boolean): { lines: LineIndentation[] } | { error: IndentError } {
  const scan = scanStructure(text, tags, templateBlocks, tolerant);
  if ('error' in scan) return scan;
  const lines: LineIndentation[] = [];
  const dedents = new Set(scan.steps.filter(item => item.dedent).map(item => item.index));
  let step = 0;
  let depth = 0;
  for (let lineStart = 0; lineStart <= text.length; lineStart = text.indexOf('\n', lineStart) + 1) {
    while (step < scan.steps.length && (scan.steps[step] as Step).index < lineStart) depth += (scan.steps[step++] as Step).delta;
    let first = lineStart;
    while (text[first] === ' ' || text[first] === '\t') first++;
    if (within(scan.kept, lineStart)) {
      lines.push({ start: lineStart, end: first, indentation: null });
    } else {
      const blank = first === text.length || text[first] === '\n' || text[first] === '\r';
      let level = depth + (within(scan.inside, lineStart) ? 1 : 0);
      if (dedents.has(first)) level--;
      lines.push({ start: lineStart, end: first, indentation: blank ? '' : unit.repeat(Math.max(level, 0)) });
    }
    if (text.indexOf('\n', lineStart) < 0) break;
  }
  return { lines };
}

function within(ranges: ReadonlyArray<{ start: number; end: number }>, index: number): boolean {
  return ranges.some(range => range.start < index && index < range.end);
}

function scanStructure(text: string, tags: readonly IndentTag[], templateBlocks: 'indent' | 'flat', tolerant: boolean): Scan | { error: IndentError } {
  const steps: Step[] = [];
  const kept: Scan['kept'] = [];
  const inside: Scan['inside'] = [];
  let elements: Array<{ name: string; start: number }> = [];
  const blocks: Block[] = [];
  const counted = templateBlocks === 'indent';
  const names = (): string[] => elements.map(element => element.name);
  let next = 0;
  let raw: { name: string; contentStart: number } | null = null;
  let keptStart: number | null = null;
  let position = 0;

  // Template tags are opaque to the HTML scan; block tags open, branch and close template blocks. Every branch of a
  // block must end with the same open HTML elements, and a block without an else branch with those of its start.
  const templateTag = (tag: IndentTag): IndentError | null => {
    kept.push({ start: tag.start, end: tag.end });
    if (OPEN_BLOCK.has(tag.kind)) {
      blocks.push({ start: [...elements], branchEnd: null, hasElse: false });
      if (counted) steps.push({ index: tag.end, delta: 1, dedent: false });
      return null;
    }
    if (!BRANCH.has(tag.kind) && tag.kind !== 'close') return null;
    const block = blocks[blocks.length - 1];
    if (block === undefined) return null;
    const end = names();
    if (!tolerant && block.branchEnd !== null && !sameNames(block.branchEnd, end)) {
      return { index: tag.start, message: 'the HTML elements open at the end of this branch differ from those of the first branch' };
    }
    if (tag.kind === 'close') {
      if (!tolerant && !block.hasElse && !sameNames(block.start.map(element => element.name), end)) {
        return { index: tag.start, message: 'a template block without an else branch must end with the HTML elements open at its start' };
      }
      blocks.pop();
      // The close tag aligns with the start of its block; the elements that every branch opened apply after it.
      const opened = end.length - block.start.length;
      if (opened !== 0) {
        steps.push({ index: beforeLine(tag.start), delta: -opened, dedent: false });
        steps.push({ index: tag.end, delta: opened, dedent: false });
      }
      if (counted) steps.push({ index: tag.start, delta: -1, dedent: true });
      return null;
    }
    block.branchEnd = end;
    if (tag.kind === 'else') block.hasElse = true;
    // The next branch starts from the elements open at the start of the block.
    steps.push({ index: beforeLine(tag.start), delta: block.start.length - elements.length, dedent: false });
    elements = [...block.start];
    if (counted) steps.push({ index: tag.start, delta: 0, dedent: true });
    return null;
  };

  // Moves past one HTML tag from `<` and returns its end, reading template tags inside it.
  const htmlTagEnd = (start: number): number | IndentError => {
    let quote: string | null = null;
    let quoteStart = 0;
    let index = start + 1;
    while (index < text.length) {
      const tag = tags[next];
      if (tag !== undefined && tag.start === index) {
        const failure = templateTag(tag);
        if (failure !== null) return failure;
        next++;
        index = tag.end;
        continue;
      }
      const character = text[index] as string;
      if (quote !== null) {
        if (character === quote) {
          kept.push({ start: quoteStart, end: index });
          quote = null;
        }
      } else if (character === '"' || character === "'") {
        quote = character;
        quoteStart = index;
      } else if (character === '>') {
        return index + 1;
      }
      index++;
    }
    return tolerant ? text.length : { index: start, message: 'the HTML tag is not closed with ">"' };
  };

  while (position < text.length) {
    const tag = tags[next];
    if (tag !== undefined && tag.start === position) {
      const failure = templateTag(tag);
      if (failure !== null) return { error: failure };
      next++;
      position = tag.end;
      continue;
    }
    if (text[position] !== '<') {
      position++;
      continue;
    }
    if (raw !== null && !startsWithEndTag(text, position, raw.name)) {
      position++;
      continue;
    }
    if (text.startsWith('<!--', position)) {
      const close = text.indexOf('-->', position + 4);
      const end = close < 0 ? text.length : close + 3;
      kept.push({ start: position, end });
      const after = skipTemplateTags(end);
      if (typeof after !== 'number') return { error: after };
      position = after;
      continue;
    }
    if (text[position + 1] === '!' || text[position + 1] === '?') {
      const end = htmlTagEnd(position);
      if (typeof end !== 'number') return { error: end };
      position = end;
      continue;
    }
    const match = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)/.exec(text.slice(position, position + 64));
    if (match === null) {
      position++;
      continue;
    }
    const closing = match[1] === '/';
    const name = (match[2] as string).toLowerCase();
    const end = htmlTagEnd(position);
    if (typeof end !== 'number') return { error: end };
    if (text.slice(position, end).includes('\n')) inside.push({ start: position, end });
    if (closing) {
      if (VOID.has(name)) {
        position = end;
        continue;
      }
      const open = elements[elements.length - 1];
      if (open === undefined || open.name !== name) {
        if (!tolerant) {
          return { error: { index: position, message: open === undefined ? `the end tag </${name}> has no open element` : `the end tag </${name}> does not match the open element <${open.name}>` } };
        }
        // A tolerant computation closes up to the open element of the same name, or ignores the end tag.
        const match = elements.map(element => element.name).lastIndexOf(name);
        if (match < 0) {
          position = end;
          continue;
        }
        // The elements left open inside the matched one close before this line; the matched one closes on it.
        steps.push({ index: beforeLine(position), delta: match + 1 - elements.length, dedent: false });
        elements = elements.slice(0, match + 1);
      }
      steps.push({ index: position, delta: -1, dedent: true });
      elements.pop();
      if (KEPT.has(name) && !elements.some(element => KEPT.has(element.name)) && keptStart !== null) {
        kept.push({ start: keptStart, end: text.indexOf('\n', position) < 0 ? text.length : text.indexOf('\n', position) });
        keptStart = null;
      }
      raw = null;
      position = end;
      continue;
    }
    const selfClosing = text[end - 2] === '/';
    if (!VOID.has(name) && !selfClosing) {
      elements.push({ name, start: position });
      steps.push({ index: end, delta: 1, dedent: false });
      if (KEPT.has(name) && keptStart === null) keptStart = end;
      if (RAW.has(name)) raw = { name, contentStart: end };
    }
    position = end;
  }

  const open = elements[elements.length - 1];
  if (open !== undefined && !tolerant) return { error: { index: open.start, message: `the element <${open.name}> is not closed` } };
  steps.sort((left, right) => left.index - right.index);
  return { steps, kept, inside };

  // The index from which a change of depth applies to the line of a tag: before the line when the tag starts it.
  function beforeLine(index: number): number {
    const lineStart = text.lastIndexOf('\n', index - 1) + 1;
    return /^[ \t]*$/.test(text.slice(lineStart, index)) ? lineStart - 1 : index;
  }

  // Template tags inside an HTML comment are still template tags; the comment keeps its lines.
  function skipTemplateTags(end: number): number | IndentError {
    while (next < tags.length && (tags[next] as IndentTag).start < end) {
      const failure = templateTag(tags[next++] as IndentTag);
      if (failure !== null) return failure;
    }
    return end;
  }
}

function startsWithEndTag(text: string, index: number, name: string): boolean {
  return text.slice(index, index + name.length + 2).toLowerCase() === `</${name}`;
}

function sameNames(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}
