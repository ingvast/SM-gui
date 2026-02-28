import { describe, it, expect } from 'vitest';
import {
  escapeRegex,
  buildRegex,
  findMatchesInField,
  getMachineFieldValue,
  setMachineFieldValue,
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
