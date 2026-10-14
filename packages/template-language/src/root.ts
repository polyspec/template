// Template root (EDT-18 to EDT-21): the marker `template-root.json`, the root of a document by nearest ancestor and the
// diagnostics of the include and block paths that name no regular file under the root. Files are reached only through
// an injected host, so the language service stays free of Node.js (EDT-3).
import { PathError, resolvePath, type Template } from '@polyspec/template';
import type { Diagnostic } from './document.js';

/** The file name of the marker that declares a template root. */
export const ROOT_MARKER = 'template-root.json';

/** The message of an include or block path when no valid marker declares a root. */
const UNDECLARED = `no template root declared (${ROOT_MARKER})`;

/** The type of a file system entry, read without following a symbolic link. */
export type EntryType = 'file' | 'directory' | 'symlink' | 'other';

/** The file access of root resolution. Paths are absolute and separated by `/`. */
export interface RootHost {
  /** The type of the entry at a path without following a symbolic link (`lstat`), or null when the path names nothing. */
  entryType(path: string): EntryType | null;
  /** The text of the regular file at a path. */
  readText(path: string): string;
}

/** Where a document lies: its absolute path and the host that reaches the files around it. */
export interface DocumentLocation {
  path: string;
  host: RootHost;
}

/** The marker of a document: its path and text, the declared root (null when the marker is invalid) and its diagnostics. */
export interface TemplateRoot {
  marker: string;
  text: string;
  path: string | null;
  /** The diagnostics of the marker text, positions into that text (EDT-19). */
  diagnostics: Diagnostic[];
}

/** The diagnostics of a marker text: empty for `{"schema": 1}`, otherwise one error over the whole text (EDT-19). */
export function checkRootMarker(text: string): Diagnostic[] {
  const invalid = (message: string): Diagnostic[] => [
    { start: 0, end: text.length, code: 'E_ROOT_INVALID', message, severity: 'error', source: 'polyspec-template' },
  ];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return invalid(`${ROOT_MARKER} is not one JSON document: ${error.message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid(`${ROOT_MARKER} must be a JSON object`);
  const unknown = Object.keys(value).find(key => key !== 'schema');
  if (unknown !== undefined) return invalid(`${ROOT_MARKER} has the unknown key ${JSON.stringify(unknown)}`);
  if (!('schema' in value)) return invalid(`${ROOT_MARKER} must have the key "schema"`);
  if (value.schema !== 1) return invalid(`the schema of ${ROOT_MARKER} must be 1, not ${JSON.stringify(value.schema)}`);
  return [];
}

/** The marker in the nearest ancestor directory of a document, its own directory first, or null when none has one (EDT-18). */
export function findRoot(location: DocumentLocation): TemplateRoot | null {
  let directory = parentOf(location.path);
  while (directory !== null) {
    const marker = `${directory === '/' ? '' : directory}/${ROOT_MARKER}`;
    if (location.host.entryType(marker) === 'file') {
      const text = location.host.readText(marker);
      const diagnostics = checkRootMarker(text);
      return { marker, text, path: diagnostics.length === 0 ? directory : null, diagnostics };
    }
    directory = parentOf(directory);
  }
  return null;
}

/** A path tag of a template: an include, or a block with a path token, with its byte span. */
interface PathTag {
  path: string;
  span: [number, number];
}

/**
 * The diagnostics of the include paths and block paths of a template (EDT-20), with byte spans. A block of an id alone
 * renders a definition of `define` and is not resolved (RT-24, RT-25).
 */
export function pathDiagnostics(ast: Template, location: DocumentLocation | undefined, root: TemplateRoot | null): { span: [number, number]; code: string; message: string }[] {
  const tags = pathTags(ast);
  if (location === undefined || root === null || root.path === null) return tags.map(tag => ({ span: tag.span, code: 'E_ROOT_UNDECLARED', message: UNDECLARED }));
  const base = root.path === '/' ? '' : root.path;
  const name = location.path.slice(base.length + 1);
  const result: { span: [number, number]; code: string; message: string }[] = [];
  for (const tag of tags) {
    const problem = resolveTag(tag.path, name, base, location.host);
    if (problem !== null) result.push({ span: tag.span, ...problem });
  }
  return result;
}

// The problem of one path: it leaves the root, crosses a symbolic link or names no regular file (RT-8, RT-10).
function resolveTag(path: string, name: string, base: string, host: RootHost): { code: string; message: string } | null {
  let target: string;
  try {
    target = resolvePath(name, path);
  } catch (error) {
    if (!(error instanceof PathError)) throw error;
    return { code: 'E_LOAD_OUTSIDE_ROOT', message: `${JSON.stringify(path)} leaves the template root` };
  }
  const missing = { code: 'E_LOAD_NOT_FOUND', message: `template ${target} does not exist` };
  const segments = target === '' ? [] : target.split('/');
  if (segments.length === 0) return missing;
  for (let index = 0; index < segments.length; index++) {
    const component = segments.slice(0, index + 1).join('/');
    const type = host.entryType(`${base}/${component}`);
    if (type === 'symlink') return { code: 'E_LOAD_FAILED', message: `template ${target} cannot be loaded: ${component} is a symbolic link` };
    if (type === null || (index < segments.length - 1 ? type !== 'directory' : type !== 'file')) return missing;
  }
  return null;
}

// The include tags and the block tags with a path, in source order.
function pathTags(ast: Template): PathTag[] {
  const tags: PathTag[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const node = value as { type?: unknown; path?: unknown; span?: unknown };
    if ((node.type === 'Include' || node.type === 'Block') && typeof node.path === 'string') tags.push({ path: node.path, span: node.span as [number, number] });
    for (const child of Object.values(value)) visit(child);
  };
  visit(ast.body);
  return tags.sort((left, right) => left.span[0] - right.span[0]);
}

// The directory of an absolute path, or null for the file system root.
function parentOf(path: string): string | null {
  if (path === '/') return null;
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}
