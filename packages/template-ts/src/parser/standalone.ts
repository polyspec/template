// Standalone line groups (LEX-14, LEX-15).

export interface TagRange {
  // String indexes of the tag including any wrapper.
  start: number;
  end: number;
  echo: boolean;
}

export interface Range {
  start: number;
  end: number;
}

// Returns the string index ranges that standalone line groups remove from the output.
export function standaloneRanges(text: string, tags: readonly TagRange[]): Range[] {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) lineStarts.push(i + 1);
  }
  const lineCount = lineStarts.length;
  const lineOf = (index: number): number => {
    let low = 0;
    let high = lineCount - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((lineStarts[mid] as number) <= index) low = mid;
      else high = mid - 1;
    }
    return low;
  };
  const lineEnd = (line: number): number => (line + 1 < lineCount ? (lineStarts[line + 1] as number) : text.length);

  const tagsByLine: TagRange[][] = Array.from({ length: lineCount }, () => []);
  const sorted = [...tags].sort((a, b) => a.start - b.start);
  for (const tag of sorted) (tagsByLine[lineOf(tag.start)] as TagRange[]).push(tag);

  const ranges: Range[] = [];
  let line = 0;
  while (line < lineCount) {
    let groupEnd = line;
    let hasTag = false;
    let hasEcho = false;
    const groupTags: TagRange[] = [];
    for (let cursor = line; cursor <= groupEnd; cursor++) {
      for (const tag of tagsByLine[cursor] as TagRange[]) {
        hasTag = true;
        if (tag.echo) hasEcho = true;
        groupTags.push(tag);
        const endLine = lineOf(Math.max(tag.start, tag.end - 1));
        if (endLine > groupEnd) groupEnd = endLine;
      }
    }
    if (hasTag && !hasEcho) {
      const start = lineStarts[line] as number;
      const end = lineEnd(groupEnd);
      if (onlyWhitespaceOutside(text, start, end, groupTags)) ranges.push({ start, end });
    }
    line = groupEnd + 1;
  }
  return ranges;
}

function onlyWhitespaceOutside(text: string, start: number, end: number, tags: readonly TagRange[]): boolean {
  let index = start;
  for (const tag of tags) {
    if (!whitespaceOnly(text, index, tag.start)) return false;
    index = tag.end;
  }
  return whitespaceOnly(text, index, end);
}

function whitespaceOnly(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code !== 0x20 && code !== 0x09 && code !== 0x0d && code !== 0x0a) return false;
  }
  return true;
}
