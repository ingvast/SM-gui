import { describe, it, expect } from 'vitest';
import {
  escapeRegex,
  buildRegex,
  findMatchesInField,
  getMachineFieldValue,
  setMachineFieldValue,
  normalizeReplaceTerm,
  getMatchContext,
  getMatchLine,
} from './searchUtils';
import { defaultMachineProperties } from '../yamlConverter';

// ---------------------------------------------------------------------------
// escapeRegex
// ---------------------------------------------------------------------------

describe('escapeRegex', () => {
  it('leaves plain strings unchanged', () => {
    expect(escapeRegex('hello')).toBe('hello');
  });

  it('escapes all regex meta-characters', () => {
    const special = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(special);
    // The escaped string must not throw when used in new RegExp()
    expect(() => new RegExp(escaped)).not.toThrow();
    // And it must match the literal string
    expect(new RegExp(escaped).test(special)).toBe(true);
  });

  it('escapes dots so they match only a literal dot', () => {
    const re = new RegExp(escapeRegex('a.b'));
    expect(re.test('a.b')).toBe(true);
    expect(re.test('axb')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildRegex
// ---------------------------------------------------------------------------

describe('buildRegex', () => {
  it('returns null for empty term', () => {
    expect(buildRegex('', { caseSensitive: false, wholeWord: false })).toBeNull();
  });

  it('case-insensitive by default', () => {
    // Each call gets a fresh regex — the global flag makes .test() stateful,
    // so reusing one instance across multiple .test() calls shifts lastIndex.
    expect(buildRegex('foo', { caseSensitive: false, wholeWord: false })!.test('FOO')).toBe(true);
    expect(buildRegex('foo', { caseSensitive: false, wholeWord: false })!.test('Foo')).toBe(true);
  });

  it('case-sensitive when requested', () => {
    const re = buildRegex('foo', { caseSensitive: true, wholeWord: false })!;
    expect(re.test('foo')).toBe(true);
    expect(re.test('FOO')).toBe(false);
  });

  it('whole-word mode does not match partial words', () => {
    const re = buildRegex('foo', { caseSensitive: false, wholeWord: true })!;
    expect(re.test('foo')).toBe(true);
    expect(re.test('foobar')).toBe(false);
    expect(re.test('a foo b')).toBe(true);
  });

  it('has the global flag set (required for iterating matches)', () => {
    const re = buildRegex('x', { caseSensitive: false, wholeWord: false })!;
    expect(re.flags).toContain('g');
  });

  it('escapes regex special chars in the search term', () => {
    const re = buildRegex('a.b', { caseSensitive: false, wholeWord: false })!;
    expect(re.test('a.b')).toBe(true);
    expect(re.test('axb')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findMatchesInField
// ---------------------------------------------------------------------------

describe('findMatchesInField', () => {
  const opts = { caseSensitive: false, wholeWord: false };

  it('returns empty array when there are no matches', () => {
    const re = buildRegex('xyz', opts)!;
    expect(findMatchesInField('hello world', re, 'n1', 'node', 'label')).toEqual([]);
  });

  it('finds a single match with correct indices', () => {
    const re = buildRegex('bar', opts)!;
    const matches = findMatchesInField('foo bar baz', re, 'n1', 'node', 'label');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      ownerId: 'n1',
      ownerKind: 'node',
      fieldName: 'label',
      startIndex: 4,
      endIndex: 7,
    });
  });

  it('finds multiple matches in one field', () => {
    const re = buildRegex('on', opts)!;
    const matches = findMatchesInField('on and on and on', re, 'e1', 'edge', 'guard');
    expect(matches).toHaveLength(3);
    expect(matches.map(m => m.startIndex)).toEqual([0, 7, 14]);
  });

  it('resets lastIndex between calls (stateless usage)', () => {
    const re = buildRegex('x', opts)!;
    // First call
    findMatchesInField('x x x', re, 'a', 'node', 'f');
    // Second call on a fresh string must still find from position 0
    const second = findMatchesInField('x y', re, 'b', 'node', 'f');
    expect(second).toHaveLength(1);
    expect(second[0].startIndex).toBe(0);
  });

  it('is case-insensitive when the regex is case-insensitive', () => {
    const re = buildRegex('FOO', opts)!;
    const matches = findMatchesInField('foo FOO Foo', re, 'n2', 'node', 'entry');
    expect(matches).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// getMachineFieldValue
// ---------------------------------------------------------------------------

describe('getMachineFieldValue', () => {
  const mp = {
    ...defaultMachineProperties,
    context: 'int x = 0;',
    hooks: {
      ...defaultMachineProperties.hooks,
      entry: 'log_entry();',
    },
  };

  it('reads a top-level field', () => {
    expect(getMachineFieldValue(mp, 'context')).toBe('int x = 0;');
  });

  it('reads a hooks sub-field', () => {
    expect(getMachineFieldValue(mp, 'hooks.entry')).toBe('log_entry();');
  });

  it('returns empty string for missing field', () => {
    expect(getMachineFieldValue(mp, 'hooks.exit')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// setMachineFieldValue
// ---------------------------------------------------------------------------

describe('setMachineFieldValue', () => {
  it('updates a top-level field immutably', () => {
    const mp = { ...defaultMachineProperties };
    const updated = setMachineFieldValue(mp, 'context', 'int y;');
    expect(updated.context).toBe('int y;');
    expect(mp.context).toBe('');  // original unchanged
  });

  it('updates a hooks sub-field immutably', () => {
    const mp = { ...defaultMachineProperties };
    const updated = setMachineFieldValue(mp, 'hooks.transition', 'trace();');
    expect(updated.hooks.transition).toBe('trace();');
    expect(mp.hooks.transition).toBe('');  // original unchanged
  });

  it('preserves other fields when updating one', () => {
    const mp = { ...defaultMachineProperties, includes: '#include <stdio.h>' };
    const updated = setMachineFieldValue(mp, 'context', 'int z;');
    expect(updated.includes).toBe('#include <stdio.h>');
  });
});

// ---------------------------------------------------------------------------
// buildRegex — isRegex mode
// ---------------------------------------------------------------------------

describe('buildRegex with isRegex mode', () => {
  const regexOpts = { caseSensitive: false, wholeWord: false, isRegex: true };

  it('treats the term as a raw regex pattern (dot matches any char)', () => {
    // Global-flag regex is stateful, so use a fresh instance per assertion
    expect(buildRegex('a.b', regexOpts)!.test('axb')).toBe(true);  // . matches x
    expect(buildRegex('a.b', regexOpts)!.test('a.b')).toBe(true);  // . also matches literal dot
  });

  it('returns null for an invalid regex', () => {
    expect(buildRegex('(unclosed', regexOpts)).toBeNull();
    expect(buildRegex('[bad', regexOpts)).toBeNull();
  });

  it('supports capture groups', () => {
    const re = buildRegex('(foo)', regexOpts)!;
    expect(re).not.toBeNull();
    expect(re.test('foo')).toBe(true);
  });

  it('has the global flag set', () => {
    const re = buildRegex('\\d+', regexOpts)!;
    expect(re.flags).toContain('g');
  });

  it('is case-insensitive when caseSensitive is false', () => {
    const re = buildRegex('FOO', regexOpts)!;
    expect(re.test('foo')).toBe(true);
  });

  it('is case-sensitive when caseSensitive is true', () => {
    const re = buildRegex('FOO', { ...regexOpts, caseSensitive: true })!;
    expect(re.test('foo')).toBe(false);
    expect(re.test('FOO')).toBe(true);
  });

  it('does not apply word-boundary wrapping even when wholeWord is set', () => {
    // wholeWord is ignored in regex mode — user controls the pattern
    const re = buildRegex('foo', { ...regexOpts, wholeWord: true })!;
    expect(re).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findMatchesInField — zero-length match protection
// ---------------------------------------------------------------------------

describe('findMatchesInField zero-length match protection', () => {
  it('does not hang on a zero-width match pattern', () => {
    const re = buildRegex('x*', { caseSensitive: false, wholeWord: false, isRegex: true })!;
    // x* can match empty string; findMatchesInField must not loop forever
    const matches = findMatchesInField('abc', re, 'n1', 'node', 'label');
    // Should return finite number of matches and complete
    expect(Array.isArray(matches)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeReplaceTerm
// ---------------------------------------------------------------------------

describe('normalizeReplaceTerm', () => {
  it('converts \\1 to $1', () => {
    expect(normalizeReplaceTerm('set(\\1)')).toBe('set($1)');
  });

  it('converts multiple back-references', () => {
    expect(normalizeReplaceTerm('\\1-\\2')).toBe('$1-$2');
  });

  it('leaves plain text unchanged', () => {
    expect(normalizeReplaceTerm('hello')).toBe('hello');
  });

  it('leaves $1 style references unchanged', () => {
    expect(normalizeReplaceTerm('set($1)')).toBe('set($1)');
  });
});

// ---------------------------------------------------------------------------
// getMatchContext
// ---------------------------------------------------------------------------

describe('getMatchContext', () => {
  it('returns correct before/match/after for short text', () => {
    const result = getMatchContext('hello world', 6, 11);
    expect(result.before).toBe('hello ');
    expect(result.matchText).toBe('world');
    expect(result.after).toBe('');
  });

  it('adds leading ellipsis when text before match is long', () => {
    const longBefore = 'a'.repeat(30) + 'MATCH' + 'b'.repeat(5);
    const result = getMatchContext(longBefore, 30, 35);
    expect(result.before.startsWith('\u2026')).toBe(true);
    expect(result.matchText).toBe('MATCH');
  });

  it('adds trailing ellipsis when text after match is long', () => {
    const longAfter = 'pre' + 'MATCH' + 'z'.repeat(30);
    const result = getMatchContext(longAfter, 3, 8);
    expect(result.after.endsWith('\u2026')).toBe(true);
  });

  it('does not add ellipsis when context fits within limit', () => {
    const result = getMatchContext('ab MATCH cd', 3, 8);
    expect(result.before).toBe('ab ');
    expect(result.after).toBe(' cd');
    expect(result.before.includes('\u2026')).toBe(false);
    expect(result.after.includes('\u2026')).toBe(false);
  });

  it('handles match at start of string', () => {
    const result = getMatchContext('MATCH rest', 0, 5);
    expect(result.before).toBe('');
    expect(result.matchText).toBe('MATCH');
    expect(result.after).toBe(' rest');
  });

  it('handles match at end of string', () => {
    const result = getMatchContext('start MATCH', 6, 11);
    expect(result.before).toBe('start ');
    expect(result.matchText).toBe('MATCH');
    expect(result.after).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getMatchLine
// ---------------------------------------------------------------------------

describe('getMatchLine', () => {
  it('returns the full single-line text when there are no newlines', () => {
    const result = getMatchLine('foo MATCH bar', 4, 9);
    expect(result.before).toBe('foo ');
    expect(result.matchText).toBe('MATCH');
    expect(result.after).toBe(' bar');
  });

  it('extracts only the line containing the match from multi-line text', () => {
    const text = 'line one\nfoo MATCH bar\nline three';
    const start = text.indexOf('MATCH');
    const end = start + 5;
    const result = getMatchLine(text, start, end);
    expect(result.before).toBe('foo ');
    expect(result.matchText).toBe('MATCH');
    expect(result.after).toBe(' bar');
  });

  it('handles match at the start of a line', () => {
    const text = 'first\nMATCH rest\nlast';
    const start = 6;
    const end = 11;
    const result = getMatchLine(text, start, end);
    expect(result.before).toBe('');
    expect(result.matchText).toBe('MATCH');
    expect(result.after).toBe(' rest');
  });

  it('handles match on the last line (no trailing newline)', () => {
    const text = 'first\nsecond MATCH';
    const start = text.indexOf('MATCH');
    const end = start + 5;
    const result = getMatchLine(text, start, end);
    expect(result.before).toBe('second ');
    expect(result.matchText).toBe('MATCH');
    expect(result.after).toBe('');
  });

  it('does not add ellipsis (unlike getMatchContext)', () => {
    const longLine = 'a'.repeat(100) + 'MATCH' + 'b'.repeat(100);
    const start = 100;
    const end = 105;
    const result = getMatchLine(longLine, start, end);
    expect(result.before).toBe('a'.repeat(100));
    expect(result.after).toBe('b'.repeat(100));
    expect(result.before.includes('\u2026')).toBe(false);
  });
});
