import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node } from 'reactflow';
import { useUndoRedo, sortParentsFirst, Snapshot } from './useUndoRedo';
import { defaultMachineProperties } from './yamlConverter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, parentId?: string): Node {
  return {
    id,
    type: 'stateNode',
    position: { x: 0, y: 0 },
    data: { label: id },
    ...(parentId ? { parentId } : {}),
  };
}

function makeSnapshot(labels: string[] = []): Snapshot {
  return {
    nodes: labels.map(l => makeNode(l)),
    edges: [],
    machineProperties: { ...defaultMachineProperties },
    rootHistory: false,
  };
}

// ---------------------------------------------------------------------------
// sortParentsFirst
// ---------------------------------------------------------------------------

describe('sortParentsFirst', () => {
  it('leaves a flat list unchanged in relative order', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const result = sortParentsFirst(nodes);
    expect(result.map(n => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('moves parent before its child when child comes first in input', () => {
    const child = makeNode('child', 'parent');
    const parent = makeNode('parent');
    const result = sortParentsFirst([child, parent]);
    const ids = result.map(n => n.id);
    expect(ids.indexOf('parent')).toBeLessThan(ids.indexOf('child'));
  });

  it('handles multi-level nesting', () => {
    const gc = makeNode('gc', 'child');
    const child = makeNode('child', 'root');
    const root = makeNode('root');
    // Deliberately scrambled order
    const result = sortParentsFirst([gc, child, root]);
    const ids = result.map(n => n.id);
    expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('child'));
    expect(ids.indexOf('child')).toBeLessThan(ids.indexOf('gc'));
  });

  it('handles parentId referencing a node not in the array (treated as root)', () => {
    const orphan = makeNode('orphan', 'missing-parent');
    const result = sortParentsFirst([orphan]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('orphan');
  });
});

// ---------------------------------------------------------------------------
// useUndoRedo — hook behaviour
// ---------------------------------------------------------------------------

describe('useUndoRedo', () => {
  it('starts with canUndo=false and canRedo=false', () => {
    const { result } = renderHook(() => useUndoRedo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('canUndo becomes true after pushSnapshot', () => {
    const { result } = renderHook(() => useUndoRedo());
    act(() => { result.current.pushSnapshot(makeSnapshot(['A'])); });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undo returns the pushed snapshot and enables redo', () => {
    const { result } = renderHook(() => useUndoRedo());
    const snap = makeSnapshot(['A', 'B']);
    act(() => { result.current.pushSnapshot(snap); });

    let restored: Snapshot | null = null;
    act(() => { restored = result.current.undo(makeSnapshot(['current'])); });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(restored!.nodes.map(n => n.data.label)).toEqual(['A', 'B']);
  });

  it('redo restores the state that was current at undo-time, and re-enables undo', () => {
    const { result } = renderHook(() => useUndoRedo());
    // Model: we were at state A, made a change to reach state B, then undo.
    // pushSnapshot stores pre-change state A.
    act(() => { result.current.pushSnapshot(makeSnapshot(['A'])); });
    // undo(B) → returns A, stores B in redo stack
    const stateB = makeSnapshot(['B']);
    act(() => { result.current.undo(stateB); });

    // redo pops B from redo stack and returns it
    let redone: Snapshot | null = null;
    act(() => { redone = result.current.redo(makeSnapshot(['A'])); });

    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
    expect(redone!.nodes[0].data.label).toBe('B');
  });

  it('undo returns null when stack is empty', () => {
    const { result } = renderHook(() => useUndoRedo());
    let res: Snapshot | null = makeSnapshot(); // non-null sentinel
    act(() => { res = result.current.undo(makeSnapshot()); });
    expect(res).toBeNull();
  });

  it('redo returns null when redo stack is empty', () => {
    const { result } = renderHook(() => useUndoRedo());
    let res: Snapshot | null = makeSnapshot();
    act(() => { res = result.current.redo(makeSnapshot()); });
    expect(res).toBeNull();
  });

  it('pushing a new snapshot clears the redo stack', () => {
    const { result } = renderHook(() => useUndoRedo());
    act(() => { result.current.pushSnapshot(makeSnapshot(['A'])); });
    act(() => { result.current.undo(makeSnapshot(['current'])); });
    expect(result.current.canRedo).toBe(true);

    // Push new work — redo stack must be wiped
    act(() => { result.current.pushSnapshot(makeSnapshot(['B'])); });
    expect(result.current.canRedo).toBe(false);
  });

  it('deep copies snapshots so mutations do not corrupt the stack', () => {
    const { result } = renderHook(() => useUndoRedo());
    const snap = makeSnapshot(['Original']);
    act(() => { result.current.pushSnapshot(snap); });

    // Mutate the original after pushing
    snap.nodes[0].data.label = 'Mutated';

    let restored: Snapshot | null = null;
    act(() => { restored = result.current.undo(makeSnapshot()); });
    expect(restored!.nodes[0].data.label).toBe('Original');
  });

  it('caps the undo stack at 50 entries', () => {
    const { result } = renderHook(() => useUndoRedo());
    act(() => {
      for (let i = 0; i < 55; i++) {
        result.current.pushSnapshot(makeSnapshot([`s${i}`]));
      }
    });
    // Pop all 50 entries
    const labels: string[] = [];
    act(() => {
      for (let i = 0; i < 50; i++) {
        const s = result.current.undo(makeSnapshot());
        if (s) labels.push(s.nodes[0]?.data.label ?? '');
      }
    });
    expect(labels).toHaveLength(50);
    // The oldest 5 snapshots (s0–s4) were evicted; s5 is the oldest available
    expect(labels[labels.length - 1]).toBe('s5');
  });

  it('clear resets both stacks', () => {
    const { result } = renderHook(() => useUndoRedo());
    act(() => { result.current.pushSnapshot(makeSnapshot(['A'])); });
    act(() => { result.current.clear(); });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
