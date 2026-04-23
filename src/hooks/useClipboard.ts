import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { getAllDescendants, generateUniqueNodeLabel, generateUniqueDecisionLabel } from '../utils/nodeUtils';
import { getAbsoluteNodeBounds } from '../semanticZoom';
import { getNextId } from '../utils/idCounters';

const CLIPBOARD_MARKER = 'sm-gui-clipboard:';

export function useClipboard(
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: (nds: Node[]) => Node[]) => void,
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void,
  setSelectedTreeItem: (id: string | null) => void,
  saveSnapshot: () => void,
) {

  const handleCopy = useCallback(async () => {
    const selectedNodes = nodes.filter(node => node.selected);
    if (selectedNodes.length === 0) {
      return;
    }

    const nodesToCopySet = new Set<Node>();

    selectedNodes.forEach(sNode => {
      nodesToCopySet.add(sNode);
      const descendants = getAllDescendants(sNode.id, nodes);
      descendants.forEach(dNode => nodesToCopySet.add(dNode));
    });

    const finalNodesToCopy = Array.from(nodesToCopySet).map(node => ({ ...node }));
    const copiedNodeIds = new Set(finalNodesToCopy.map(n => n.id));

    const edgesToCopy = edges
      .filter(edge => copiedNodeIds.has(edge.source) && copiedNodeIds.has(edge.target))
      .map(edge => ({
        ...edge,
        data: edge.data ? {
          ...edge.data,
          controlPoints: edge.data.controlPoints ? [...edge.data.controlPoints] : [],
        } : { controlPoints: [], label: '' },
      }));

    const clipboardData = JSON.stringify({ nodes: finalNodesToCopy, edges: edgesToCopy });
    try {
      await navigator.clipboard.writeText(CLIPBOARD_MARKER + clipboardData);
    } catch (err) {
      console.error('Failed to write to system clipboard:', err);
    }

  }, [nodes, edges]);

  const handlePaste = useCallback(async (pasteWorldPos?: { x: number; y: number }) => {
    let copiedNodes: Node[] = [];
    let copiedEdges: Edge[] = [];

    try {
      const text = await navigator.clipboard.readText();
      if (!text.startsWith(CLIPBOARD_MARKER)) {
        return;
      }
      const parsed = JSON.parse(text.slice(CLIPBOARD_MARKER.length));
      copiedNodes = parsed.nodes || [];
      copiedEdges = parsed.edges || [];
    } catch (err) {
      console.error('Failed to read from system clipboard:', err);
      return;
    }

    if (copiedNodes.length === 0) {
      return;
    }

    const newIdMap = new Map<string, string>();
    const newNodes: Node[] = [];
    const offset = { x: 50, y: 50 };

    const currentlySelectedNode = nodes.find(n => n.selected);
    let potentialParentNodeId: string | null = null;

    if (currentlySelectedNode && !copiedNodes.some(n => n.id === currentlySelectedNode.id)) {
      potentialParentNodeId = currentlySelectedNode.id;
    }

    // If a paste position was supplied (e.g. cursor location), translate the
    // root copied nodes so their bounding-box top-left lands at that position.
    // When pasting into a parent state, convert world coords to parent-local.
    let cursorTranslate: { x: number; y: number } | null = null;
    if (pasteWorldPos) {
      const rootCopied = copiedNodes.filter(n => !n.parentId || !copiedNodes.some(p => p.id === n.parentId));
      if (rootCopied.length > 0) {
        let targetX = pasteWorldPos.x;
        let targetY = pasteWorldPos.y;
        if (potentialParentNodeId) {
          const parentBounds = getAbsoluteNodeBounds(potentialParentNodeId, nodes);
          if (parentBounds) {
            targetX -= parentBounds.x;
            targetY -= parentBounds.y;
          }
        }
        const minX = Math.min(...rootCopied.map(n => n.position.x));
        const minY = Math.min(...rootCopied.map(n => n.position.y));
        cursorTranslate = { x: targetX - minX, y: targetY - minY };
      }
    }

    copiedNodes.forEach(oldNode => {
      const newId = getNextId();
      newIdMap.set(oldNode.id, newId);

      let newNodeParentId: string | undefined = oldNode.parentId;
      let newNodeExtent = oldNode.extent;

      if (potentialParentNodeId && (!oldNode.parentId || !copiedNodes.some(n => n.id === oldNode.parentId))) {
        newNodeParentId = potentialParentNodeId;
        newNodeExtent = 'parent';
      } else if (oldNode.parentId && copiedNodes.some(n => n.id === oldNode.parentId)) {
        newNodeParentId = newIdMap.get(oldNode.parentId);
      } else {
        newNodeParentId = undefined;
        newNodeExtent = undefined;
      }

      let newPosition;
      if (oldNode.parentId && copiedNodes.some(n => n.id === oldNode.parentId)) {
        // Non-root copied node: keep parent-relative position unchanged.
        newPosition = { ...oldNode.position };
      } else if (cursorTranslate) {
        // Root copied node, cursor-positioned (works for both root paste and
        // paste-into-parent — cursorTranslate already accounts for parent offset).
        newPosition = { x: oldNode.position.x + cursorTranslate.x, y: oldNode.position.y + cursorTranslate.y };
      } else if (potentialParentNodeId && newNodeParentId === potentialParentNodeId) {
        newPosition = { x: offset.x, y: offset.y };
      } else {
        newPosition = { x: oldNode.position.x + offset.x, y: oldNode.position.y + offset.y };
      }

      const newNode = {
        ...oldNode,
        id: newId,
        selected: false,
        position: newPosition,
        parentId: newNodeParentId,
        extent: newNodeExtent,
        data: {
          ...oldNode.data,
          label: oldNode.type === 'decisionNode'
            ? generateUniqueDecisionLabel(oldNode.data.label, nodes.concat(newNodes))
            : generateUniqueNodeLabel(oldNode.data.label, newNodeParentId, nodes.concat(newNodes))
        },
      };
      newNodes.push(newNode);
    });

    // For proxy nodes, remap targetId if the target was also copied
    newNodes.forEach(node => {
      if (node.type === 'proxyNode') {
        const data = node.data as unknown as { targetId: string };
        const remappedTargetId = newIdMap.get(data.targetId);
        if (remappedTargetId) {
          data.targetId = remappedTargetId;
        }
        // If not remapped, keep original targetId (proxy still points to original target)
      }
    });

    // Remap data.initial (id of the initial child state) if that child was copied too.
    newNodes.forEach(node => {
      const initialId = node.data?.initial as string | undefined;
      if (initialId) {
        const remapped = newIdMap.get(initialId);
        if (remapped) {
          node.data = { ...node.data, initial: remapped };
        }
      }
    });

    const pastedEdges = copiedEdges.map(edge => {
      const newSource = newIdMap.get(edge.source)!;
      const newTarget = newIdMap.get(edge.target)!;
      return {
        ...edge,
        id: `e${newSource}-${newTarget}-${getNextId()}`,
        source: newSource,
        target: newTarget,
        selected: false,
        data: edge.data ? {
          ...edge.data,
          controlPoints: edge.data.controlPoints ? [...edge.data.controlPoints] : [],
        } : { controlPoints: [], label: '' },
      };
    });

    saveSnapshot();
    setNodes((nds) => {
      const deselectedExistingNodes = nds.map(node => ({ ...node, selected: false }));
      return deselectedExistingNodes.concat(newNodes.map(node => ({...node, selected: true})));
    });
    setEdges((eds) => eds.concat(pastedEdges));
    setSelectedTreeItem(newNodes.length > 0 ? newNodes[0].id : null);

  }, [nodes, setNodes, setEdges, setSelectedTreeItem, saveSnapshot]);

  const duplicateNodes = useCallback((includeExternalEdges: boolean) => {
    const selectedNodes = nodes.filter(node => node.selected);
    if (selectedNodes.length === 0) {
      return;
    }

    const nodesToCopySet = new Set<Node>();
    selectedNodes.forEach(sNode => {
      nodesToCopySet.add(sNode);
      const descendants = getAllDescendants(sNode.id, nodes);
      descendants.forEach(dNode => nodesToCopySet.add(dNode));
    });

    const nodesToDuplicate = Array.from(nodesToCopySet).map(node => ({ ...node }));

    const newIdMap = new Map<string, string>();
    const duplicatedNodes: Node[] = [];
    const offset = { x: 50, y: 50 };

    const externalSelectedNodes = nodes.filter(n => n.selected && !nodesToDuplicate.some(dn => dn.id === n.id));
    let potentialParentNodeId: string | null = null;
    if (externalSelectedNodes.length === 1) {
      potentialParentNodeId = externalSelectedNodes[0].id;
    }

    nodesToDuplicate.forEach(oldNode => {
      const newId = getNextId();
      newIdMap.set(oldNode.id, newId);

      let newNodeParentId: string | undefined = oldNode.parentId;
      let newNodeExtent = oldNode.extent;

      if (potentialParentNodeId && (!oldNode.parentId || !nodesToDuplicate.some(n => n.id === oldNode.parentId))) {
        newNodeParentId = potentialParentNodeId;
        newNodeExtent = 'parent';
      } else if (oldNode.parentId && nodesToDuplicate.some(n => n.id === oldNode.parentId)) {
        newNodeParentId = newIdMap.get(oldNode.parentId);
      } else {
        // Top-level node of the duplicated set: keep its original parent so the
        // duplicate becomes a sibling of the original (root stays at root,
        // nested stays under the same parent).
        newNodeParentId = oldNode.parentId;
        newNodeExtent = oldNode.extent;
      }

      let newPosition;
      if (potentialParentNodeId && newNodeParentId === potentialParentNodeId) {
        newPosition = { x: offset.x, y: offset.y };
      } else if (oldNode.parentId && nodesToDuplicate.some(n => n.id === oldNode.parentId)) {
        newPosition = { ...oldNode.position };
      } else {
        newPosition = { x: oldNode.position.x + offset.x, y: oldNode.position.y + offset.y };
      }

      const newNode = {
        ...oldNode,
        id: newId,
        selected: false,
        position: newPosition,
        parentId: newNodeParentId,
        extent: newNodeExtent,
        data: {
          ...oldNode.data,
          label: oldNode.type === 'decisionNode'
            ? generateUniqueDecisionLabel(oldNode.data.label, nodes.concat(duplicatedNodes))
            : generateUniqueNodeLabel(oldNode.data.label, newNodeParentId, nodes.concat(duplicatedNodes))
        },
      };
      duplicatedNodes.push(newNode);
    });

    // For proxy nodes, remap targetId if the target was also duplicated
    duplicatedNodes.forEach(node => {
      if (node.type === 'proxyNode') {
        const data = node.data as unknown as { targetId: string };
        const remappedTargetId = newIdMap.get(data.targetId);
        if (remappedTargetId) {
          data.targetId = remappedTargetId;
        }
      }
    });

    // Remap data.initial (id of the initial child state) if that child was duplicated too.
    duplicatedNodes.forEach(node => {
      const initialId = node.data?.initial as string | undefined;
      if (initialId) {
        const remapped = newIdMap.get(initialId);
        if (remapped) {
          node.data = { ...node.data, initial: remapped };
        }
      }
    });

    const duplicatedNodeIds = new Set(nodesToDuplicate.map(n => n.id));

    // Internal edges: both endpoints inside the duplicated set.
    // Edge id includes a fresh counter so parallel edges (same source/target
    // pair) get distinct ids — otherwise React complains about duplicate keys.
    const cloneEdge = (edge: Edge, newSource: string, newTarget: string) => ({
      ...edge,
      id: `e${newSource}-${newTarget}-${getNextId()}`,
      source: newSource,
      target: newTarget,
      selected: false,
      data: edge.data ? {
        ...edge.data,
        controlPoints: edge.data.controlPoints ? [...edge.data.controlPoints] : [],
      } : { controlPoints: [], label: '' },
    });

    const internalEdges = edges
      .filter(edge => duplicatedNodeIds.has(edge.source) && duplicatedNodeIds.has(edge.target))
      .map(edge => cloneEdge(edge, newIdMap.get(edge.source)!, newIdMap.get(edge.target)!));

    // External edges: one endpoint inside, one outside
    let externalEdges: Edge[] = [];
    if (includeExternalEdges) {
      externalEdges = edges
        .filter(edge => {
          const srcIn = duplicatedNodeIds.has(edge.source);
          const tgtIn = duplicatedNodeIds.has(edge.target);
          return (srcIn && !tgtIn) || (!srcIn && tgtIn);
        })
        .map(edge => {
          const newSource = duplicatedNodeIds.has(edge.source) ? newIdMap.get(edge.source)! : edge.source;
          const newTarget = duplicatedNodeIds.has(edge.target) ? newIdMap.get(edge.target)! : edge.target;
          return cloneEdge(edge, newSource, newTarget);
        });
    }

    const allDuplicatedEdges = internalEdges.concat(externalEdges);

    saveSnapshot();
    setNodes((nds) => {
      const deselectedExistingNodes = nds.map(node => ({ ...node, selected: false }));
      return deselectedExistingNodes.concat(duplicatedNodes.map(node => ({...node, selected: true})));
    });
    setEdges((eds) => eds.concat(allDuplicatedEdges));
    setSelectedTreeItem(duplicatedNodes.length > 0 ? duplicatedNodes[0].id : null);

  }, [nodes, edges, setNodes, setEdges, setSelectedTreeItem, saveSnapshot]);

  const handleDuplicate = useCallback(() => {
    duplicateNodes(false);
  }, [duplicateNodes]);

  const handleDuplicateWithExternalEdges = useCallback(() => {
    duplicateNodes(true);
  }, [duplicateNodes]);

  return { handleCopy, handlePaste, handleDuplicate, handleDuplicateWithExternalEdges };
}
