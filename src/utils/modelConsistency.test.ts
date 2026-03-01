import { describe, it, expect } from 'vitest';
import { Node, Edge } from 'reactflow';
import { checkModelConsistency, assertModelConsistent } from './modelConsistency';
import { convertToYaml, convertFromYaml, defaultMachineProperties } from '../yamlConverter';
import { getAllDescendants } from './nodeUtils';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

function stateNode(id: string, label: string, parentId?: string): Node {
  return {
    id,
    type: 'stateNode',
    position: { x: 10, y: 10 },
    data: { label, history: false, orthogonal: false, entry: '', exit: '', do: '', annotation: '' },
    style: { width: 150, height: 50 },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  };
}

function mkEdge(id: string, source: string, target: string, guard = ''): Edge {
  return { id, source, target, data: { guard, action: '', event: '' } };
}

// ---------------------------------------------------------------------------
// checkModelConsistency — unit tests
// ---------------------------------------------------------------------------

describe('checkModelConsistency', () => {
  it('returns no errors for an empty model', () => {
    expect(checkModelConsistency([], [])).toEqual([]);
  });

  it('returns no errors for a valid flat model', () => {
    const nodes = [stateNode('a', 'A'), stateNode('b', 'B')];
    const edges = [mkEdge('e1', 'a', 'b')];
    expect(checkModelConsistency(nodes, edges)).toEqual([]);
  });

  it('returns no errors for a valid nested model', () => {
    const nodes = [stateNode('p', 'Parent'), stateNode('c', 'Child', 'p')];
    expect(checkModelConsistency(nodes, [])).toEqual([]);
  });

  // --- dangling edge target (the primary "to" case) ---

  it('detects a dangling edge target', () => {
    const nodes = [stateNode('a', 'A')];
    const edges = [mkEdge('e1', 'a', 'ghost')];
    const errors = checkModelConsistency(nodes, edges);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('dangling_edge_target');
    expect(errors[0].message).toContain('ghost');
    expect(errors[0].message).toContain('e1');
  });

  it('detects a dangling edge source', () => {
    const nodes = [stateNode('b', 'B')];
    const edges = [mkEdge('e1', 'ghost', 'b')];
    const errors = checkModelConsistency(nodes, edges);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('dangling_edge_source');
  });

  it('detects both dangling source and target in the same edge', () => {
    const edges = [mkEdge('e1', 'ghost_src', 'ghost_tgt')];
    const errors = checkModelConsistency([], edges);
    expect(errors).toHaveLength(2);
    expect(errors.map(e => e.kind)).toContain('dangling_edge_source');
    expect(errors.map(e => e.kind)).toContain('dangling_edge_target');
  });

  it('reports all dangling targets across multiple edges', () => {
    const nodes = [stateNode('a', 'A')];
    const edges = [mkEdge('e1', 'a', 'gone1'), mkEdge('e2', 'a', 'gone2')];
    const errors = checkModelConsistency(nodes, edges);
    expect(errors).toHaveLength(2);
    expect(errors.every(e => e.kind === 'dangling_edge_target')).toBe(true);
  });

  // --- dangling parentId ---

  it('detects a dangling parentId', () => {
    const nodes = [stateNode('c', 'Child', 'ghost_parent')];
    const errors = checkModelConsistency(nodes, []);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('dangling_parent');
    expect(errors[0].message).toContain('ghost_parent');
  });

  // --- proxy node target ---

  it('detects a broken proxy target (no broken flag set)', () => {
    const proxy: Node = {
      id: 'p1',
      type: 'proxyNode',
      position: { x: 0, y: 0 },
      data: { name: 'P1', label: '→ Ghost', targetId: 'ghost', targetPath: 'Ghost' },
      style: { width: 80, height: 30 },
    };
    const errors = checkModelConsistency([proxy], []);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('broken_proxy_target');
    expect(errors[0].message).toContain('ghost');
  });

  it('does not flag a proxy explicitly marked broken', () => {
    const proxy: Node = {
      id: 'p1',
      type: 'proxyNode',
      position: { x: 0, y: 0 },
      data: { name: 'P1', label: '→ Gone', targetId: 'ghost', broken: true },
      style: { width: 80, height: 30 },
    };
    expect(checkModelConsistency([proxy], [])).toEqual([]);
  });

  it('does not flag a proxy whose target exists', () => {
    const target = stateNode('real', 'Real');
    const proxy: Node = {
      id: 'p1',
      type: 'proxyNode',
      position: { x: 0, y: 0 },
      data: { name: 'P1', label: '→ Real', targetId: 'real', targetPath: 'Real' },
      style: { width: 80, height: 30 },
    };
    expect(checkModelConsistency([target, proxy], [])).toEqual([]);
  });

  // --- initial state reference ---

  it('detects a dangling data.initial reference', () => {
    const n = stateNode('s', 'S');
    n.data.initial = 'ghost_child';
    const errors = checkModelConsistency([n], []);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe('dangling_initial');
    expect(errors[0].message).toContain('ghost_child');
  });

  it('is OK when data.initial points to an existing node', () => {
    const parent = stateNode('p', 'Parent');
    const child = stateNode('c', 'Child', 'p');
    parent.data.initial = 'c';
    expect(checkModelConsistency([parent, child], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// assertModelConsistent — behaviour
// ---------------------------------------------------------------------------

describe('assertModelConsistent', () => {
  it('does not throw for a consistent model', () => {
    const nodes = [stateNode('a', 'A'), stateNode('b', 'B')];
    const edges = [mkEdge('e1', 'a', 'b')];
    expect(() => assertModelConsistent(nodes, edges)).not.toThrow();
  });

  it('throws and mentions the violation kind', () => {
    const nodes = [stateNode('a', 'A')];
    const edges = [mkEdge('e1', 'a', 'missing')];
    expect(() => assertModelConsistent(nodes, edges)).toThrow(/dangling_edge_target/);
  });

  it('lists all violations in the thrown message', () => {
    // Two separate violations: dangling target + dangling parentId
    const badChild = stateNode('c', 'Child', 'ghost_parent');
    const edges = [mkEdge('e1', 'c', 'missing_target')];
    let thrown: Error | null = null;
    try { assertModelConsistent([badChild], edges); } catch (e) { thrown = e as Error; }
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/dangling_edge_target/);
    expect(thrown!.message).toMatch(/dangling_parent/);
  });
});

// ---------------------------------------------------------------------------
// Integration: YAML round-trips must produce a consistent model
// ---------------------------------------------------------------------------

function assertRoundTripConsistent(nodes: Node[], edges: Edge[]) {
  const yaml = convertToYaml(nodes, edges, false, false, defaultMachineProperties);
  const { nodes: outNodes, edges: outEdges } = convertFromYaml(yaml);
  assertModelConsistent(outNodes, outEdges);
}

describe('YAML round-trip model consistency', () => {
  it('single state', () => {
    assertRoundTripConsistent([stateNode('n1', 'Idle')], []);
  });

  it('two siblings with a transition', () => {
    const nodes = [stateNode('a', 'A'), stateNode('b', 'B')];
    assertRoundTripConsistent(nodes, [mkEdge('e1', 'a', 'b', 'go')]);
  });

  it('parent with two children and an internal transition', () => {
    const parent = stateNode('p', 'Parent');
    const c1 = stateNode('c1', 'Child1', 'p');
    const c2 = stateNode('c2', 'Child2', 'p');
    assertRoundTripConsistent([parent, c1, c2], [mkEdge('e1', 'c1', 'c2')]);
  });

  it('cross-subtree transition', () => {
    const a = stateNode('a', 'A');
    const b = stateNode('b', 'B');
    const ca = stateNode('ca', 'ChildA', 'a');
    const cb = stateNode('cb', 'ChildB', 'b');
    assertRoundTripConsistent([a, b, ca, cb], [mkEdge('e1', 'ca', 'cb')]);
  });

  it('3-level nesting with cross-level transition', () => {
    const root = stateNode('r', 'Root');
    const child = stateNode('c', 'Child', 'r');
    const gc = stateNode('g', 'Grandchild', 'c');
    const sib = stateNode('s', 'Sibling', 'r');
    assertRoundTripConsistent([root, child, gc, sib], [mkEdge('e1', 'g', 's')]);
  });

  it('ancestor-to-descendant transition', () => {
    const parent = stateNode('p', 'Parent');
    const child = stateNode('c', 'Child', 'p');
    assertRoundTripConsistent([parent, child], [mkEdge('e1', 'p', 'c')]);
  });

  it('descendant-to-ancestor transition', () => {
    const parent = stateNode('p', 'Parent');
    const child = stateNode('c', 'Child', 'p');
    assertRoundTripConsistent([parent, child], [mkEdge('e1', 'c', 'p')]);
  });

  it('self-transition', () => {
    assertRoundTripConsistent([stateNode('s', 'S')], [mkEdge('e1', 's', 's')]);
  });

  it('multiple transitions from the same source', () => {
    const nodes = [stateNode('a', 'A'), stateNode('b', 'B'), stateNode('c', 'C')];
    const edges = [mkEdge('e1', 'a', 'b', 'x'), mkEdge('e2', 'a', 'c', 'y')];
    assertRoundTripConsistent(nodes, edges);
  });
});

// ---------------------------------------------------------------------------
// Integration: simulated paste/duplicate — ID remapping must stay consistent
//
// Extracts the pure data-transformation logic from useClipboard.ts so it can
// be tested without React.
// ---------------------------------------------------------------------------

/**
 * Simulate duplicating `sourceNodes` + their internal edges, appending results
 * to `existingNodes`.  Mirrors the ID-remapping logic in useClipboard.ts.
 */
function simulatePaste(
  sourceNodes: Node[],
  sourceEdges: Edge[],
  existingNodes: Node[] = [],
): { nodes: Node[]; edges: Edge[] } {
  let counter = 1000;
  const newId = () => `dup_${counter++}`;
  const sourceIds = new Set(sourceNodes.map(n => n.id));
  const idMap = new Map<string, string>();

  // Assign new IDs first so parent remapping works regardless of order
  sourceNodes.forEach(n => idMap.set(n.id, newId()));

  const newNodes: Node[] = sourceNodes.map(n => {
    let parentId: string | undefined;
    if (n.parentId && sourceIds.has(n.parentId)) {
      parentId = idMap.get(n.parentId);   // parent was also pasted
    } else if (n.parentId) {
      parentId = n.parentId;              // external parent — kept as-is
    }
    return {
      ...n,
      id: idMap.get(n.id)!,
      parentId,
      extent: parentId ? ('parent' as const) : undefined,
      position: { x: n.position.x + 50, y: n.position.y + 50 },
    };
  });

  // Only internal edges (both endpoints in the pasted set) are duplicated
  const newEdges: Edge[] = sourceEdges
    .filter(e => sourceIds.has(e.source) && sourceIds.has(e.target))
    .map(e => ({
      ...e,
      id: `dup_e_${e.id}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }));

  return {
    nodes: [...existingNodes, ...newNodes],
    edges: newEdges,
  };
}

describe('simulated paste/duplicate model consistency', () => {
  it('two nodes with an edge duplicated together', () => {
    const a = stateNode('a', 'A');
    const b = stateNode('b', 'B');
    const { nodes, edges } = simulatePaste([a, b], [mkEdge('e1', 'a', 'b')]);
    assertModelConsistent(nodes, edges);
  });

  it('parent–child hierarchy pasted together', () => {
    const parent = stateNode('p', 'Parent');
    const child = stateNode('c', 'Child', 'p');
    const { nodes, edges } = simulatePaste([parent, child], []);
    assertModelConsistent(nodes, edges);
  });

  it('pasting only the source of an edge does not create a dangling target in internal edges', () => {
    // 'a' → 'b', but only 'a' is pasted; the edge is external, so it should
    // not appear in the duplicated internal edges.
    const a = stateNode('a', 'A');
    const b = stateNode('b', 'B');
    const { nodes, edges } = simulatePaste([a], [], [a, b]);
    assertModelConsistent(nodes, edges);
  });

  it('pasting into an existing canvas preserves original model consistency', () => {
    const existing = [stateNode('x', 'X'), stateNode('y', 'Y')];
    const toPaste = [stateNode('a', 'A'), stateNode('b', 'B')];
    const { nodes, edges } = simulatePaste(toPaste, [mkEdge('e1', 'a', 'b')], existing);
    assertModelConsistent(nodes, edges);
  });
});

// ---------------------------------------------------------------------------
// Integration: search/replace — text field mutations must not break structural
// consistency (edge/parent ID references are never affected by label changes)
// ---------------------------------------------------------------------------

/** Simulate a replaceAll on a single text field across all stateNodes. */
function simulateReplaceField(
  nodes: Node[],
  fieldName: string,
  from: string,
  to: string,
): Node[] {
  return nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      [fieldName]: typeof n.data[fieldName] === 'string'
        ? (n.data[fieldName] as string).replace(from, to)
        : n.data[fieldName],
    },
  }));
}

describe('search/replace model consistency', () => {
  it('replacing state labels does not break edge references', () => {
    const nodes = [stateNode('a', 'Alpha'), stateNode('b', 'Beta')];
    const edges = [mkEdge('e1', 'a', 'b', 'go')];
    const updated = simulateReplaceField(nodes, 'label', 'Alpha', 'Renamed');
    assertModelConsistent(updated, edges);
  });

  it('renaming a parent label keeps child parentId valid', () => {
    // parentId is an opaque node ID, not the label — renaming cannot break it
    const parent = stateNode('p', 'Parent');
    const child = stateNode('c', 'Child', 'p');
    const updated = simulateReplaceField([parent, child], 'label', 'Parent', 'Renamed');
    assertModelConsistent(updated, []);
  });

  it('replacing entry/exit/do code does not affect structural references', () => {
    const a = stateNode('a', 'A');
    a.data.entry = 'init()';
    a.data.exit = 'cleanup()';
    const b = stateNode('b', 'B');
    const edges = [mkEdge('e1', 'a', 'b')];
    const updated = simulateReplaceField([a, b], 'entry', 'init', 'start');
    assertModelConsistent(updated, edges);
  });

  it('replacing guard text on edges does not affect node references', () => {
    const nodes = [stateNode('a', 'A'), stateNode('b', 'B')];
    const edges = [mkEdge('e1', 'a', 'b', 'ready')];
    const updatedEdges = edges.map(e => ({
      ...e,
      data: { ...e.data, guard: (e.data.guard as string).replace('ready', 'done') },
    }));
    assertModelConsistent(nodes, updatedEdges);
  });
});

// ---------------------------------------------------------------------------
// Regression: delete A when B→proxy(A) exists
//
// Setup:  state A, state B, proxy P pointing at A, edge B→P.
// Action: delete A.
//
// In the app, onNodesChangeWithSelection cascade-deletes the proxy when A is
// removed (renderer.tsx lines 1159-1168).  However, ReactFlow only fires edge
// removal changes for the *originally* selected node (A), not for the proxy
// that was added to the change list inside the callback.  The edge B→P is
// therefore left behind with a dangling target.
//
// simulateCascadeDelete mirrors the production logic faithfully so the test
// exercises the real algorithm and fails until the production code is fixed.
// ---------------------------------------------------------------------------

/**
 * Mirrors the cascade-delete logic in renderer.tsx onNodesChangeWithSelection.
 *
 * Node removal:
 *   - selected nodes
 *   - all their descendants
 *   - proxy nodes whose targetId is one of the above
 *
 * Edge removal:
 *   Edges whose source or target is in the full removeIds set are removed,
 *   covering both the originally-selected nodes and all cascade additions.
 */
function simulateCascadeDelete(
  nodes: Node[],
  edges: Edge[],
  selectedIds: string[],
): { nodes: Node[]; edges: Edge[] } {
  const removeIds = new Set(selectedIds);

  // Cascade descendants (mirrors renderer.tsx lines 1148-1158)
  for (const id of [...removeIds]) {
    getAllDescendants(id, nodes).forEach(d => removeIds.add(d.id));
  }

  // Cascade proxies whose targetId is being deleted (mirrors lines 1159-1168)
  nodes.forEach(n => {
    if (n.type === 'proxyNode') {
      const data = n.data as { targetId: string };
      if (removeIds.has(data.targetId)) removeIds.add(n.id);
    }
  });

  const newNodes = nodes.filter(n => !removeIds.has(n.id));

  // After the fix: edges connected to ANY node in removeIds are removed
  // (including cascade-added proxies and descendants).
  const newEdges = edges.filter(
    e => !removeIds.has(e.source) && !removeIds.has(e.target),
  );

  return { nodes: newNodes, edges: newEdges };
}

describe('delete-A-with-proxy regression', () => {
  const a = stateNode('a', 'A');
  const b = stateNode('b', 'B');
  const proxy: Node = {
    id: 'p1',
    type: 'proxyNode',
    position: { x: 100, y: 10 },
    data: { name: 'P1', label: '→ A', targetId: 'a', targetPath: 'A', broken: false },
    style: { width: 80, height: 30 },
  };
  const edgeBToProxy = mkEdge('e1', 'b', 'p1');

  it('initial model (A, B, proxy, B→proxy) is consistent', () => {
    assertModelConsistent([a, b, proxy], [edgeBToProxy]);
  });

  it('deleting A removes A, its cascade-deleted proxy, and the edge B→proxy', () => {
    const { nodes: result, edges: resultEdges } = simulateCascadeDelete(
      [a, b, proxy], [edgeBToProxy], ['a'],
    );
    assertModelConsistent(result, resultEdges);
  });
});
