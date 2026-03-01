import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { Node, Edge } from 'reactflow';
import { MachineProperties } from '../yamlConverter';

// Lazy-cached parsers — created once on first use
type LezerParser = ReturnType<typeof python>['language']['parser'];
const parserCache: Partial<Record<string, LezerParser>> = {};

function getParser(language: string): LezerParser | null {
  const key = language.toLowerCase();
  if (key in parserCache) return parserCache[key] ?? null;
  let parser: LezerParser | null = null;
  switch (key) {
    case 'python': parser = python().language.parser; break;
    case 'c':
    case 'cpp': parser = cpp().language.parser; break;
    case 'rust': parser = rust().language.parser; break;
  }
  parserCache[key] = parser ?? undefined;
  return parser;
}

function hasSyntaxErrors(code: string, language: string): boolean {
  if (!code.trim()) return false;
  const parser = getParser(language);
  if (!parser) return false;
  const tree = parser.parse(code);
  let found = false;
  tree.cursor().iterate((node) => {
    if (found) return false; // early exit
    if (node.type.isError && node.to > node.from) found = true;
  });
  return found;
}

function nodeAbsPath(nodeId: string, nodes: Node[]): string {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return nodeId;
  const d = node.data as Record<string, unknown>;
  const parts: string[] = [(d.label as string) || nodeId];
  let cur = node;
  while (cur.parentId) {
    const parent = nodes.find(n => n.id === cur.parentId);
    if (!parent || parent.id === '/') break;
    const pd = parent.data as Record<string, unknown>;
    parts.unshift((pd.label as string) || parent.id);
    cur = parent;
  }
  return parts.join('/');
}

/**
 * Returns a list of human-readable descriptions for every code field that
 * contains at least one syntax error, e.g.:
 *   "State 'Root/Idle': entry"
 *   "Transition 'Idle → Running': guard"
 *   "Machine: hooks.entry"
 */
export function findSyntaxErrors(
  nodes: Node[],
  edges: Edge[],
  machineProperties: MachineProperties,
): string[] {
  const lang = machineProperties.language;
  if (!lang) return [];

  const errors: string[] = [];

  // State nodes (skip root, decisions, proxies)
  for (const node of nodes) {
    if (node.id === '/') continue;
    if (node.type && node.type !== 'stateNode') continue;
    const d = node.data as Record<string, unknown>;
    const label = `State '${nodeAbsPath(node.id, nodes)}'`;
    for (const field of ['entry', 'exit', 'do'] as const) {
      if (hasSyntaxErrors((d[field] as string) || '', lang)) {
        errors.push(`${label}: ${field}`);
      }
    }
  }

  // Edges
  for (const edge of edges) {
    const srcPath = nodeAbsPath(edge.source, nodes);
    const tgtNode = nodes.find(n => n.id === edge.target);
    const tgtPath = tgtNode?.type === 'proxyNode'
      ? ((tgtNode.data as Record<string, unknown>).targetPath as string) || edge.target
      : nodeAbsPath(edge.target, nodes);
    const label = `Transition '${srcPath} → ${tgtPath}'`;
    if (hasSyntaxErrors((edge.data?.guard as string) || '', lang)) {
      errors.push(`${label}: guard`);
    }
    if (hasSyntaxErrors((edge.data?.action as string) || '', lang)) {
      errors.push(`${label}: action`);
    }
  }

  // Machine-level fields
  const machineFields: [string, string][] = [
    ['entry',            machineProperties.entry],
    ['exit',             machineProperties.exit],
    ['do',               machineProperties.do],
    ['hooks.entry',      machineProperties.hooks.entry],
    ['hooks.exit',       machineProperties.hooks.exit],
    ['hooks.do',         machineProperties.hooks.do],
    ['hooks.transition', machineProperties.hooks.transition],
    ['includes',         machineProperties.includes],
    ['context',          machineProperties.context],
    ['context_init',     machineProperties.context_init],
  ];
  for (const [fieldName, value] of machineFields) {
    if (hasSyntaxErrors(value, lang)) {
      errors.push(`Machine: ${fieldName}`);
    }
  }

  return errors;
}
