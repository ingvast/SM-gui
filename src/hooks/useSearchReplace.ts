import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { MachineProperties } from '../yamlConverter';
import { getAllDescendants, computeNodePath } from '../utils/nodeUtils';
import {
  buildRegex,
  findMatchesInField,
  getMachineFieldValue,
  setMachineFieldValue,
  normalizeReplaceTerm,
  getMatchLine,
} from '../utils/searchUtils';

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

export interface SearchMatchDisplay {
  index: number;
  ownerLabel: string;    // "StateA", "A → B", "Machine"
  fieldLabel: string;    // "entry", "guard", etc.
  contextBefore: string;
  matchText: string;
  contextAfter: string;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  isRegex?: boolean;
  fieldFilter?: string[] | null; // null/undefined = all fields; array = whitelist of field names
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
  zoomToEdge?: (edgeId: string) => void;
}

// Node fields to search
const NODE_FIELDS = ['label', 'entry', 'exit', 'do', 'annotation'] as const;
// Edge fields to search
const EDGE_FIELDS = ['guard', 'action'] as const;
// Machine properties fields to search (skip language/settings)
const MACHINE_FIELDS = ['includes', 'context', 'context_init', 'entry', 'exit', 'do'] as const;
const MACHINE_HOOK_FIELDS = ['hooks.entry', 'hooks.exit', 'hooks.do', 'hooks.transition'] as const;

// --- Hook ---

export function useSearchReplace(params: UseSearchReplaceParams) {
  const {
    nodes, edges, machineProperties,
    setNodes, setEdges, setMachineProperties,
    saveSnapshot, selectNode, selectEdge, zoomToNode, zoomToEdge,
  } = params;

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [options, setOptions] = useState<SearchOptions>({ caseSensitive: false, wholeWord: false, isRegex: false });
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
    const ff = options.fieldFilter ?? null;
    const fieldOk = (f: string) => !ff || ff.includes(f);

    const searchNode = (node: Node) => {
      if (node.type === 'decisionNode' || node.type === 'proxyNode') {
        // Only search label for decision/proxy
        if (fieldOk('label')) {
          const label = (node.data.label as string) || '';
          if (label) result.push(...findMatchesInField(label, regex, node.id, 'node', 'label'));
        }
        return;
      }
      for (const field of NODE_FIELDS) {
        if (!fieldOk(field)) continue;
        const val = (node.data[field] as string) || '';
        if (val) result.push(...findMatchesInField(val, regex, node.id, 'node', field));
      }
    };

    const searchEdge = (edge: Edge) => {
      for (const field of EDGE_FIELDS) {
        if (!fieldOk(field)) continue;
        const val = (edge.data?.[field] as string) || '';
        if (val) result.push(...findMatchesInField(val, regex, edge.id, 'edge', field));
      }
    };

    const searchMachine = () => {
      for (const field of MACHINE_FIELDS) {
        if (!fieldOk(field)) continue;
        const val = getMachineFieldValue(machineProperties, field);
        if (val) result.push(...findMatchesInField(val, regex, 'machine', 'machine', field));
      }
      for (const field of MACHINE_HOOK_FIELDS) {
        if (!fieldOk(field)) continue;
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

  // Whether the current regex term is invalid (isRegex mode only)
  const regexError = useMemo((): boolean => {
    if (!options.isRegex || !debouncedTerm) return false;
    return buildRegex(debouncedTerm, options) === null;
  }, [options, debouncedTerm]);

  // Navigate to current match
  const navigateToMatch = useCallback((match: SearchMatch) => {
    if (match.ownerKind === 'node') {
      selectNode(match.ownerId);
      zoomToNode(match.ownerId);
    } else if (match.ownerKind === 'edge') {
      selectEdge(match.ownerId);
      if (zoomToEdge) {
        zoomToEdge(match.ownerId);
      } else {
        const edge = edges.find(e => e.id === match.ownerId);
        if (edge) zoomToNode(edge.source);
      }
    }
    // machine properties — no navigation needed
  }, [selectNode, selectEdge, zoomToNode, zoomToEdge, edges]);

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

  const navigateToMatchByIndex = useCallback((index: number) => {
    if (index < 0 || index >= matches.length) return;
    setCurrentMatchIndex(index);
    navigateToMatch(matches[index]);
  }, [matches, navigateToMatch]);

  // Apply a single replacement, supporting regex group references
  const applyOneReplacement = useCallback((text: string, match: SearchMatch): string => {
    if (options.isRegex) {
      const regex = buildRegex(debouncedTerm, options);
      if (!regex) return text;
      const normalizedTerm = normalizeReplaceTerm(replaceTerm);
      const singleFlags = regex.flags.replace('g', '');
      const singleRegex = new RegExp(regex.source, singleFlags);
      const matchedText = text.substring(match.startIndex, match.endIndex);
      return text.substring(0, match.startIndex) + matchedText.replace(singleRegex, normalizedTerm) + text.substring(match.endIndex);
    }
    return text.substring(0, match.startIndex) + replaceTerm + text.substring(match.endIndex);
  }, [options, debouncedTerm, replaceTerm]);

  // Replace current match
  const replaceCurrent = useCallback(() => {
    if (matches.length === 0 || currentMatchIndex >= matches.length) return;
    const match = matches[currentMatchIndex];

    saveSnapshot();

    if (match.ownerKind === 'node') {
      setNodes(nds => nds.map(n => {
        if (n.id !== match.ownerId) return n;
        const oldVal = (n.data[match.fieldName] as string) || '';
        return { ...n, data: { ...n.data, [match.fieldName]: applyOneReplacement(oldVal, match) } };
      }));
    } else if (match.ownerKind === 'edge') {
      setEdges(eds => eds.map(e => {
        if (e.id !== match.ownerId) return e;
        const oldVal = (e.data?.[match.fieldName] as string) || '';
        return { ...e, data: { ...e.data, [match.fieldName]: applyOneReplacement(oldVal, match) } };
      }));
    } else if (match.ownerKind === 'machine') {
      setMachineProperties(mp => {
        const oldVal = getMachineFieldValue(mp, match.fieldName);
        return setMachineFieldValue(mp, match.fieldName, applyOneReplacement(oldVal, match));
      });
    }

    setReplaceVersion(v => v + 1);

    // After replacing, keep index in bounds
    if (currentMatchIndex >= matches.length - 1) {
      setCurrentMatchIndex(0);
    }
  }, [matches, currentMatchIndex, applyOneReplacement, saveSnapshot, setNodes, setEdges, setMachineProperties]);

  // Replace all matches
  const replaceAll = useCallback(() => {
    if (matches.length === 0) return;

    saveSnapshot();

    if (options.isRegex) {
      // Regex mode: apply global replace on each unique field
      const regex = buildRegex(debouncedTerm, options);
      if (!regex) return;
      const normalizedTerm = normalizeReplaceTerm(replaceTerm);

      const nodeUpdates = new Map<string, Record<string, string>>();
      const edgeUpdates = new Map<string, Record<string, string>>();
      const machineUpdates: Record<string, string> = {};

      const seen = new Set<string>();
      for (const m of matches) {
        const key = `${m.ownerKind}:${m.ownerId}:${m.fieldName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        regex.lastIndex = 0;

        if (m.ownerKind === 'node') {
          const node = nodes.find(n => n.id === m.ownerId);
          const text = (node?.data[m.fieldName] as string) || '';
          if (!nodeUpdates.has(m.ownerId)) nodeUpdates.set(m.ownerId, {});
          nodeUpdates.get(m.ownerId)![m.fieldName] = text.replace(regex, normalizedTerm);
        } else if (m.ownerKind === 'edge') {
          const edge = edges.find(e => e.id === m.ownerId);
          const text = (edge?.data?.[m.fieldName] as string) || '';
          if (!edgeUpdates.has(m.ownerId)) edgeUpdates.set(m.ownerId, {});
          edgeUpdates.get(m.ownerId)![m.fieldName] = text.replace(regex, normalizedTerm);
        } else {
          const text = getMachineFieldValue(machineProperties, m.fieldName);
          machineUpdates[m.fieldName] = text.replace(regex, normalizedTerm);
        }
      }

      if (nodeUpdates.size > 0) {
        setNodes(nds => nds.map(n => {
          const repl = nodeUpdates.get(n.id);
          return repl ? { ...n, data: { ...n.data, ...repl } } : n;
        }));
      }
      if (edgeUpdates.size > 0) {
        setEdges(eds => eds.map(e => {
          const repl = edgeUpdates.get(e.id);
          return repl ? { ...e, data: { ...e.data, ...repl } } : e;
        }));
      }
      if (Object.keys(machineUpdates).length > 0) {
        setMachineProperties(mp => {
          let updated = mp;
          for (const [field, value] of Object.entries(machineUpdates)) {
            updated = setMachineFieldValue(updated, field, value);
          }
          return updated;
        });
      }

      setReplaceVersion(v => v + 1);
      setCurrentMatchIndex(0);
      return;
    }

    // Non-regex mode: replace in reverse order to preserve indices
    const grouped = new Map<string, SearchMatch[]>();
    for (const m of matches) {
      const key = `${m.ownerKind}:${m.ownerId}:${m.fieldName}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(m);
    }

    const nodeReplacements = new Map<string, Record<string, string>>();
    const edgeReplacements = new Map<string, Record<string, string>>();
    const machineReplacements: Record<string, string> = {};

    for (const [, fieldMatches] of grouped) {
      // Sort by startIndex descending so replacements don't shift earlier positions
      const sorted = [...fieldMatches].sort((a, b) => b.startIndex - a.startIndex);
      const first = sorted[0];

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

    if (nodeReplacements.size > 0) {
      setNodes(nds => nds.map(n => {
        const repl = nodeReplacements.get(n.id);
        if (!repl) return n;
        return { ...n, data: { ...n.data, ...repl } };
      }));
    }
    if (edgeReplacements.size > 0) {
      setEdges(eds => eds.map(e => {
        const repl = edgeReplacements.get(e.id);
        if (!repl) return e;
        return { ...e, data: { ...e.data, ...repl } };
      }));
    }
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
  }, [matches, replaceTerm, debouncedTerm, options, saveSnapshot, nodes, edges, machineProperties, setNodes, setEdges, setMachineProperties]);

  // Display info for each match (full-path owner label, field, full line context)
  const matchDisplays = useMemo((): SearchMatchDisplay[] => {
    return matches.map((m, index) => {
      let text = '';
      let ownerLabel = '';

      if (m.ownerKind === 'node') {
        const node = nodes.find(n => n.id === m.ownerId);
        ownerLabel = computeNodePath(m.ownerId, nodes) || (node?.data.label as string) || m.ownerId;
        text = (node?.data[m.fieldName] as string) || '';
      } else if (m.ownerKind === 'edge') {
        const edge = edges.find(e => e.id === m.ownerId);
        if (edge) {
          const srcPath = computeNodePath(edge.source, nodes) || edge.source;
          const tgtPath = computeNodePath(edge.target, nodes) || edge.target;
          ownerLabel = `${srcPath} \u2192 ${tgtPath}`;
          text = (edge.data?.[m.fieldName] as string) || '';
        }
      } else {
        ownerLabel = 'Machine';
        text = getMachineFieldValue(machineProperties, m.fieldName);
      }

      const { before, matchText, after } = getMatchLine(text, m.startIndex, m.endIndex);
      return { index, ownerLabel, fieldLabel: m.fieldName, contextBefore: before, matchText, contextAfter: after };
    });
  }, [matches, nodes, edges, machineProperties]);

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
    matchDisplays,
    currentMatchIndex,
    scopeLabel,
    replaceVersion,
    regexError,
    openSearch,
    closeSearch,
    goToNext,
    goToPrev,
    replaceCurrent,
    replaceAll,
    navigateToMatch,
    navigateToMatchByIndex,
  };
}
