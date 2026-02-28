import { useCallback } from 'react';
import { Node } from 'reactflow';
import { isAncestorOf } from '../utils/nodeUtils';
import { getAbsoluteNodeBounds } from '../semanticZoom';

export function useGrouping(
  nodes: Node[],
  setNodes: (updater: (nds: Node[]) => Node[]) => void,
  saveSnapshot: () => void,
) {
  const handleGroupStates = useCallback(() => {
    const selectedNode = nodes.find(n => n.selected);
    if (!selectedNode) {
      console.log('No node selected for grouping.');
      return;
    }

    const parentBounds = getAbsoluteNodeBounds(selectedNode.id, nodes);
    if (!parentBounds) return;

    const nodesToGroup: string[] = [];

    for (const node of nodes) {
      if (node.id === selectedNode.id) continue;
      if (node.parentId === selectedNode.id) continue;
      if (isAncestorOf(node.id, selectedNode.id, nodes)) continue;

      const nodeBounds = getAbsoluteNodeBounds(node.id, nodes);
      if (!nodeBounds) continue;

      const isInside =
        nodeBounds.x >= parentBounds.x &&
        nodeBounds.y >= parentBounds.y &&
        nodeBounds.x + nodeBounds.width <= parentBounds.x + parentBounds.width &&
        nodeBounds.y + nodeBounds.height <= parentBounds.y + parentBounds.height;

      if (isInside) {
        nodesToGroup.push(node.id);
      }
    }

    if (nodesToGroup.length === 0) {
      console.log('No nodes found inside the selected state to group.');
      return;
    }

    // Only reparent top-level nodes — skip nodes whose parent is already being grouped
    const nodesToGroupSet = new Set(nodesToGroup);
    const topLevelNodesToGroup = nodesToGroup.filter((id) => {
      const node = nodes.find(n => n.id === id);
      return !node?.parentId || !nodesToGroupSet.has(node.parentId);
    });

    saveSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (topLevelNodesToGroup.includes(node.id)) {
          const nodeBounds = getAbsoluteNodeBounds(node.id, nds);
          if (!nodeBounds) return node;

          const relativeX = nodeBounds.x - parentBounds.x;
          const relativeY = nodeBounds.y - parentBounds.y;

          return {
            ...node,
            parentId: selectedNode.id,
            extent: 'parent' as const,
            position: { x: relativeX, y: relativeY },
          };
        }
        return node;
      })
    );

    console.log(`Grouped ${topLevelNodesToGroup.length} state(s) into ${selectedNode.data.label}.`);
  }, [nodes, setNodes, saveSnapshot]);

  const handleUngroupState = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      console.log('Node not found for ungrouping.');
      return false;
    }

    if (!node.parentId) {
      console.log('Node is already at root level, cannot ungroup.');
      return false;
    }

    const parentNode = nodes.find(n => n.id === node.parentId);
    if (!parentNode) {
      console.log('Parent node not found.');
      return false;
    }

    const nodeBounds = getAbsoluteNodeBounds(nodeId, nodes);
    if (!nodeBounds) return false;

    const grandparentId = parentNode.parentId || undefined;

    let newPosition: { x: number; y: number };
    if (grandparentId) {
      const grandparentBounds = getAbsoluteNodeBounds(grandparentId, nodes);
      if (grandparentBounds) {
        newPosition = {
          x: nodeBounds.x - grandparentBounds.x,
          y: nodeBounds.y - grandparentBounds.y,
        };
      } else {
        newPosition = { x: nodeBounds.x, y: nodeBounds.y };
      }
    } else {
      newPosition = { x: nodeBounds.x, y: nodeBounds.y };
    }

    saveSnapshot();
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            parentId: grandparentId,
            extent: grandparentId ? 'parent' as const : undefined,
            position: newPosition,
          };
        }
        return n;
      })
    );

    console.log(`Ungrouped ${node.data.label} from ${parentNode.data.label}.`);
    return true;
  }, [nodes, setNodes, saveSnapshot]);

  return { handleGroupStates, handleUngroupState };
}
