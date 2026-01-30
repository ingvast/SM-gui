import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  Node,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  Button,
  Box,
  Paper,
  Typography,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  FolderOpen as OpenIcon,
  Save as SaveIcon,
  FileDownload as ExportIcon,
} from '@mui/icons-material';

import './index.css';
import StateNode from './StateNode';
import StateTree from './StateTree';
import PropertiesPanel from './PropertiesPanel';
import SplineEdge from './SplineEdge';
import { convertToYaml, convertFromYaml } from './yamlConverter';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    background: {
      default: '#fafafa',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
  },
});

// Type declaration for the file API exposed from preload
declare global {
  interface Window {
    fileAPI: {
      saveFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
      exportFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
      openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; canceled?: boolean; error?: string }>;
    };
  }
}

const nodeTypes = { stateNode: StateNode };
const edgeTypes = { spline: SplineEdge };

const initialNodes = [
  { 
    id: '1', 
    type: 'stateNode', // Set the type
    position: { x: 0, y: 0 }, 
    data: { label: 'State 1', history: false, entry: '', exit: '', do: '' }, // Add new properties
    style: { width: 150, height: 50 }, // Set initial size
  },
  { 
    id: '2', 
    type: 'stateNode', // Set the type
    position: { x: 0, y: 150 }, 
    data: { label: 'State 2', history: false, entry: '', exit: '', do: '' }, // Add new properties
    style: { width: 150, height: 50 }, // Set initial size
  },
];

const initialEdges = [
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    type: 'spline',
    data: { controlPoints: [], label: '' },
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

let idCounter = 3; // Use a distinct name for clarity
const getNextId = () => `node_${idCounter++}`;
  
const App = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow(); // Use screenToFlowPosition instead of project

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      type: 'spline',
      data: { controlPoints: [], label: '' },
      markerEnd: { type: MarkerType.ArrowClosed },
    }, eds)),
    [setEdges]
  );

  const isValidConnection = useCallback(
    (connection) => connection.source !== connection.target,
    []
  );

  // Handle edge reconnection (dragging edge endpoints to new handles/nodes)
  const onReconnect = useCallback(
    (oldEdge, newConnection) => {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === oldEdge.id) {
            return {
              ...edge,
              source: newConnection.source,
              target: newConnection.target,
              sourceHandle: newConnection.sourceHandle,
              targetHandle: newConnection.targetHandle,
            };
          }
          return edge;
        })
      );
    },
    [setEdges]
  );

  const [isAddingNode, setIsAddingNode] = useState(false);
  const [selectedTreeItem, setSelectedTreeItem] = useState(null);
  const [rootHistory, setRootHistory] = useState(false);
  const [copiedNodes, setCopiedNodes] = useState([]);
  const [copiedEdges, setCopiedEdges] = useState([]);

  const selectedNode = useMemo(() => {
    if (selectedTreeItem === '/') {
      // Ensure root node also has entry, exit, do properties
      return {
        id: '/',
        data: { label: '/', history: rootHistory, entry: '', exit: '', do: '' },
      };
    }
    return nodes.find(n => n.id === selectedTreeItem);
  }, [nodes, selectedTreeItem, rootHistory]);

  const generateUniqueNodeLabel = useCallback((baseLabel, parentId, currentNodes) => {
    let counter = 1;
    let newLabel = baseLabel;
    let isUnique = false;

    while (!isUnique) {
      isUnique = true;
      const siblings = currentNodes.filter(n => n.parentId === parentId);
      for (const sibling of siblings) {
        if (sibling.data.label.trim() === newLabel.trim()) {
          isUnique = false;
          counter++;
          newLabel = `${baseLabel} ${counter}`;
          break;
        }
      }
    }
    return newLabel;
  }, []);

  const getAllDescendants = useCallback((parentNodeId, allNodes) => {
    const descendants = [];
    const queue = [parentNodeId];
    const visited = new Set();

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const children = allNodes.filter(n => n.parentId === currentId);
      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }
    return descendants;
  }, []);

  const handleCopy = useCallback(() => {
    const selectedNodes = nodes.filter(node => node.selected);
    if (selectedNodes.length === 0) {
      console.log('No nodes selected to copy.');
      setCopiedNodes([]);
      setCopiedEdges([]);
      return;
    }

    const nodesToCopySet = new Set();

    selectedNodes.forEach(sNode => {
      nodesToCopySet.add(sNode);
      const descendants = getAllDescendants(sNode.id, nodes);
      descendants.forEach(dNode => nodesToCopySet.add(dNode));
    });

    const finalNodesToCopy = Array.from(nodesToCopySet).map(node => ({ ...node }));
    const copiedNodeIds = new Set(finalNodesToCopy.map(n => n.id));

    // Copy edges where both source and target are in the copied set (deep copy data)
    const edgesToCopy = edges
      .filter(edge => copiedNodeIds.has(edge.source) && copiedNodeIds.has(edge.target))
      .map(edge => ({
        ...edge,
        data: edge.data ? {
          ...edge.data,
          controlPoints: edge.data.controlPoints ? [...edge.data.controlPoints] : [],
        } : { controlPoints: [], label: '' },
      }));

    setCopiedNodes(finalNodesToCopy);
    setCopiedEdges(edgesToCopy);
    console.log('Nodes copied:', finalNodesToCopy.map(n => n.id));
    console.log('Edges copied:', edgesToCopy.map(e => e.id));
  }, [nodes, edges, getAllDescendants]);

    const handlePaste = useCallback(() => {
      if (copiedNodes.length === 0) {
        console.log('No nodes to paste.');
        return;
      }
  
      const newIdMap = new Map();
      const newNodes = [];
      const offset = { x: 50, y: 50 }; // Default relative offset for new child nodes
  
      // Determine if there's a selected node to act as a parent
      const currentlySelectedNode = nodes.find(n => n.selected);
      let potentialParentNodeId = null;
  
      if (currentlySelectedNode && !copiedNodes.some(n => n.id === currentlySelectedNode.id)) {
        potentialParentNodeId = currentlySelectedNode.id;
      }
  
      copiedNodes.forEach(oldNode => {
        const newId = getNextId();
        newIdMap.set(oldNode.id, newId);
  
        // Determine parentId for the new node
        let newNodeParentId = oldNode.parentId;
        let newNodeExtent = oldNode.extent;
  
        if (potentialParentNodeId && (!oldNode.parentId || !copiedNodes.some(n => n.id === oldNode.parentId))) {
          // If there's a selected node and the oldNode doesn't have a copied parent,
          // make it a child of the selected node.
          newNodeParentId = potentialParentNodeId;
          newNodeExtent = 'parent';
        } else if (oldNode.parentId && copiedNodes.some(n => n.id === oldNode.parentId)) {
          // Original parent was copied, remap to new parent ID
          newNodeParentId = newIdMap.get(oldNode.parentId);
        } else {
          // No parent, or parent not copied and no selected node acts as parent, so it's top-level
          newNodeParentId = undefined;
          newNodeExtent = undefined;
        }
  
        // Calculate position
        let newPosition;
        if (potentialParentNodeId && newNodeParentId === potentialParentNodeId) {
          // If it's becoming a child of the selected node, place it at a default relative position
          newPosition = { x: offset.x, y: offset.y };
        } else if (oldNode.parentId && copiedNodes.some(n => n.id === oldNode.parentId)) {
          // Child of another copied node - keep same relative position within parent
          newPosition = { ...oldNode.position };
        } else {
          // Top-level node (no parent, or parent not copied), apply offset
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
      
      // Paste edges with remapped IDs (deep copy data)
      const pastedEdges = copiedEdges.map(edge => ({
        ...edge,
        id: `e${newIdMap.get(edge.source)}-${newIdMap.get(edge.target)}`,
        source: newIdMap.get(edge.source),
        target: newIdMap.get(edge.target),
        selected: false,
        data: edge.data ? {
          ...edge.data,
          controlPoints: edge.data.controlPoints ? [...edge.data.controlPoints] : [],
        } : { controlPoints: [], label: '' },
      }));

      setNodes((nds) => {
        const deselectedExistingNodes = nds.map(node => ({ ...node, selected: false }));
        return deselectedExistingNodes.concat(newNodes.map(node => ({...node, selected: true})));
      });
      setEdges((eds) => eds.concat(pastedEdges));
      setSelectedTreeItem(newNodes.length > 0 ? newNodes[0].id : null);

      // Removed setCopiedNodes([]); to allow multiple pastes
      console.log('Nodes pasted.');
      console.log('Edges pasted:', pastedEdges.map(e => e.id));
    }, [copiedNodes, copiedEdges, nodes, setNodes, setEdges, generateUniqueNodeLabel, setSelectedTreeItem]);
  const handleDuplicate = useCallback(() => {
    const selectedNodes = nodes.filter(node => node.selected);
    if (selectedNodes.length === 0) {
      console.log('No nodes selected to duplicate.');
      return;
    }

    const nodesToCopySet = new Set();
    selectedNodes.forEach(sNode => {
      nodesToCopySet.add(sNode);
      const descendants = getAllDescendants(sNode.id, nodes);
      descendants.forEach(dNode => nodesToCopySet.add(dNode));
    });

    const nodesToDuplicate = Array.from(nodesToCopySet).map(node => ({ ...node }));

    const newIdMap = new Map();
    const duplicatedNodes = [];
    const offset = { x: 50, y: 50 }; // Default relative offset for new child nodes

    // --- Start: Logic for potential external parent ---
    const currentlySelectedNode = nodes.find(n => n.selected);
    let potentialParentNodeId = null;

    // For duplication, ensure the selected node for parenting is NOT one of the nodes being duplicated
    // This is to avoid a node trying to parent itself or its own duplicated subgraph.
    // The request is 'if a state is previously selected'.
    // If the *only* selected items are the ones being duplicated, then they should duplicate as siblings.
    // If there's one *external* selected node, then the duplicated nodes should attach to it.
    const externalSelectedNodes = nodes.filter(n => n.selected && !nodesToDuplicate.some(dn => dn.id === n.id));
    if (externalSelectedNodes.length === 1) {
      potentialParentNodeId = externalSelectedNodes[0].id;
    }
    // --- End: Logic for potential external parent ---

    nodesToDuplicate.forEach(oldNode => {
      const newId = getNextId();
      newIdMap.set(oldNode.id, newId);

      let newNodeParentId = oldNode.parentId;
      let newNodeExtent = oldNode.extent;

      if (potentialParentNodeId && (!oldNode.parentId || !nodesToDuplicate.some(n => n.id === oldNode.parentId))) {
        // If there's an external selected node and this oldNode doesn't have a duplicated parent,
        // make it a child of the external selected node.
        newNodeParentId = potentialParentNodeId;
        newNodeExtent = 'parent';
      } else if (oldNode.parentId && nodesToDuplicate.some(n => n.id === oldNode.parentId)) {
        // Original parent was duplicated, remap to new parent ID
        newNodeParentId = newIdMap.get(oldNode.parentId);
      } else {
        // No parent, or parent not duplicated and no external selected node acts as parent, so it's top-level
        newNodeParentId = undefined;
        newNodeExtent = undefined;
      }

      // Calculate position
      let newPosition;
      if (potentialParentNodeId && newNodeParentId === potentialParentNodeId) {
        // If it's becoming a child of the selected external node, place it at a default relative position
        newPosition = { x: offset.x, y: offset.y };
      } else if (oldNode.parentId && nodesToDuplicate.some(n => n.id === oldNode.parentId)) {
        // Child of another duplicated node - keep same relative position within parent
        newPosition = { ...oldNode.position };
      } else {
        // Top-level node (no parent, or parent not duplicated), apply offset
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

    // Duplicate edges (transitions) where both source and target are in the duplicated set (deep copy data)
    const duplicatedNodeIds = new Set(nodesToDuplicate.map(n => n.id));
    const duplicatedEdges = edges
      .filter(edge => duplicatedNodeIds.has(edge.source) && duplicatedNodeIds.has(edge.target))
      .map(edge => ({
        ...edge,
        id: `e${newIdMap.get(edge.source)}-${newIdMap.get(edge.target)}`,
        source: newIdMap.get(edge.source),
        target: newIdMap.get(edge.target),
        selected: false,
        data: edge.data ? {
          ...edge.data,
          controlPoints: edge.data.controlPoints ? [...edge.data.controlPoints] : [],
        } : { controlPoints: [], label: '' },
      }));

    setNodes((nds) => {
      const deselectedExistingNodes = nds.map(node => ({ ...node, selected: false }));
      return deselectedExistingNodes.concat(duplicatedNodes.map(node => ({...node, selected: true})));
    });
    setEdges((eds) => eds.concat(duplicatedEdges));
    setSelectedTreeItem(duplicatedNodes.length > 0 ? duplicatedNodes[0].id : null);

    console.log('Nodes duplicated.');
  }, [nodes, edges, getAllDescendants, getNextId, generateUniqueNodeLabel, setNodes, setEdges, setSelectedTreeItem]);

  const handleSave = useCallback(async () => {
    const yamlContent = convertToYaml(nodes as Node<{ label: string; history: boolean; entry: string; exit: string; do: string }>[], edges, rootHistory, true);
    const result = await window.fileAPI.saveFile(yamlContent, 'statemachine.yaml');
    if (result.success) {
      console.log('Saved to:', result.filePath);
    } else if (result.error) {
      alert('Error saving file: ' + result.error);
    }
  }, [nodes, edges, rootHistory]);

  const handleExport = useCallback(async () => {
    const yamlContent = convertToYaml(nodes as Node<{ label: string; history: boolean; entry: string; exit: string; do: string }>[], edges, rootHistory, false);
    const result = await window.fileAPI.exportFile(yamlContent, 'statemachine.yaml');
    if (result.success) {
      console.log('Exported to:', result.filePath);
    } else if (result.error) {
      alert('Error exporting file: ' + result.error);
    }
  }, [nodes, edges, rootHistory]);

  const handleOpen = useCallback(async () => {
    const result = await window.fileAPI.openFile();
    if (result.success && result.content) {
      try {
        const { nodes: loadedNodes, edges: loadedEdges, rootHistory: loadedRootHistory } = convertFromYaml(result.content);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        setRootHistory(loadedRootHistory);
        setSelectedTreeItem(null);
        // Update idCounter to avoid conflicts
        const maxId = loadedNodes.reduce((max, node) => {
          const match = node.id.match(/node_(\d+)/);
          if (match) {
            return Math.max(max, parseInt(match[1], 10));
          }
          return max;
        }, 0);
        idCounter = maxId + 1;
        console.log('Opened:', result.filePath);
      } catch (error) {
        alert('Error parsing YAML file: ' + (error as Error).message);
      }
    } else if (result.error) {
      alert('Error opening file: ' + result.error);
    }
  }, [setNodes, setEdges, setRootHistory, setSelectedTreeItem]);

  const handleNew = useCallback(() => {
    if (nodes.length > 0) {
      const confirmed = window.confirm('Are you sure you want to create a new state machine? Unsaved changes will be lost.');
      if (!confirmed) {
        return;
      }
    }
    setNodes([]);
    setEdges([]);
    setRootHistory(false);
    setSelectedTreeItem(null);
    idCounter = 1;
    console.log('New state machine created.');
  }, [nodes, setNodes, setEdges, setRootHistory, setSelectedTreeItem]);

  const buildTreeData = useCallback(() => {
    const nodesMap = new Map(nodes.map(node => [node.id, { ...node, children: [] }]));
    
    nodes.forEach(node => {
      if (node.parentId) {
        const parent = nodesMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        }
      }
    });

    const buildSubtree = (nodeItem) => {
      const childrenNodes = nodesMap.get(nodeItem.id).children;

      const treeNode = {
        id: nodeItem.id,
        label: nodeItem.data.label,
        type: 'state',
        children: []
      };

      childrenNodes.forEach(childNode => {
        treeNode.children.push(buildSubtree(childNode));
      });

      return treeNode;
    };

    const tree = [];
    nodesMap.forEach(node => {
      if (!node.parentId) {
        tree.push(buildSubtree(node));
      }
    });

    return [{
      id: '/',
      label: '/',
      type: 'root',
      children: tree,
    }];
  }, [nodes]);

  const treeData = buildTreeData();

  const onNodesChangeWithSelection = useCallback(
    (changes) => {
      onNodesChange(changes);
      changes.forEach(change => {
        if (change.type === 'select' && change.selected) {
          setSelectedTreeItem(change.id);
        } else if (change.type === 'select' && !change.selected && selectedTreeItem === change.id) {
          setSelectedTreeItem(null);
        }
      });
    },
    [onNodesChange, selectedTreeItem]
  );

  const onEdgesChangeWithSelection = useCallback(
    (changes) => {
      onEdgesChange(changes);
      changes.forEach(change => {
        if (change.type === 'select' && change.selected) {
          setSelectedTreeItem(change.id);
        } else if (change.type === 'select' && !change.selected && selectedTreeItem === change.id) {
          setSelectedTreeItem(null);
        }
      });
    },
    [onEdgesChange, selectedTreeItem]
  );

  const handleTreeSelect = useCallback((itemId, itemType) => {
    setSelectedTreeItem(itemId);

    if (itemType === 'root') {
        setNodes((nds) =>
            nds.map((node) => ({
                ...node,
                selected: false,
            }))
        );
        setEdges((eds) =>
            eds.map((edge) => ({
                ...edge,
                selected: false,
            }))
        );
    } else if (itemType === 'state') {
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          selected: node.id === itemId,
        }))
      );
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          selected: false,
        }))
      );
    } else if (itemType === 'transition') {
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          selected: edge.id === itemId,
        }))
      );
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          selected: false,
        }))
      );
    }
  }, [setNodes, setEdges]);

  const handlePropertyChange = useCallback((nodeId, propertyName, newValue) => {
    if (nodeId === '/') {
      if (propertyName === 'history') {
        setRootHistory(newValue);
      } else if (propertyName === 'entry' || propertyName === 'exit' || propertyName === 'do') {
        // If other properties need to be stored for the root, a dedicated state for root properties would be needed.
        // For now, we will just ignore these properties for the root unless a specific state is created for them.
        console.log(`Attempted to change root property ${propertyName} to ${newValue}, but root properties are currently read-only except 'history'.`);
      }
      return;
    }

    if (propertyName === 'label') {
      const trimmedNewValue = newValue.trim();
      if (!trimmedNewValue) {
        alert('State name cannot be empty!');
        return;
      }

      const nodeToChange = nodes.find(n => n.id === nodeId);
      if (nodeToChange) {
        const siblings = nodes.filter(n =>
          n.id !== nodeId &&
          n.parentId === nodeToChange.parentId
        );

        const isDuplicate = siblings.some(s => s.data.label.trim() === trimmedNewValue);

        if (isDuplicate) {
          alert(`A sibling state with the name "${trimmedNewValue}" already exists!`);
          return;
        }
      }
    }

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              [propertyName]: newValue,
            },
          };
        }
        return node;
      })
    );
  }, [nodes, setNodes, setRootHistory]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isModifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (event.key === 'n' && !isModifierPressed) {
        event.preventDefault();
        setIsAddingNode(true);
      } else if (isModifierPressed) {
        switch (event.key) {
          case 'c':
            event.preventDefault();
            handleCopy();
            break;
          case 'v':
            event.preventDefault();
            handlePaste();
            break;
          case 'd':
            event.preventDefault();
            handleDuplicate();
            break;
          case 's':
            event.preventDefault();
            if (event.shiftKey) {
              handleExport();
            } else {
              handleSave();
            }
            break;
          case 'o':
            event.preventDefault();
            handleOpen();
            break;
          default:
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleCopy, handlePaste, handleDuplicate, handleSave, handleExport, handleOpen, setIsAddingNode]);

  const onPaneClick = useCallback(
    (event) => {
      if (isAddingNode) {
        const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const newNode = {
          id: getNextId(),
          type: 'stateNode',
          position: flowPosition,
          data: { label: generateUniqueNodeLabel('New State', undefined, nodes), history: false, entry: '', exit: '', do: '' },
          style: { width: 150, height: 50 },
        };
        setNodes((nds) => nds.concat(newNode));
        setIsAddingNode(false);
      } else {
        setSelectedTreeItem(null);
        setNodes((nds) =>
          nds.map((node) => ({ ...node, selected: false }))
        );
        setEdges((eds) =>
          eds.map((edge) => ({ ...edge, selected: false }))
        );
      }
    },
    [isAddingNode, screenToFlowPosition, setNodes, setEdges, generateUniqueNodeLabel, nodes]
  );

  const onNodeClick = useCallback(
    (event, node) => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: n.id === node.id,
        }))
      );
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          selected: false,
        }))
      );
      setSelectedTreeItem(node.id);

      if (isAddingNode && node.selected && node.width && node.height) {
        const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });

        const defaultNodeWidth = 150;
        const defaultNodeHeight = 50;

        let newRelativePosition = {
          x: flowPosition.x - node.position.x,
          y: flowPosition.y - node.position.y,
        };

        const safePadding = 10;

        newRelativePosition.x = Math.max(safePadding, newRelativePosition.x);
        if (node.width) {
            newRelativePosition.x = Math.min(node.width - defaultNodeWidth - safePadding, newRelativePosition.x);
        }
        
        newRelativePosition.y = Math.max(safePadding, newRelativePosition.y);
        if (node.height) {
            newRelativePosition.y = Math.min(node.height - defaultNodeHeight - safePadding, newRelativePosition.y);
        }
        
        const newNode = {
          id: getNextId(),
          type: 'stateNode',
          position: newRelativePosition,
          parentId: node.id,
          extent: 'parent',
          data: { label: generateUniqueNodeLabel('New Nested State', node.id, nodes), history: false, entry: '', exit: '', do: '' },
          style: { width: defaultNodeWidth, height: defaultNodeHeight },
        };
        setNodes((nds) => nds.concat(newNode));
        setIsAddingNode(false);
        event.stopPropagation();
      }
    },
    [isAddingNode, setNodes, setEdges, screenToFlowPosition, getNextId, setSelectedTreeItem, nodes, generateUniqueNodeLabel]
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Tooltip title="New (Cmd+N)">
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleNew}
            >
              New
            </Button>
          </Tooltip>
          <Tooltip title="Open (Cmd+O)">
            <Button
              variant="outlined"
              size="small"
              startIcon={<OpenIcon />}
              onClick={handleOpen}
            >
              Open
            </Button>
          </Tooltip>
          <Tooltip title="Save (Cmd+S)">
            <Button
              variant="contained"
              size="small"
              startIcon={<SaveIcon />}
              onClick={handleSave}
            >
              Save
            </Button>
          </Tooltip>
          <Tooltip title="Export (Cmd+Shift+S)">
            <Button
              variant="outlined"
              size="small"
              startIcon={<ExportIcon />}
              onClick={handleExport}
            >
              Export
            </Button>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            Cmd+S: Save | Cmd+Shift+S: Export | Cmd+O: Open
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        <Paper
          elevation={0}
          sx={{
            width: 280,
            display: 'flex',
            flexDirection: 'column',
            borderRight: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ p: 2, flexShrink: 0 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              State Tree
            </Typography>
            <StateTree treeData={treeData} onSelect={handleTreeSelect} selectedItemId={selectedTreeItem} />
          </Box>

          <Divider />

          <Box sx={{ p: 2, flexGrow: 1, overflowY: 'auto' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Properties
            </Typography>
            <PropertiesPanel
              selectedNode={selectedNode}
              onPropertyChange={handlePropertyChange}
            />
          </Box>
        </Paper>

        <Box
          className={isAddingNode ? 'crosshair' : ''}
          sx={{ flexGrow: 1, position: 'relative' }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChangeWithSelection}
            onEdgesChange={onEdgesChangeWithSelection}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onPaneClick={onPaneClick}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            isValidConnection={isValidConnection}
            reconnectRadius={10}
            fitView
          />
        </Box>
      </Box>
    </Box>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </ThemeProvider>
  </React.StrictMode>
);
