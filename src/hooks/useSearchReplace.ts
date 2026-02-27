import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { MachineProperties } from '../yamlConverter';
import { getAllDescendants } from '../utils/nodeUtils';

// --- Types ---

export type SearchScope =
  | { type: 'global' }
  | { type: 'selection'; nodeIds: string[]; edgeIds: string[] }
  | { type: 'field'; fieldName: string; ownerId: string; ownerKind: 'node' | 'edge' | 'machine' };

export interface SearchMatch {
  ownerId: string;          // node id, edge id, or 'machine'
  ownerKind: 'node' | 'edge' | 'machine';
  fieldName: string;        // e.g. 'label', 'entry', 'guard', 'context', 'hooks.entry'
  startIndex: number;
  endIndex: number;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface UseSearchReplaceParams {
  nodes: Node[];
  edges: Edge[];
  machineProperties: MachineProperties;
  setNodes: (updater: (nds: Node[]) => Node[]) => void;
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void;
  setMachineProperties: (updater: (prev: MachineProperties) => MachineProperties) => void;
  saveSnapshot: () => void;
  selectNode: (nodeId: string) => void;
  selectEdge: (edgeId: string) => void;
  zoomToNode: (nodeId: string) => void;
}

// --- Helpers ---

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegex(term: string, opts: SearchOptions): RegExp | null {
  if (!term) return null;
  let pattern = escapeRegex(term);
  if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
  return new RegExp(pattern, opts.caseSensitive ? 'g' : 'gi');
}

function findMatchesInField(
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

// Node fields to search
const NODE_FIELDS = ['label', 'entry', 'exit', 'do', 'annotation'] as const;
// Edge fields to search
const EDGE_FIELDS = ['guard', 'action'] as const;
// Machine properties fields to search (skip language/settings)
const MACHINE_FIELDS = ['includes', 'context', 'context_init', 'entry', 'exit', 'do'] as const;
const MACHINE_HOOK_FIELDS = ['hooks.entry', 'hooks.exit', 'hooks.do', 'hooks.transition'] as const;

function getMachineFieldValue(mp: MachineProperties, field: string): string {
  if (field.startsWith('hooks.')) {
    const key = field.split('.')[1] as keyof MachineProperties['hooks'];
    return mp.hooks[key] || '';
  }
  return (mp as Record<string, unknown>)[field] as string || '';
}

function setMachineFieldValue(mp: MachineProperties, field: string, value: string): MachineProperties {
  if (field.startsWith('hooks.')) {
    const key = field.split('.')[1] as keyof MachineProperties['hooks'];
    return { ...mp, hooks: { ...mp.hooks, [key]: value } };
  }
  return { ...mp, [field]: value };
}

// --- Hook ---

export function useSearchReplace(params: UseSearchReplaceParams) {
  const {
    nodes, edges, machineProperties,
    setNodes, setEdges, setMachineProperties,
    saveSnapshot, selectNode, selectEdge, zoomToNode,
  } = params;

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [options, setOptions] = useState<SearchOptions>({ caseSensitive: false, wholeWord: false });
  const [scope, setScope] = useState<SearchScope>({ type: 'global' });
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [replaceVersion, setReplaceVersion] = useState(0);

  // Debounced search term
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedTerm(searchTerm);
      setCurrentMatchIndex(0);
    }, 150);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchTerm]);

  // Detect scope from current context
  const detectScope = useCallback((): SearchScope => {
    const active = document.activeElement as HTMLElement | null;

    // Field mode: cursor is in a text field with data-field-name
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      const fieldName = active.getAttribute('data-field-name');
      const ownerId = active.getAttribute('data-owner-id');
      const ownerKind = active.getAttribute('data-owner-kind') as 'node' | 'edge' | 'machine' | null;
      if (fieldName && ownerId && ownerKind) {
        return { type: 'field', fieldName, ownerId, ownerKind };
      }
    }

    // Selection mode: selected nodes/edges
    const selectedNodes = nodes.filter(n => n.selected);
    const selectedEdges = edges.filter(e => e.selected);

    if (selectedNodes.length > 0 || selectedEdges.length > 0) {
      // Expand to include descendants of selected nodes
      const nodeIds = new Set<string>();
      for (const n of selectedNodes) {
        nodeIds.add(n.id);
        for (const desc of getAllDescendants(n.id, nodes)) {
          nodeIds.add(desc.id);
        }
      }

      // Include edges connected to any node in the set
      const edgeIds = new Set<string>(selectedEdges.map(e => e.id));
      for (const e of edges) {
        if (nodeIds.has(e.source) || nodeIds.has(e.target)) {
          edgeIds.add(e.id);
        }
      }

      return { type: 'selection', nodeIds: Array.from(nodeIds), edgeIds: Array.from(edgeIds) };
    }

    // Global mode
    return { type: 'global' };
  }, [nodes, edges]);

  // Open the search panel
  const openSearch = useCallback(() => {
    const newScope = detectScope();
    setScope(newScope);
    setIsOpen(true);
    setCurrentMatchIndex(0);
  }, [detectScope]);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Compute matches
  const matches = useMemo((): SearchMatch[] => {
    const regex = buildRegex(debouncedTerm, options);
    if (!regex) return [];

    const result: SearchMatch[] = [];

    const searchNode = (node: Node) => {
      if (node.type === 'decisionNode' || node.type === 'proxyNode') {
        // Only search label for decision/proxy
        const label = (node.data.label as string) || '';
        if (label) result.push(...findMatchesInField(label, regex, node.id, 'node', 'label'));
        return;
      }
      for (const field of NODE_FIELDS) {
        const val = (node.data[field] as string) || '';
        if (val) result.push(...findMatchesInField(val, regex, node.id, 'node', field));
      }
    };

    const searchEdge = (edge: Edge) => {
      for (const field of EDGE_FIELDS) {
        const val = (edge.data?.[field] as string) || '';
        if (val) result.push(...findMatchesInField(val, regex, edge.id, 'edge', field));
      }
    };

    const searchMachine = () => {
      for (const field of MACHINE_FIELDS) {
        const val = getMachineFieldValue(machineProperties, field);
        if (val) result.push(...findMatchesInField(val, regex, 'machine', 'machine', field));
      }
      for (const field of MACHINE_HOOK_FIELDS) {
        const val = getMachineFieldValue(machineProperties, field);
        if (val) result.push(...findMatchesInField(val, regex, 'machine', 'machine', field));
      }
    };

    if (scope.type === 'field') {
      // Single field
      let text = '';
      if (scope.ownerKind === 'node') {
        const node = nodes.find(n => n.id === scope.ownerId);
        text = (node?.data[scope.fieldName] as string) || '';
      } else if (scope.ownerKind === 'edge') {
        const edge = edges.find(e => e.id === scope.ownerId);
        text = (edge?.data?.[scope.fieldName] as string) || '';
      } else if (scope.ownerKind === 'machine') {
        text = getMachineFieldValue(machineProperties, scope.fieldName);
      }
      if (text) result.push(...findMatchesInField(text, regex, scope.ownerId, scope.ownerKind, scope.fieldName));
    } else if (scope.type === 'selection') {
      const nodeIdSet = new Set(scope.nodeIds);
      const edgeIdSet = new Set(scope.edgeIds);
      for (const node of nodes) {
        if (nodeIdSet.has(node.id)) searchNode(node);
      }
      for (const edge of edges) {
        if (edgeIdSet.has(edge.id)) searchEdge(edge);
      }
    } else {
      // Global
      for (const node of nodes) {
        if (node.type !== 'initialMarker' && node.type !== 'historyMarker') {
          searchNode(node);
        }
      }
      for (const edge of edges) searchEdge(edge);
      searchMachine();
    }

    return result;
  }, [debouncedTerm, options, scope, nodes, edges, machineProperties]);

  // Clamp current match index
  useEffect(() => {
    if (matches.length === 0) {
      setCurrentMatchIndex(0);
    } else if (currentMatchIndex >= matches.length) {
      setCurrentMatchIndex(0);
    }
  }, [matches.length, currentMatchIndex]);

  // Navigate to current match
  const navigateToMatch = useCallback((match: SearchMatch) => {
    if (match.ownerKind === 'node') {
      selectNode(match.ownerId);
      zoomToNode(match.ownerId);
    } else if (match.ownerKind === 'edge') {
      selectEdge(match.ownerId);
      // Zoom to the edge's source node for visibility
      const edge = edges.find(e => e.id === match.ownerId);
      if (edge) zoomToNode(edge.source);
    }
    // machine properties — no navigation needed
  }, [selectNode, selectEdge, zoomToNode, edges]);

  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIdx);
    navigateToMatch(matches[nextIdx]);
  }, [matches, currentMatchIndex, navigateToMatch]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    navigateToMatch(matches[prevIdx]);
  }, [matches, currentMatchIndex, navigateToMatch]);

  // Replace current match
  const replaceCurrent = useCallback(() => {
    if (matches.length === 0 || currentMatchIndex >= matches.length) return;
    const match = matches[currentMatchIndex];

    saveSnapshot();

    const doReplace = (text: string, m: SearchMatch): string => {
      return text.substring(0, m.startIndex) + replaceTerm + text.substring(m.endIndex);
    };

    if (match.ownerKind === 'node') {
      setNodes(nds => nds.map(n => {
        if (n.id !== match.ownerId) return n;
        const oldVal = (n.data[match.fieldName] as string) || '';
        return { ...n, data: { ...n.data, [match.fieldName]: doReplace(oldVal, match) } };
      }));
    } else if (match.ownerKind === 'edge') {
      setEdges(eds => eds.map(e => {
        if (e.id !== match.ownerId) return e;
        const oldVal = (e.data?.[match.fieldName] as string) || '';
        return { ...e, data: { ...e.data, [match.fieldName]: doReplace(oldVal, match) } };
      }));
    } else if (match.ownerKind === 'machine') {
      setMachineProperties(mp => {
        const oldVal = getMachineFieldValue(mp, match.fieldName);
        return setMachineFieldValue(mp, match.fieldName, doReplace(oldVal, match));
      });
    }

    setReplaceVersion(v => v + 1);

    // After replacing, if there are still matches, navigate
    // The match list will recompute; keep index in bounds
    if (currentMatchIndex >= matches.length - 1) {
      setCurrentMatchIndex(0);
    }
  }, [matches, currentMatchIndex, replaceTerm, saveSnapshot, setNodes, setEdges, setMachineProperties]);

  // Replace all matches
  const replaceAll = useCallback(() => {
    if (matches.length === 0) return;

    saveSnapshot();

    // Group matches by owner+field, then replace in reverse order within each field
    const grouped = new Map<string, SearchMatch[]>();
    for (const m of matches) {
      const key = `${m.ownerKind}:${m.ownerId}:${m.fieldName}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(m);
    }

    // Build replacement map: key -> new text
    const nodeReplacements = new Map<string, Record<string, string>>();
    const edgeReplacements = new Map<string, Record<string, string>>();
    const machineReplacements: Record<string, string> = {};

    for (const [, fieldMatches] of grouped) {
      // Sort by startIndex descending so replacements don't shift
      const sorted = [...fieldMatches].sort((a, b) => b.startIndex - a.startIndex);
      const first = sorted[0];

      // Get original text
      let text = '';
      if (first.ownerKind === 'node') {
        const node = nodes.find(n => n.id === first.ownerId);
        text = (node?.data[first.fieldName] as string) || '';
      } else if (first.ownerKind === 'edge') {
        const edge = edges.find(e => e.id === first.ownerId);
        text = (edge?.data?.[first.fieldName] as string) || '';
      } else {
        text = getMachineFieldValue(machineProperties, first.fieldName);
      }

      // Apply replacements in reverse order
      for (const m of sorted) {
        text = text.substring(0, m.startIndex) + replaceTerm + text.substring(m.endIndex);
      }

      if (first.ownerKind === 'node') {
        if (!nodeReplacements.has(first.ownerId)) nodeReplacements.set(first.ownerId, {});
        nodeReplacements.get(first.ownerId)![first.fieldName] = text;
      } else if (first.ownerKind === 'edge') {
        if (!edgeReplacements.has(first.ownerId)) edgeReplacements.set(first.ownerId, {});
        edgeReplacements.get(first.ownerId)![first.fieldName] = text;
      } else {
        machineReplacements[first.fieldName] = text;
      }
    }

    // Apply node replacements
    if (nodeReplacements.size > 0) {
      setNodes(nds => nds.map(n => {
        const repl = nodeReplacements.get(n.id);
        if (!repl) return n;
        return { ...n, data: { ...n.data, ...repl } };
      }));
    }

    // Apply edge replacements
    if (edgeReplacements.size > 0) {
      setEdges(eds => eds.map(e => {
        const repl = edgeReplacements.get(e.id);
        if (!repl) return e;
        return { ...e, data: { ...e.data, ...repl } };
      }));
    }

    // Apply machine replacements
    if (Object.keys(machineReplacements).length > 0) {
      setMachineProperties(mp => {
        let updated = mp;
        for (const [field, value] of Object.entries(machineReplacements)) {
          updated = setMachineFieldValue(updated, field, value);
        }
        return updated;
      });
    }

    setReplaceVersion(v => v + 1);
    setCurrentMatchIndex(0);
  }, [matches, replaceTerm, saveSnapshot, nodes, edges, machineProperties, setNodes, setEdges, setMachineProperties]);

  // Scope label for display
  const scopeLabel = useMemo((): string => {
    if (scope.type === 'field') {
      return `Field: ${scope.fieldName}`;
    }
    if (scope.type === 'selection') {
      const nodeCount = scope.nodeIds.length;
      const selectedNodes = nodes.filter(n => n.selected);
      if (selectedNodes.length === 1) {
        const name = selectedNodes[0].data.label || selectedNodes[0].id;
        return `${name} + children`;
      }
      return `${nodeCount} nodes`;
    }
    return 'All';
  }, [scope, nodes]);

  return {
    isOpen,
    searchTerm,
    setSearchTerm,
    replaceTerm,
    setReplaceTerm,
    options,
    setOptions,
    matches,
    currentMatchIndex,
    scopeLabel,
    replaceVersion,
    openSearch,
    closeSearch,
    goToNext,
    goToPrev,
    replaceCurrent,
    replaceAll,
    navigateToMatch,
  };
}
