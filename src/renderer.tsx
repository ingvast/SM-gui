import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import './index.css';
import StateNode from './StateNode'; // Import the custom node
import StateTree from './StateTree'; // Import the StateTree component

const nodeTypes = { stateNode: StateNode }; // Define the custom node type

const initialNodes = [
  { 
    id: '1', 
    type: 'stateNode', // Set the type
    position: { x: 0, y: 0 }, 
    data: { label: 'State 1' },
    style: { width: 150, height: 50 }, // Set initial size
  },
  { 
    id: '2', 
    type: 'stateNode', // Set the type
    position: { x: 0, y: 150 }, 
    data: { label: 'State 2' },
    style: { width: 150, height: 50 }, // Set initial size
  },
];

const initialEdges = [
  { 
    id: 'e1-2', 
    source: '1', 
    target: '2', 
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

let id = 3;
const getNextId = () => `node_${id++}`;

const App = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow(); // Use screenToFlowPosition instead of project
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  const isValidConnection = useCallback(
    (connection) => connection.source !== connection.target,
    []
  );

  const [isAddingNode, setIsAddingNode] = useState(false);
  const [selectedTreeItem, setSelectedTreeItem] = useState(null); // State for selected tree item

  const buildTreeData = useCallback(() => {
    const nodesMap = new Map(nodes.map(node => [node.id, { ...node, children: [] }]));
    const tree = [];

    // Populate children for nodes
    nodes.forEach(node => {
      if (node.parentId) {
        const parent = nodesMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        }
      }
    });

    // Build the hierarchical tree
    nodesMap.forEach(node => {
      if (!node.parentId) { // Top-level node
        const stateItem = {
          id: node.id,
          label: node.data.label,
          type: 'state',
          children: []
        };

        // Add transitions as children of the state
        edges.forEach(edge => {
          if (edge.source === node.id) {
            const targetNode = nodesMap.get(edge.target);
            if (targetNode) {
              stateItem.children.push({
                id: edge.id,
                label: `-> ${targetNode.data.label}`,
                type: 'transition',
                parentId: node.id,
              });
            }
          }
        });

        // Add substates
        if (node.children.length > 0) {
          const substatesItem = {
            id: `${node.id}-substates-container`, // Unique ID for the "states" intermediary
            label: 'States',
            type: 'substates-container',
            children: node.children.map(childNode => ({
              id: childNode.id,
              label: childNode.data.label,
              type: 'state',
              parentId: node.id, // Parent ID in the tree
              // Add transitions for substates
              children: edges.filter(edge => edge.source === childNode.id).map(edge => {
                const targetNode = nodesMap.get(edge.target);
                return targetNode ? {
                  id: edge.id,
                  label: `-> ${targetNode.data.label}`,
                  type: 'transition',
                  parentId: childNode.id,
                } : null;
              }).filter(Boolean)
            }))
          };
          stateItem.children.push(substatesItem);
        }
        tree.push(stateItem);
      }
    });
    return tree;
  }, [nodes, edges]);

  const treeData = buildTreeData(); // Get the tree data

  // Canvas to Tree Selection
  const onNodesChangeWithSelection = useCallback(
    (changes) => {
      onNodesChange(changes);
      changes.forEach(change => {
        if (change.type === 'select' && change.selected) {
          setSelectedTreeItem(change.id);
        } else if (change.type === 'select' && !change.selected && selectedTreeItem === change.id) {
          // Deselect if currently selected in tree
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
          // Deselect if currently selected in tree
          setSelectedTreeItem(null);
        }
      });
    },
    [onEdgesChange, selectedTreeItem]
  );

  // Tree to Canvas Selection
  const handleTreeSelect = useCallback((itemId, itemType) => {
    setSelectedTreeItem(itemId);

    if (itemType === 'state') {
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          selected: node.id === itemId,
        }))
      );
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          selected: false, // Deselect all edges
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
          selected: false, // Deselect all nodes
        }))
      );
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'n') {
        event.preventDefault();
        setIsAddingNode(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const onPaneClick = useCallback(
    (event) => {
      if (isAddingNode) {
        // Create a root-level node
        const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY }); // Use screenToFlowPosition
        const newNode = {
          id: getNextId(),
          type: 'stateNode',
          position: flowPosition, // Absolute position
          data: { label: `New State` },
          style: { width: 150, height: 50 },
        };
        setNodes((nds) => nds.concat(newNode));
        setIsAddingNode(false);
      } else {
        // Deselect all if pane is clicked and not adding a node
        setSelectedTreeItem(null);
        setNodes((nds) =>
          nds.map((node) => ({ ...node, selected: false }))
        );
        setEdges((eds) =>
          eds.map((edge) => ({ ...edge, selected: false }))
        );
      }
    },
    [isAddingNode, screenToFlowPosition, setNodes, setEdges] // Changed project to screenToFlowPosition
  );

  const onNodeClick = useCallback(
    (event, node) => {
      // Deselect all other nodes/edges if this node is selected
      // This is necessary because ReactFlow's onNodesChange might not deselect others
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: n.id === node.id,
        }))
      );
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          selected: false, // Deselect all edges
        }))
      );
      setSelectedTreeItem(node.id); // Update tree selection

      if (isAddingNode && node.selected && node.width && node.height) { // Check if the clicked node is selected
        const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY }); // Use screenToFlowPosition

        const defaultNodeWidth = 150; // Use the default width
        const defaultNodeHeight = 50; // Use the default height

        let newRelativePosition = {
          x: flowPosition.x - node.position.x,
          y: flowPosition.y - node.position.y,
        };

        // Ensure the new node's top-left corner is slightly inside the parent's boundary
        const safePadding = 10;

        newRelativePosition.x = Math.max(safePadding, newRelativePosition.x);
        newRelativePosition.y = Math.max(safePadding, newRelativePosition.y);

        // Also ensure it doesn't go too far right/bottom
        if (node.width) {
            newRelativePosition.x = Math.min(node.width - defaultNodeWidth - safePadding, newRelativePosition.x);
        }
        if (node.height) {
            newRelativePosition.y = Math.min(node.height - defaultNodeHeight - safePadding, newRelativePosition.y);
        }
        
        const newNode = {
          id: getNextId(),
          type: 'stateNode',
          position: newRelativePosition, // Relative to parent
          parentId: node.id,
          extent: 'parent',
          data: { label: `New Nested State` },
          style: { width: defaultNodeWidth, height: defaultNodeHeight },
        };
        setNodes((nds) => nds.concat(newNode));
        setIsAddingNode(false);
        event.stopPropagation(); // Prevent onPaneClick from firing
      }
    },
    [isAddingNode, setNodes, setEdges, screenToFlowPosition, getNextId, setSelectedTreeItem, nodes] // Changed project to screenToFlowPosition
  );

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <div className="sidebar">
        <h3>State Tree</h3>
        <StateTree treeData={treeData} onSelect={handleTreeSelect} selectedItemId={selectedTreeItem} />
      </div>
      <div className="reactflow-container" style={{ flexGrow: 1 }} className={isAddingNode ? 'crosshair' : ''}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChangeWithSelection} // Use new handler
          onEdgesChange={onEdgesChangeWithSelection} // Use new handler
          onConnect={onConnect}
          onPaneClick={onPaneClick}
          onNodeClick={onNodeClick} // Add onNodeClick handler
          nodeTypes={nodeTypes}
          isValidConnection={isValidConnection}
          fitView
        />
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </React.StrictMode>
);