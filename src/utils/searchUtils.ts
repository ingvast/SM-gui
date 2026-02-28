import { MachineProperties } from '../yamlConverter';
import { SearchMatch, SearchOptions } from '../hooks/useSearchReplace';

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRegex(term: string, opts: SearchOptions): RegExp | null {
  if (!term) return null;
  let pattern = escapeRegex(term);
  if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
  return new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi');
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
