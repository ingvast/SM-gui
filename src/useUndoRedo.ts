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
    return previous;
  }, [updateFlags]);

  const redo = useCallback((currentState: Snapshot): Snapshot | null => {
    if (redoStack.current.length === 0) return null;
    const next = redoStack.current.pop()!;
    undoStack.current.push(deepCopySnapshot(currentState));
    updateFlags();
    return next;
  }, [updateFlags]);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    updateFlags();
  }, [updateFlags]);

  return { pushSnapshot, undo, redo, canUndo, canRedo, clear };
}
