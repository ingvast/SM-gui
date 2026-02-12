import { useRef, useCallback, useState } from 'react';
import { Node, Edge } from 'reactflow';
import { MachineProperties } from './yamlConverter';

export type Snapshot = {
  nodes: Node[];
  edges: Edge[];
  machineProperties: MachineProperties;
  rootHistory: boolean;
};

const MAX_STACK_SIZE = 50;

// ReactFlow requires parent nodes to appear before their children in the array.
// Without this, restoring a snapshot can silently break parent-child relationships.
function sortParentsFirst(nodes: Node[]): Node[] {
  const idSet = new Set(nodes.map(n => n.id));
  const roots: Node[] = [];
  const childrenOf = new Map<string, Node[]>();

  for (const n of nodes) {
    if (n.parentId && idSet.has(n.parentId)) {
      const siblings = childrenOf.get(n.parentId) || [];
      siblings.push(n);
      childrenOf.set(n.parentId, siblings);
    } else {
      roots.push(n);
    }
  }

  const result: Node[] = [];
  const visit = (node: Node) => {
    result.push(node);
    const children = childrenOf.get(node.id);
    if (children) {
      for (const child of children) visit(child);
    }
  };
  for (const root of roots) visit(root);
  return result;
}

function deepCopySnapshot(snapshot: Snapshot): Snapshot {
  return {
    nodes: snapshot.nodes.map(n => ({
      ...n,
      position: { ...n.position },
      data: { ...n.data },
      style: n.style ? { ...n.style } : undefined,
    })),
    edges: snapshot.edges.map(e => ({
      ...e,
      data: e.data ? {
        ...e.data,
        controlPoints: e.data.controlPoints ? [...e.data.controlPoints.map(cp => ({ ...cp }))] : [],
      } : undefined,
    })),
    machineProperties: {
      ...snapshot.machineProperties,
      hooks: { ...snapshot.machineProperties.hooks },
      initialMarkerPos: snapshot.machineProperties.initialMarkerPos
        ? { ...snapshot.machineProperties.initialMarkerPos }
        : undefined,
      historyMarkerPos: snapshot.machineProperties.historyMarkerPos
        ? { ...snapshot.machineProperties.historyMarkerPos }
        : undefined,
    },
    rootHistory: snapshot.rootHistory,
  };
}

export function useUndoRedo() {
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const pushSnapshot = useCallback((snapshot: Snapshot) => {
    undoStack.current.push(deepCopySnapshot(snapshot));
    if (undoStack.current.length > MAX_STACK_SIZE) {
      undoStack.current.shift();
    }
    redoStack.current = [];
    updateFlags();
  }, [updateFlags]);

  const undo = useCallback((currentState: Snapshot): Snapshot | null => {
    if (undoStack.current.length === 0) return null;
    const previous = undoStack.current.pop()!;
    redoStack.current.push(deepCopySnapshot(currentState));
    updateFlags();
    previous.nodes = sortParentsFirst(previous.nodes);
    return previous;
  }, [updateFlags]);

  const redo = useCallback((currentState: Snapshot): Snapshot | null => {
    if (redoStack.current.length === 0) return null;
    const next = redoStack.current.pop()!;
    undoStack.current.push(deepCopySnapshot(currentState));
    updateFlags();
    next.nodes = sortParentsFirst(next.nodes);
    return next;
  }, [updateFlags]);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    updateFlags();
  }, [updateFlags]);

  return { pushSnapshot, undo, redo, canUndo, canRedo, clear };
}
