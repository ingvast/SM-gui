import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { getAllDescendants, generateUniqueNodeLabel } from '../utils/nodeUtils';
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
      console.log('No nodes selected to copy.');
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

    console.log('Nodes copied:', finalNodesToCopy.map(n => n.id));
    console.log('Edges copied:', edgesToCopy.map(e => e.id));
  }, [nodes, edges]);

  const handlePaste = useCallback(async () => {
    let copiedNodes: Node[] = [];
    let copiedEdges: Edge[] = [];

    try {
      const text = await navigator.clipboard.readText();
      if (!text.startsWith(CLIPBOARD_MARKER)) {
        console.log('Clipboard does not contain SM-GUI data.');
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
      console.log('No nodes to paste.');
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
      if (potentialParentNodeId && newNodeParentId === potentialParentNodeId) {
        newPosition = { x: offset.x, y: offset.y };
      } else if (oldNode.parentId && copiedNodes.some(n => n.id === oldNode.parentId)) {
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
          label: generateUniqueNodeLabel(oldNode.data.label, newNodeParentId, nodes.concat(newNodes))
        },
      };
      newNodes.push(newNode);
    });

    const pastedEdges = copiedEdges.map(edge => ({
      ...edge,
      id: `e${newIdMap.get(edge.source)}-${newIdMap.get(edge.target)}`,
      source: newIdMap.get(edge.source)!,
      target: newIdMap.get(edge.target)!,
      selected: false,
      data: edge.data ? {
        ...edge.data,
        controlPoints: edge.data.controlPoints ? [...edge.data.controlPoints] : [],
      } : { controlPoints: [], label: '' },
    }));

    saveSnapshot();
    setNodes((nds) => {
      const deselectedExistingNodes = nds.map(node => ({ ...node, selected: false }));
      return deselectedExistingNodes.concat(newNodes.map(node => ({...node, selected: true})));
    });
    setEdges((eds) => eds.concat(pastedEdges));
    setSelectedTreeItem(newNodes.length > 0 ? newNodes[0].id : null);

    console.log('Nodes pasted.');
    console.log('Edges pasted:', pastedEdges.map(e => e.id));
  }, [nodes, setNodes, setEdges, setSelectedTreeItem, saveSnapshot]);

  const duplicateNodes = useCallback((includeExternalEdges: boolean) => {
    const selectedNodes = nodes.filter(node => node.selected);
    if (selectedNodes.length === 0) {
      console.log('No nodes selected to duplicate.');
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
        newNodeParentId = undefined;
        newNodeExtent = undefined;
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
          label: generateUniqueNodeLabel(oldNode.data.label, newNodeParentId, nodes.concat(duplicatedNodes))
        },
      };
      duplicatedNodes.push(newNode);
    });

    const duplicatedNodeIds = new Set(nodesToDuplicate.map(n => n.id));

    // Internal edges: both endpoints inside the duplicated set
    const cloneEdge = (edge: Edge, newSource: string, newTarget: string) => ({
      ...edge,
      id: `e${newSource}-${newTarget}`,
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

    console.log('Nodes duplicated', includeExternalEdges ? '(with external edges).' : '.');
  }, [nodes, edges, setNodes, setEdges, setSelectedTreeItem, saveSnapshot]);

  const handleDuplicate = useCallback(() => {
    duplicateNodes(false);
  }, [duplicateNodes]);

  const handleDuplicateWithExternalEdges = useCallback(() => {
    duplicateNodes(true);
  }, [duplicateNodes]);

  return { handleCopy, handlePaste, handleDuplicate, handleDuplicateWithExternalEdges };
}
