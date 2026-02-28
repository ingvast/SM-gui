import { describe, it, expect } from 'vitest';
import { Node } from 'reactflow';
import {
  calculateNodeDepth,
  isAncestorOf,
  getAllDescendants,
  generateUniqueNodeLabel,
  computeNodePath,
} from './nodeUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, label: string, parentId?: string): Node {
  return {
    id,
    type: 'stateNode',
    position: { x: 0, y: 0 },
    data: { label },
    ...(parentId ? { parentId } : {}),
  };
}

// A simple 3-level hierarchy: root → child → grandchild
const root = makeNode('root', 'Root');
const child = makeNode('child', 'Child', 'root');
const grandchild = makeNode('gc', 'Grandchild', 'child');
const sibling = makeNode('sib', 'Sibling', 'root');
const flat = [root, child, grandchild, sibling];

// ---------------------------------------------------------------------------
// calculateNodeDepth
// ---------------------------------------------------------------------------

describe('calculateNodeDepth', () => {
  it('root node has depth 0', () => {
    expect(calculateNodeDepth('root', flat)).toBe(0);
  });

  it('direct child has depth 1', () => {
    expect(calculateNodeDepth('child', flat)).toBe(1);
  });

  it('grandchild has depth 2', () => {
    expect(calculateNodeDepth('gc', flat)).toBe(2);
  });

  it('unknown id has depth 0', () => {
    expect(calculateNodeDepth('unknown', flat)).toBe(0);
  });

  it('uses cache to avoid recomputation', () => {
    const cache = new Map<string, number>();
    calculateNodeDepth('gc', flat, cache);
    // cache should now contain entries for the traversal path
    expect(cache.has('gc')).toBe(true);
    expect(cache.get('gc')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isAncestorOf
// ---------------------------------------------------------------------------

describe('isAncestorOf', () => {
  it('root is ancestor of grandchild', () => {
    expect(isAncestorOf('root', 'gc', flat)).toBe(true);
  });

  it('root is ancestor of direct child', () => {
    expect(isAncestorOf('root', 'child', flat)).toBe(true);
  });

  it('child is NOT ancestor of root', () => {
    expect(isAncestorOf('child', 'root', flat)).toBe(false);
  });

  it('sibling is NOT ancestor of grandchild', () => {
    expect(isAncestorOf('sib', 'gc', flat)).toBe(false);
  });

  it('node is NOT its own ancestor', () => {
    expect(isAncestorOf('root', 'root', flat)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAllDescendants
// ---------------------------------------------------------------------------

describe('getAllDescendants', () => {
  it('returns direct children and grandchildren', () => {
    const descs = getAllDescendants('root', flat);
    const ids = descs.map(n => n.id).sort();
    expect(ids).toEqual(['child', 'gc', 'sib'].sort());
  });

  it('returns only direct child when there are no grandchildren', () => {
    const descs = getAllDescendants('child', flat);
    expect(descs.map(n => n.id)).toEqual(['gc']);
  });

  it('returns empty array for a leaf node', () => {
    expect(getAllDescendants('gc', flat)).toEqual([]);
  });

  it('returns empty array for unknown id', () => {
    expect(getAllDescendants('unknown', flat)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// generateUniqueNodeLabel
// ---------------------------------------------------------------------------

describe('generateUniqueNodeLabel', () => {
  it('returns the base label when no siblings exist', () => {
    expect(generateUniqueNodeLabel('State', undefined, [])).toBe('State');
  });

  it('returns the base label when no sibling has the same name', () => {
    const nodes = [makeNode('a', 'Alpha', 'p'), makeNode('b', 'Beta', 'p')];
    expect(generateUniqueNodeLabel('Gamma', 'p', nodes)).toBe('Gamma');
  });

  it('appends counter when label conflicts with a sibling', () => {
    const nodes = [makeNode('a', 'State', 'p')];
    expect(generateUniqueNodeLabel('State', 'p', nodes)).toBe('State 2');
  });

  it('increments counter until unique', () => {
    const nodes = [
      makeNode('a', 'State', 'p'),
      makeNode('b', 'State 2', 'p'),
    ];
    expect(generateUniqueNodeLabel('State', 'p', nodes)).toBe('State 3');
  });

  it('does not consider nodes in a different parent as conflicts', () => {
    const nodes = [makeNode('a', 'State', 'other-parent')];
    expect(generateUniqueNodeLabel('State', 'p', nodes)).toBe('State');
  });
});

// ---------------------------------------------------------------------------
// computeNodePath
// ---------------------------------------------------------------------------

describe('computeNodePath', () => {
  it('returns just the label for a root node', () => {
    expect(computeNodePath('root', flat)).toBe('Root');
  });

  it('returns Parent/Child for a direct child', () => {
    expect(computeNodePath('child', flat)).toBe('Root/Child');
  });

  it('returns full path for a grandchild', () => {
    expect(computeNodePath('gc', flat)).toBe('Root/Child/Grandchild');
  });

  it('returns empty string for an unknown id', () => {
    expect(computeNodePath('unknown', flat)).toBe('');
  });
});
