// VAL-8: conversion of a value to text.
import { numberToString } from './number.js';
import { SafeString, type Value } from './value.js';

export class StringifyError extends Error {
  constructor() {
    super('a list or map cannot be converted to text');
    this.name = 'StringifyError';
  }
}

// Returns the text of a value, or throws StringifyError for a list or map.
export function stringify(value: Value): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return numberToString(value);
  if (typeof value === 'string') return value;
  if (value instanceof SafeString) return value.text;
  throw new StringifyError();
}
