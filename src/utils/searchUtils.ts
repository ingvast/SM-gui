import { MachineProperties } from '../yamlConverter';
import { SearchMatch, SearchOptions } from '../hooks/useSearchReplace';

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRegex(term: string, opts: SearchOptions): RegExp | null {
  if (!term) return null;
  try {
    let pattern = opts.isRegex ? term : escapeRegex(term);
    if (!opts.isRegex && opts.wholeWord) pattern = `\\b${pattern}\\b`;
    return new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi');
  } catch {
    return null; // Invalid regex pattern
  }
}

export function findMatchesInField(
  text: string,
  regex: RegExp,
  ownerId: string,
  ownerKind: 'node' | 'edge' | 'machine',
  fieldName: string,
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  let m: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m[0].length === 0) { regex.lastIndex++; continue; } // skip zero-width matches
    matches.push({ ownerId, ownerKind, fieldName, startIndex: m.index, endIndex: m.index + m[0].length });
  }
  return matches;
}

export function getMachineFieldValue(mp: MachineProperties, field: string): string {
  if (field.startsWith('hooks.')) {
    const key = field.split('.')[1] as keyof MachineProperties['hooks'];
    return mp.hooks[key] || '';
  }
  return (mp as Record<string, unknown>)[field] as string || '';
}

export function setMachineFieldValue(mp: MachineProperties, field: string, value: string): MachineProperties {
  if (field.startsWith('hooks.')) {
    const key = field.split('.')[1] as keyof MachineProperties['hooks'];
    return { ...mp, hooks: { ...mp.hooks, [key]: value } };
  }
  return { ...mp, [field]: value };
}

/** Normalize \1 → $1 etc. in a replacement string for use with String.replace() */
export function normalizeReplaceTerm(term: string): string {
  return term.replace(/\\(\d)/g, '$$$1');
}

const CONTEXT_CHARS = 25;

export function getMatchContext(
  text: string,
  startIndex: number,
  endIndex: number,
): { before: string; matchText: string; after: string } {
  const rawBefore = text.substring(Math.max(0, startIndex - CONTEXT_CHARS), startIndex);
  const matchText = text.substring(startIndex, endIndex);
  const rawAfter = text.substring(endIndex, Math.min(text.length, endIndex + CONTEXT_CHARS));
  return {
    before: startIndex > CONTEXT_CHARS ? '\u2026' + rawBefore : rawBefore,
    matchText,
    after: endIndex + CONTEXT_CHARS < text.length ? rawAfter + '\u2026' : rawAfter,
  };
}

/** Return the full line (up to the nearest newlines) that contains the match. */
export function getMatchLine(
  text: string,
  startIndex: number,
  endIndex: number,
): { before: string; matchText: string; after: string } {
  const lineStart = text.lastIndexOf('\n', startIndex - 1) + 1;
  const lineEndRaw = text.indexOf('\n', endIndex);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  return {
    before: text.substring(lineStart, startIndex),
    matchText: text.substring(startIndex, endIndex),
    after: text.substring(endIndex, lineEnd),
  };
}
