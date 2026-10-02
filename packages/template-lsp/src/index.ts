// Package entry: the custom requests and the settings section of the server (EDT-14), shared with clients.
import type { Position, Range, TextDocumentIdentifier } from 'vscode-languageserver';

/** Method of the request that returns the range of every accepted tag except comments (EDT-9). */
export const TAG_RANGES_METHOD = 'polyspec-template/tagRanges';

/** Parameters of {@link TAG_RANGES_METHOD}. */
export interface TagRangesParams {
  textDocument: TextDocumentIdentifier;
}

/** Result of {@link TAG_RANGES_METHOD}: the tag ranges in text order, or null for a document that is not open. */
export type TagRangesResult = Range[] | null;

/** Method of the request that returns the position of the matching tag (EDT-11). */
export const MATCHING_TAG_METHOD = 'polyspec-template/matchingTag';

/** Parameters of {@link MATCHING_TAG_METHOD}. */
export interface MatchingTagParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

/** Result of {@link MATCHING_TAG_METHOD}: the start of the next tag of the construct, or null. */
export type MatchingTagResult = Position | null;

/** The `workspace/configuration` section of the server settings. */
export const SETTINGS_SECTION = 'polyspec-template';
