import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from 'reactflow';
import { useClipboard } from './useClipboard';
import { resetIdCounter } from '../utils/idCounters';

// ---------------------------------------------------------------------------
// Clipboard mock — survives multiple read/write calls within one test
// ---------------------------------------------------------------------------
let clipboardText = '';
beforeEach(() => {
  clipboardText = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (t: string) => { clipboardText = t; }),
      readText: vi.fn(async () => clipboardText),
    },
  });
  // Reset id counter to a known state so generated ids are deterministic.
  resetIdCounter(1000);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(id: string, label: string, parentId?: string, extra: Partial<Node['data']> = {}): Node {
  return {
    id,
    type: 'stateNode',
    position: { x: 0, y: 0 },
    data: { label, history: false, entry: '', exit: '', do: '', ...extra },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    style: { width: 200, height: 100 },
  };
}

function makeDecision(id: string, label: string, parentId?: string): Node {
  return {
    id,
    type: 'decisionNode',
    position: { x: 0, y: 0 },
    data: { label },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    style: { width: 15, height: 15 },
  };
}

interface Harness {
  nodes: Node[];
  edges: Edge[];
  hook: ReturnType<typeof useClipboard>;
}

function setupHook(initialNodes: Node[], initialEdges: Edge[] = []): Harness {
  const state = { nodes: initialNodes, edges: initialEdges };
  const setNodes = (updater: (n: Node[]) => Node[]) => { state.nodes = updater(state.nodes); };
  const setEdges = (updater: (e: Edge[]) => Edge[]) => { state.edges = updater(state.edges); };
  const setSelected = vi.fn();
  const saveSnapshot = vi.fn();

  const { result, rerender } = renderHook(
    ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) =>
      useClipboard(nodes, edges, setNodes, setEdges, setSelected, saveSnapshot),
    { initialProps: { nodes: state.nodes, edges: state.edges } },
  );

  return new Proxy({} as Harness, {
    get(_, key) {
      if (key === 'nodes') return state.nodes;
      if (key === 'edges') return state.edges;
      if (key === 'hook') {
        // Re-render hook with current nodes/edges so the closures see latest state.
        rerender({ nodes: state.nodes, edges: state.edges });
        return result.current;
      }
      return undefined;
    },
  });
}

function selectOnly(nodes: Node[], ...ids: string[]): Node[] {
  const set = new Set(ids);
  return nodes.map(n => ({ ...n, selected: set.has(n.id) }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useClipboard — duplicate', () => {
  it('duplicates a root state as a sibling at root', async () => {
    const initial = [makeState('a', 'A')];
    const h = setupHook(selectOnly(initial, 'a'));
    await act(async () => { h.hook.handleDuplicate(); });

    expect(h.nodes).toHaveLength(2);
    const dup = h.nodes.find(n => n.id !== 'a')!;
    expect(dup.parentId).toBeUndefined();
    expect(dup.data.label).not.toBe('A');
  });

  it('duplicates a nested state as a sibling under the SAME parent (not orphan to root)', async () => {
    const initial = [
      makeState('p', 'Parent'),
      makeState('c', 'Child', 'p'),
    ];
    const h = setupHook(selectOnly(initial, 'c'));
    await act(async () => { h.hook.handleDuplicate(); });

    expect(h.nodes).toHaveLength(3);
    const dup = h.nodes.find(n => n.id !== 'p' && n.id !== 'c')!;
    expect(dup.parentId).toBe('p');
    expect(dup.extent).toBe('parent');
    expect(dup.data.label).not.toBe('Child');
  });

  it('duplicates a composite (parent+children) at root as a sibling at root', async () => {
    const initial = [
      makeState('p', 'Parent'),
      makeState('c', 'Child', 'p'),
    ];
    const h = setupHook(selectOnly(initial, 'p'));
    await act(async () => { h.hook.handleDuplicate(); });

    expect(h.nodes).toHaveLength(4);
    const newParent = h.nodes.find(n => n.id !== 'p' && !n.parentId && n.type === 'stateNode')!;
    expect(newParent).toBeDefined();
    expect(newParent.parentId).toBeUndefined();
    expect(newParent.data.label).not.toBe('Parent');

    const newChild = h.nodes.find(n => n.parentId === newParent.id);
    expect(newChild).toBeDefined();
    expect(newChild!.data.label).toBe('Child'); // child is unique under new parent
  });

  it('duplicates a nested composite as sibling under same grandparent', async () => {
    const initial = [
      makeState('gp', 'GP'),
      makeState('p', 'Parent', 'gp'),
      makeState('c', 'Child', 'p'),
    ];
    const h = setupHook(selectOnly(initial, 'p'));
    await act(async () => { h.hook.handleDuplicate(); });

    const newParent = h.nodes.find(n => n.id !== 'p' && n.parentId === 'gp')!;
    expect(newParent).toBeDefined();
    expect(newParent.data.label).not.toBe('Parent');
    const newChild = h.nodes.find(n => n.parentId === newParent.id);
    expect(newChild).toBeDefined();
  });

  it('remaps data.initial to the new child id when duplicating a composite', async () => {
    const initial = [
      makeState('p', 'Parent', undefined, { initial: 'c', initialMarkerPos: { x: 5, y: 5 } }),
      makeState('c', 'Child', 'p'),
    ];
    const h = setupHook(selectOnly(initial, 'p'));
    await act(async () => { h.hook.handleDuplicate(); });

    const newParent = h.nodes.find(n => n.id !== 'p' && !n.parentId)!;
    const newChild = h.nodes.find(n => n.parentId === newParent.id)!;
    expect(newParent.data.initial).toBe(newChild.id);
    // Original parent's initial reference must not be touched.
    const origParent = h.nodes.find(n => n.id === 'p')!;
    expect(origParent.data.initial).toBe('c');
  });

  it('gives duplicated decisions globally-unique labels (YAML @-references are unscoped)', async () => {
    const initial = [
      makeState('p', 'Parent'),
      makeState('c', 'Child', 'p'),
      makeDecision('d1', 'D1', 'p'),
    ];
    const h = setupHook(selectOnly(initial, 'p'));
    await act(async () => { h.hook.handleDuplicate(); });

    const allDecisions = h.nodes.filter(n => n.type === 'decisionNode');
    expect(allDecisions).toHaveLength(2);
    const labels = allDecisions.map(d => d.data.label as string);
    expect(new Set(labels).size).toBe(2); // globally unique
    expect(labels).toContain('D1');
  });

  it('renames a duplicated root-level decision to avoid label collision', async () => {
    const initial = [makeDecision('d1', 'D1')];
    const h = setupHook(selectOnly(initial, 'd1'));
    await act(async () => { h.hook.handleDuplicate(); });

    const decisions = h.nodes.filter(n => n.type === 'decisionNode');
    expect(decisions).toHaveLength(2);
    const labels = decisions.map(d => d.data.label).sort();
    expect(new Set(labels).size).toBe(2); // unique
    expect(labels).toContain('D1');
  });

  it('gives parallel duplicated edges distinct ids (no React key collision)', async () => {
    const initial = [
      makeState('p', 'Parent'),
      makeState('a', 'A', 'p'),
      makeState('b', 'B', 'p'),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'b' },
    ];
    const h = setupHook(selectOnly(initial, 'p'), edges);
    await act(async () => { h.hook.handleDuplicate(); });

    const allIds = h.edges.map(e => e.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(h.edges).toHaveLength(4);
  });

  it('keeps internal edges between duplicated children', async () => {
    const initial = [
      makeState('p', 'Parent'),
      makeState('a', 'A', 'p'),
      makeState('b', 'B', 'p'),
    ];
    const edges: Edge[] = [{ id: 'ea-b', source: 'a', target: 'b' }];
    const h = setupHook(selectOnly(initial, 'p'), edges);
    await act(async () => { h.hook.handleDuplicate(); });

    const newParent = h.nodes.find(n => n.id !== 'p' && !n.parentId)!;
    const newChildren = h.nodes.filter(n => n.parentId === newParent.id);
    expect(newChildren).toHaveLength(2);
    const aNew = newChildren.find(n => n.data.label === 'A')!;
    const bNew = newChildren.find(n => n.data.label === 'B')!;
    const dupEdge = h.edges.find(e => e.source === aNew.id && e.target === bNew.id);
    expect(dupEdge).toBeDefined();
  });
});

describe('useClipboard — copy/paste', () => {
  it('pastes a copied composite with remapped data.initial', async () => {
    const initial = [
      makeState('p', 'Parent', undefined, { initial: 'c', initialMarkerPos: { x: 5, y: 5 } }),
      makeState('c', 'Child', 'p'),
    ];
    const h = setupHook(selectOnly(initial, 'p'));
    await act(async () => { await h.hook.handleCopy(); });
    // Deselect before paste so paste doesn't reparent
    (h as unknown as { nodes: Node[] }).nodes = h.nodes.map(n => ({ ...n, selected: false }));
    await act(async () => { await h.hook.handlePaste(); });

    const newParent = h.nodes.find(n => n.id !== 'p' && !n.parentId && n.type === 'stateNode')!;
    expect(newParent).toBeDefined();
    const newChild = h.nodes.find(n => n.parentId === newParent.id)!;
    expect(newParent.data.initial).toBe(newChild.id);
  });

  it('places paste at the supplied cursor world position (root-level)', async () => {
    const a = makeState('a', 'A');
    a.position = { x: 100, y: 200 };
    const h = setupHook(selectOnly([a], 'a'));
    await act(async () => { await h.hook.handleCopy(); });
    (h as unknown as { nodes: Node[] }).nodes = h.nodes.map(n => ({ ...n, selected: false }));
    await act(async () => { await h.hook.handlePaste({ x: 500, y: 600 }); });

    const pasted = h.nodes.find(n => n.id !== 'a')!;
    expect(pasted.position).toEqual({ x: 500, y: 600 });
  });

  it('preserves relative layout of a composite when placed at cursor', async () => {
    const p = makeState('p', 'Parent'); p.position = { x: 100, y: 100 };
    const c = makeState('c', 'Child', 'p'); c.position = { x: 20, y: 30 };
    const h = setupHook(selectOnly([p, c], 'p'));
    await act(async () => { await h.hook.handleCopy(); });
    (h as unknown as { nodes: Node[] }).nodes = h.nodes.map(n => ({ ...n, selected: false }));
    await act(async () => { await h.hook.handlePaste({ x: 700, y: 800 }); });

    const newParent = h.nodes.find(n => n.id !== 'p' && !n.parentId)!;
    expect(newParent.position).toEqual({ x: 700, y: 800 });
    const newChild = h.nodes.find(n => n.parentId === newParent.id)!;
    // Child position is parent-relative and should be unchanged.
    expect(newChild.position).toEqual({ x: 20, y: 30 });
  });

  it('pastes a composite containing decisions, decisions follow new parent', async () => {
    const initial = [
      makeState('p', 'Parent'),
      makeDecision('d1', 'D1', 'p'),
    ];
    const h = setupHook(selectOnly(initial, 'p'));
    await act(async () => { await h.hook.handleCopy(); });
    (h as unknown as { nodes: Node[] }).nodes = h.nodes.map(n => ({ ...n, selected: false }));
    await act(async () => { await h.hook.handlePaste(); });

    const newParent = h.nodes.find(n => n.id !== 'p' && !n.parentId && n.type === 'stateNode')!;
    const newDecisions = h.nodes.filter(n => n.type === 'decisionNode' && n.parentId === newParent.id);
    expect(newDecisions).toHaveLength(1);
  });
});
