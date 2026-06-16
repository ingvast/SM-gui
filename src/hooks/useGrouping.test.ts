import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node } from 'reactflow';
import { useGrouping } from './useGrouping';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
  opts: { parentId?: string; selected?: boolean } = {},
): Node {
  return {
    id,
    type: 'stateNode',
    position,
    data: { label: id, history: false, entry: '', exit: '', do: '' },
    ...(opts.parentId ? { parentId: opts.parentId, extent: 'parent' as const } : {}),
    ...(opts.selected ? { selected: true } : {}),
    style: size,
  };
}

interface Harness {
  getNodes: () => Node[];
  saveSnapshot: ReturnType<typeof vi.fn>;
  hook: ReturnType<typeof useGrouping>;
}

function setupHook(initialNodes: Node[]): Harness {
  const state = { nodes: initialNodes };
  const setNodes = (updater: (n: Node[]) => Node[]) => { state.nodes = updater(state.nodes); };
  const saveSnapshot = vi.fn();

  const { result } = renderHook(() => useGrouping(state.nodes, setNodes, saveSnapshot));

  return { getNodes: () => state.nodes, saveSnapshot, hook: result.current };
}

const byId = (nodes: Node[], id: string) => nodes.find(n => n.id === id)!;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useGrouping › handleGroupStates', () => {
  it('adopts a sibling that is fully inside the selected state', () => {
    const A = makeState('A', { x: 0, y: 0 }, { width: 400, height: 400 }, { selected: true });
    const S = makeState('S', { x: 50, y: 50 }, { width: 100, height: 100 });

    const { hook, getNodes, saveSnapshot } = setupHook([A, S]);
    act(() => hook.handleGroupStates());

    const s = byId(getNodes(), 'S');
    expect(s.parentId).toBe('A');
    expect(s.extent).toBe('parent');
    // Position becomes relative to the new parent A (which sits at the origin).
    expect(s.position).toEqual({ x: 50, y: 50 });
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it('does not steal a node out of a neighbor that straddles the border', () => {
    const A = makeState('A', { x: 0, y: 0 }, { width: 400, height: 400 }, { selected: true });
    // B straddles A's right border, so B itself is not contained by A...
    const B = makeState('B', { x: 300, y: 50 }, { width: 200, height: 100 });
    // ...but B's child C happens to sit inside A's rectangle.
    const C = makeState('C', { x: 10, y: 10 }, { width: 50, height: 50 }, { parentId: 'B' });

    const { hook, getNodes } = setupHook([A, B, C]);
    act(() => hook.handleGroupStates());

    // C must remain a child of B — not stolen into A.
    expect(byId(getNodes(), 'C').parentId).toBe('B');
    // B straddles the border, so it is not grouped either.
    expect(byId(getNodes(), 'B').parentId).toBeUndefined();
  });

  it("does not flatten the selected state's own nested descendants", () => {
    const A = makeState('A', { x: 0, y: 0 }, { width: 400, height: 400 }, { selected: true });
    const X = makeState('X', { x: 20, y: 20 }, { width: 100, height: 100 }, { parentId: 'A' });
    // Y is a grandchild of A (child of X) whose absolute bounds fall inside A.
    const Y = makeState('Y', { x: 10, y: 10 }, { width: 30, height: 30 }, { parentId: 'X' });

    const { hook, getNodes } = setupHook([A, X, Y]);
    act(() => hook.handleGroupStates());

    // Y stays nested under X; X stays under A. Hierarchy is preserved.
    expect(byId(getNodes(), 'Y').parentId).toBe('X');
    expect(byId(getNodes(), 'X').parentId).toBe('A');
  });

  it('carries a grouped sibling\'s children along without reparenting them', () => {
    const A = makeState('A', { x: 0, y: 0 }, { width: 400, height: 400 }, { selected: true });
    // Sibling group B (fully inside A) with its own child C.
    const B = makeState('B', { x: 50, y: 50 }, { width: 150, height: 150 });
    const C = makeState('C', { x: 10, y: 10 }, { width: 50, height: 50 }, { parentId: 'B' });

    const { hook, getNodes } = setupHook([A, B, C]);
    act(() => hook.handleGroupStates());

    // Only B is reparented; C rides along as B's child (its relative position is unchanged).
    expect(byId(getNodes(), 'B').parentId).toBe('A');
    expect(byId(getNodes(), 'C').parentId).toBe('B');
    expect(byId(getNodes(), 'C').position).toEqual({ x: 10, y: 10 });
  });

  it('does nothing when no sibling is inside the selected state', () => {
    const A = makeState('A', { x: 0, y: 0 }, { width: 400, height: 400 }, { selected: true });
    const Far = makeState('Far', { x: 1000, y: 1000 }, { width: 100, height: 100 });

    const { hook, getNodes, saveSnapshot } = setupHook([A, Far]);
    act(() => hook.handleGroupStates());

    expect(byId(getNodes(), 'Far').parentId).toBeUndefined();
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});
