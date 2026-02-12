import { useCallback } from 'react';
import { Node, Edge, MarkerType } from 'reactflow';
import { calculateBestHandles } from '../utils/handleUtils';

export function useEdgeOperations(
  nodes: Node[],
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void,
  saveSnapshot: () => void,
) {
  const onConnect = useCallback(
    (params) => {
      let source = params.source;
      let target = params.target;
      let sourceHandle = params.sourceHandle;
      let targetHandle = params.targetHandle;

      if (sourceHandle && sourceHandle.endsWith('-target')) {
        source = params.target;
        target = params.source;
        sourceHandle = params.targetHandle;
        targetHandle = params.sourceHandle;
      }

      if (sourceHandle && sourceHandle.endsWith('-target')) {
        sourceHandle = sourceHandle.replace('-target', '-source');
      }
      if (targetHandle && targetHandle.endsWith('-source')) {
        targetHandle = targetHandle.replace('-source', '-target');
      }

      // Prevent self-loops on decision nodes
      if (source === target) {
        const node = nodes.find(n => n.id === source);
        if (node?.type === 'decisionNode') return;
      }

      saveSnapshot();
      setEdges((eds) => {
        const newEdge = {
          source,
          target,
          sourceHandle,
          targetHandle,
          id: `e${params.source}-${params.target}-${Date.now()}`,
          type: 'spline',
          data: { controlPoints: [], label: '' },
          markerEnd: { type: MarkerType.ArrowClosed },
        };
        return [...eds, newEdge];
      });
    },
    [nodes, setEdges, saveSnapshot]
  );

  const createTransition = useCallback((sourceId: string, targetId: string) => {
    // Prevent self-loops on decision nodes
    if (sourceId === targetId) {
      const node = nodes.find(n => n.id === sourceId);
      if (node?.type === 'decisionNode') return;
    }
    const { sourceHandle, targetHandle } = calculateBestHandles(sourceId, targetId, nodes);

    const newEdge = {
      id: `e${sourceId}-${targetId}-${Date.now()}`,
      source: sourceId,
      target: targetId,
      sourceHandle,
      targetHandle,
      type: 'spline',
      data: { controlPoints: [], label: '' },
      markerEnd: { type: MarkerType.ArrowClosed },
    };

    saveSnapshot();
    setEdges((eds) => eds.concat(newEdge));
  }, [nodes, setEdges, saveSnapshot]);

  const isValidConnection = useCallback(
    (connection) => {
      if (connection.source === connection.target) {
        const node = nodes.find(n => n.id === connection.source);
        if (node?.type === 'decisionNode') return false;
      }
      return true;
    },
    [nodes]
  );

  const onReconnect = useCallback(
    (oldEdge, newConnection) => {
      let sourceHandle = newConnection.sourceHandle;
      let targetHandle = newConnection.targetHandle;
      if (sourceHandle && sourceHandle.endsWith('-target')) {
        sourceHandle = sourceHandle.replace('-target', '-source');
      }
      if (targetHandle && targetHandle.endsWith('-source')) {
        targetHandle = targetHandle.replace('-source', '-target');
      }

      saveSnapshot();
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === oldEdge.id) {
            return {
              ...edge,
              source: newConnection.source,
              target: newConnection.target,
              sourceHandle,
              targetHandle,
            };
          }
          return edge;
        })
      );
    },
    [setEdges, saveSnapshot]
  );

  const handleEdgePropertyChange = useCallback((edgeId: string, propertyName: string, newValue: unknown) => {
    saveSnapshot();
    setEdges((eds) => {
      const result = eds.map((edge) => {
        if (edge.id === edgeId) {
          return {
            ...edge,
            data: {
              ...edge.data,
              [propertyName]: newValue,
            },
          };
        }
        return edge;
      });

      // When a guard is added to a previously guardless transition,
      // move it up before the first guardless sibling
      if (propertyName === 'guard') {
        const edge = eds.find(e => e.id === edgeId);
        const hadGuard = !!(edge?.data?.guard);
        const hasGuard = !!(newValue as string);
        if (!hadGuard && hasGuard) {
          const sourceId = edge!.source;
          const siblingIndices: number[] = [];
          for (let i = 0; i < result.length; i++) {
            if (result[i].source === sourceId) siblingIndices.push(i);
          }
          const myArrayIndex = result.findIndex(e => e.id === edgeId);
          let insertBeforeArrayIndex = -1;
          for (const idx of siblingIndices) {
            if (idx === myArrayIndex) break;
            if (!result[idx].data?.guard) {
              insertBeforeArrayIndex = idx;
              break;
            }
          }
          if (insertBeforeArrayIndex !== -1 && insertBeforeArrayIndex < myArrayIndex) {
            const moved = result.splice(myArrayIndex, 1)[0];
            result.splice(insertBeforeArrayIndex, 0, moved);
          }
        }
      }

      return result;
    });
  }, [setEdges, saveSnapshot]);

  const handleReorderEdge = useCallback((edgeId: string, direction: 'up' | 'down') => {
    saveSnapshot();
    setEdges((eds) => {
      const edgeIndex = eds.findIndex(e => e.id === edgeId);
      if (edgeIndex === -1) return eds;
      const edge = eds[edgeIndex];
      const sourceId = edge.source;

      const siblingIndices: number[] = [];
      for (let i = 0; i < eds.length; i++) {
        if (eds[i].source === sourceId) siblingIndices.push(i);
      }

      const posInSiblings = siblingIndices.indexOf(edgeIndex);
      if (posInSiblings === -1) return eds;
      if (direction === 'up' && posInSiblings === 0) return eds;
      if (direction === 'down' && posInSiblings === siblingIndices.length - 1) return eds;

      const swapPos = direction === 'up' ? posInSiblings - 1 : posInSiblings + 1;
      const swapIndex = siblingIndices[swapPos];

      const newEdges = [...eds];
      [newEdges[edgeIndex], newEdges[swapIndex]] = [newEdges[swapIndex], newEdges[edgeIndex]];
      return newEdges;
    });
  }, [setEdges, saveSnapshot]);

  return { onConnect, onReconnect, isValidConnection, createTransition, handleEdgePropertyChange, handleReorderEdge };
}
