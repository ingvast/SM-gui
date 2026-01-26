import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import PropertiesPanel from './PropertiesPanel'; // Import the PropertiesPanel component

const nodeTypes = { stateNode: StateNode }; // Define the custom node type

const initialNodes = [
  { 
    id: '1', 
    type: 'stateNode', // Set the type
    position: { x: 0, y: 0 }, 
    data: { label: 'State 1', history: false }, // Add history property
    style: { width: 150, height: 50 }, // Set initial size
  },
  { 
    id: '2', 
    type: 'stateNode', // Set the type
    position: { x: 0, y: 150 }, 
    data: { label: 'State 2', history: false }, // Add history property
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
  const [rootHistory, setRootHistory] = useState(false); // State for root history property

  // Find the selected node object
  const selectedNode = useMemo(() => {
    if (selectedTreeItem === '/') {
      return {
        id: '/',
        data: { label: '/', history: rootHistory },
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
        if (sibling.data.label.trim() === newLabel.trim()) { // Use trim for comparison
          isUnique = false;
          counter++;
          newLabel = `${baseLabel} ${counter}`;
          break;
        }
      }
    }
    return newLabel;
  }, []); // No external dependencies, as currentNodes is passed as argument.

  const buildTreeData = useCallback(() => {
    const nodesMap = new Map(nodes.map(node => [node.id, { ...node, children: [] }]));
    
    // First pass: attach children to parents based on parentId
    nodes.forEach(node => {
      if (node.parentId) {
        const parent = nodesMap.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        }
      }
    });

    // Recursive helper to build the subtree for a given node
    const buildSubtree = (nodeItem) => {
      const childrenNodes = nodesMap.get(nodeItem.id).children; // Get actual child nodes from the map

      const treeNode = {
        id: nodeItem.id,
        label: nodeItem.data.label,
        type: 'state',
        children: []
      };

      // Recursively build children
      childrenNodes.forEach(childNode => {
        treeNode.children.push(buildSubtree(childNode)); // Directly add substates
      });

      return treeNode;
    };

    const tree = [];
    // Build the top-level tree
    nodesMap.forEach(node => {
      if (!node.parentId) { // Top-level node
        tree.push(buildSubtree(node));
      }
    });

    // Wrap in a root node
    return [{
      id: '/',
      label: '/',
      type: 'root',
      children: tree,
    }];
  }, [nodes]); // Edges are no longer a direct dependency of buildTreeData


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

    if (itemType === 'root') {
        setNodes((nds) =>
            nds.map((node) => ({
                ...node,
                selected: false, // Deselect all nodes
            }))
        );
        setEdges((eds) =>
            eds.map((edge) => ({
                ...edge,
                selected: false, // Deselect all edges
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

  // Handle property changes from the PropertiesPanel
  const handlePropertyChange = useCallback((nodeId, propertyName, newValue) => {
    if (nodeId === '/') {
      if (propertyName === 'history') {
        setRootHistory(newValue);
      }
      // Other root properties can be handled here
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
          n.parentId === nodeToChange.parentId // Siblings share the same parentId
        );

        const isDuplicate = siblings.some(s => s.data.label.trim() === trimmedNewValue);

        if (isDuplicate) {
          alert(`A sibling state with the name "${trimmedNewValue}" already exists!`);
          return; // Prevent update
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
  }, [nodes, setNodes, setRootHistory]); // Add setRootHistory to dependencies


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
          data: { label: generateUniqueNodeLabel('New State', undefined, nodes), history: false }, // Add history property
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
          data: { label: generateUniqueNodeLabel('New Nested State', node.id, nodes), history: false }, // Add history property
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
      <div className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexShrink: 0 }}> {/* Tree View */}
          <h3>State Tree</h3>
          <StateTree treeData={treeData} onSelect={handleTreeSelect} selectedItemId={selectedTreeItem} />
        </div>
        <div className="properties-panel" style={{ flexGrow: 1, overflowY: 'auto', padding: '10px' }}>
          <h3>Properties</h3>
          <PropertiesPanel 
            selectedNode={selectedNode} 
            onPropertyChange={handlePropertyChange} 
          />
        </div>
      </div>
      <div className={`reactflow-container ${isAddingNode ? 'crosshair' : ''}`} style={{ flexGrow: 1 }}>
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