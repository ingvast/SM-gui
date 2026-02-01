import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import {
  useSemanticZoomStore,
  getAbsoluteNodeBounds,
  SEMANTIC_ZOOM_CONFIG,
} from './semanticZoom';

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

// Scale factor for nested states (will be configurable later)
const NESTING_SCALE_FACTOR = 0.85;

// Calculate the nesting depth of a node by traversing parentId chain
function calculateNodeDepth(nodeId: string, nodesArray: Node[], cache: Map<string, number> = new Map()): number {
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }

  const node = nodesArray.find(n => n.id === nodeId);
  if (!node || !node.parentId) {
    cache.set(nodeId, 0);
    return 0;
  }

  const parentDepth = calculateNodeDepth(node.parentId, nodesArray, cache);
  const depth = parentDepth + 1;
  cache.set(nodeId, depth);
  return depth;
}

const App = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { setViewport } = useReactFlow();

  // Semantic zoom state
  const {
    focusNodeId,
    zoomLevel,
    panOffset,
    isAnimating,
    animationStartTime,
    setFocusNode,
    adjustZoom,
    adjustPan,
    startAnimation,
    updateAnimation,
    finishAnimation,
  } = useSemanticZoomStore();

  // Viewport size tracking
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Track viewport size
  useEffect(() => {
    const updateSize = () => {
      if (reactFlowWrapper.current) {
        const rect = reactFlowWrapper.current.getBoundingClientRect();
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Animation loop for smooth transitions
  useEffect(() => {
    if (!isAnimating) return;

    let animationFrame: number;
    const animate = () => {
      const elapsed = performance.now() - animationStartTime;
      const progress = Math.min(elapsed / SEMANTIC_ZOOM_CONFIG.TRANSITION_DURATION, 1);

      updateAnimation(progress);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        finishAnimation();
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isAnimating, animationStartTime, updateAnimation, finishAnimation]);

  // Lock ReactFlow viewport to identity - we handle zoom/pan via node transforms
  useEffect(() => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
  }, [setViewport]);

  // Calculate the effective scale for the current semantic zoom state
  const effectiveScale = useMemo(() => {
    if (focusNodeId) {
      const focusBounds = getAbsoluteNodeBounds(focusNodeId, nodes);
      if (focusBounds) {
        const padding = 0.1;
        const scaleX = viewportSize.width * (1 - padding * 2) / focusBounds.width;
        const scaleY = viewportSize.height * (1 - padding * 2) / focusBounds.height;
        return Math.min(scaleX, scaleY) * zoomLevel;
      }
    }
    return zoomLevel;
  }, [focusNodeId, nodes, viewportSize, zoomLevel]);

  // Calculate the pan offset that centers on focus node
  const effectivePan = useMemo(() => {
    if (focusNodeId) {
      const focusBounds = getAbsoluteNodeBounds(focusNodeId, nodes);
      if (focusBounds) {
        const centerX = focusBounds.x + focusBounds.width / 2;
        const centerY = focusBounds.y + focusBounds.height / 2;
        return {
          x: viewportSize.width / 2 - centerX * effectiveScale + panOffset.x,
          y: viewportSize.height / 2 - centerY * effectiveScale + panOffset.y,
        };
      }
    }
    return panOffset;
  }, [focusNodeId, nodes, viewportSize, effectiveScale, panOffset]);

  // Transform nodes to screen coordinates based on semantic zoom
  const transformedNodes = useMemo(() => {
    const result = nodes.map(node => {
      const bounds = getAbsoluteNodeBounds(node.id, nodes);
      if (!bounds) return node;

      // Calculate screen position and size
      const screenX = bounds.x * effectiveScale + effectivePan.x;
      const screenY = bounds.y * effectiveScale + effectivePan.y;
      const screenWidth = bounds.width * effectiveScale;
      const screenHeight = bounds.height * effectiveScale;

      // Don't cull selected nodes or their descendants (they might be being dragged/edited)
      const isSelected = node.selected;
      const hasSelectedAncestor = (() => {
        let current = node;
        while (current.parentId) {
          const parent = nodes.find(n => n.id === current.parentId);
          if (parent?.selected) return true;
          current = parent;
          if (!current) break;
        }
        return false;
      })();

      // Check visibility
      const isTooSmall = screenWidth < SEMANTIC_ZOOM_CONFIG.MIN_VISIBLE_SIZE ||
                         screenHeight < SEMANTIC_ZOOM_CONFIG.MIN_VISIBLE_SIZE;
      const isTooLarge = screenWidth > SEMANTIC_ZOOM_CONFIG.MAX_VISIBLE_SIZE ||
                         screenHeight > SEMANTIC_ZOOM_CONFIG.MAX_VISIBLE_SIZE;
      const isOutside = screenX + screenWidth < -SEMANTIC_ZOOM_CONFIG.VIEWPORT_MARGIN ||
                        screenY + screenHeight < -SEMANTIC_ZOOM_CONFIG.VIEWPORT_MARGIN ||
                        screenX > viewportSize.width + SEMANTIC_ZOOM_CONFIG.VIEWPORT_MARGIN ||
                        screenY > viewportSize.height + SEMANTIC_ZOOM_CONFIG.VIEWPORT_MARGIN;

      if (!isSelected && !hasSelectedAncestor && (isTooSmall || isTooLarge || isOutside)) {
        return null; // Filter out
      }

      // Calculate depth for z-index (children should render on top of parents)
      const depth = calculateNodeDepth(node.id, nodes);

      return {
        ...node,
        // Remove parentId so ReactFlow doesn't try to handle hierarchy
        parentId: undefined,
        extent: undefined,
        // Set screen position and size directly
        position: { x: screenX, y: screenY },
        // Use zIndex based on depth so children render on top of parents
        // Selected nodes in ReactFlow get z-index 1000, so we add to that
        zIndex: 1000 + depth * 10,
        style: {
          ...node.style,
          width: screenWidth,
          height: screenHeight,
        },
        data: {
          ...node.data,
          semanticScale: effectiveScale,
        },
      };
    }).filter(Boolean) as typeof nodes;

    // Sort by depth so children render after (on top of) parents
    result.sort((a, b) => {
      const depthA = calculateNodeDepth(a.id, nodes);
      const depthB = calculateNodeDepth(b.id, nodes);
      return depthA - depthB;
    });

    return result;
  }, [nodes, effectiveScale, effectivePan, viewportSize]);

  // Build a set of visible node IDs for edge filtering
  const visibleNodeIds = useMemo(() => {
    return new Set(transformedNodes.map(n => n.id));
  }, [transformedNodes]);

  // Check if nodeA is an ancestor of nodeB (any level)
  const isAncestorOf = useCallback((ancestorId: string, descendantId: string): boolean => {
    let current = nodes.find(n => n.id === descendantId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = nodes.find(n => n.id === current!.parentId);
    }
    return false;
  }, [nodes]);

  // Filter edges and add effectiveScale and ancestor info
  const transformedEdges = useMemo(() => {
    return edges
      .filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
      .map(edge => {
        // Check if this is an ancestor-descendant relationship (any level)
        // sourceIsAncestor: source is an ancestor of target (source is parent/grandparent/etc of target)
        // targetIsAncestor: target is an ancestor of source (target is parent/grandparent/etc of source)
        const sourceIsAncestor = isAncestorOf(edge.source, edge.target);
        const targetIsAncestor = isAncestorOf(edge.target, edge.source);

        return {
          ...edge,
          data: {
            ...edge.data,
            effectiveScale,
            sourceIsAncestor,  // true if source is ancestor of target
            targetIsAncestor,  // true if target is ancestor of source
          },
        };
      });
  }, [edges, visibleNodeIds, effectiveScale, isAncestorOf]);

  // Custom wheel handler for semantic zoom (added manually to avoid passive listener)
  useEffect(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = -event.deltaY * 0.001;
      const rect = wrapper.getBoundingClientRect();
      adjustZoom(delta, event.clientX - rect.left, event.clientY - rect.top);
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', handleWheel);
  }, [adjustZoom]);

  // Pan handling - drag background to pan
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });

  const handlePaneMouseDown = useCallback((event: React.MouseEvent) => {
    // Left mouse button on pane starts panning
    if (event.button === 0) {
      isPanning.current = true;
      lastPanPos.current = { x: event.clientX, y: event.clientY };
    }
  }, []);

  const handlePaneMouseMove = useCallback((event: React.MouseEvent) => {
    if (isPanning.current) {
      const deltaX = event.clientX - lastPanPos.current.x;
      const deltaY = event.clientY - lastPanPos.current.y;
      lastPanPos.current = { x: event.clientX, y: event.clientY };
      adjustPan(deltaX, deltaY);
    }
  }, [adjustPan]);

  const handlePaneMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Zoom to focus on selected node (Z key), or fit all if nothing selected
  const handleSemanticZoomToSelected = useCallback(() => {
    const selectedNode = nodes.find(n => n.selected);
    const padding = 0.1;

    if (selectedNode) {
      // Zoom to selected node
      // When focusNodeId is set, effectivePan automatically centers on the node,
      // so we just need panOffset to be zero
      setFocusNode(selectedNode.id);
      startAnimation(1.0, { x: 0, y: 0 });
    } else {
      // Fit all nodes in view
      if (nodes.length === 0) return;

      // Calculate bounding box of all nodes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of nodes) {
        const bounds = getAbsoluteNodeBounds(node.id, nodes);
        if (bounds) {
          minX = Math.min(minX, bounds.x);
          minY = Math.min(minY, bounds.y);
          maxX = Math.max(maxX, bounds.x + bounds.width);
          maxY = Math.max(maxY, bounds.y + bounds.height);
        }
      }

      if (!isFinite(minX)) return;

      const totalWidth = maxX - minX;
      const totalHeight = maxY - minY;

      const scaleX = viewportSize.width * (1 - padding * 2) / totalWidth;
      const scaleY = viewportSize.height * (1 - padding * 2) / totalHeight;
      const targetZoom = Math.min(scaleX, scaleY);

      const centerX = minX + totalWidth / 2;
      const centerY = minY + totalHeight / 2;
      const targetPanX = viewportSize.width / 2 - centerX * targetZoom;
      const targetPanY = viewportSize.height / 2 - centerY * targetZoom;

      setFocusNode(null);
      startAnimation(targetZoom, { x: targetPanX, y: targetPanY });
    }
  }, [nodes, viewportSize, setFocusNode, startAnimation]);

  // Navigate up one level (Escape key)
  const handleNavigateUp = useCallback(() => {
    if (!focusNodeId) return;

    const focusNode = nodes.find(n => n.id === focusNodeId);
    if (!focusNode) {
      setFocusNode(null);
      startAnimation(1.0, { x: viewportSize.width / 2, y: viewportSize.height / 2 });
      return;
    }

    if (focusNode.parentId) {
      // Navigate to parent
      const parentBounds = getAbsoluteNodeBounds(focusNode.parentId, nodes);
      if (parentBounds) {
        const padding = 0.1;
        const scaleX = viewportSize.width * (1 - padding * 2) / parentBounds.width;
        const scaleY = viewportSize.height * (1 - padding * 2) / parentBounds.height;
        const targetZoom = Math.min(scaleX, scaleY);

        const centerX = parentBounds.x + parentBounds.width / 2;
        const centerY = parentBounds.y + parentBounds.height / 2;
        const targetPanX = viewportSize.width / 2 - centerX * targetZoom;
        const targetPanY = viewportSize.height / 2 - centerY * targetZoom;

        setFocusNode(focusNode.parentId);
        startAnimation(1.0, { x: targetPanX, y: targetPanY });
      }
    } else {
      // Navigate to root view
      setFocusNode(null);
      startAnimation(1.0, { x: viewportSize.width / 2, y: viewportSize.height / 2 });
    }
  }, [focusNodeId, nodes, viewportSize, setFocusNode, startAnimation]);

  // Group states: make all states visually inside the selected state into children (G key)
  const handleGroupStates = useCallback(() => {
    const selectedNode = nodes.find(n => n.selected);
    if (!selectedNode) {
      console.log('No node selected for grouping.');
      return;
    }

    const parentBounds = getAbsoluteNodeBounds(selectedNode.id, nodes);
    if (!parentBounds) return;

    // Find all nodes that are visually inside the selected node but not already children
    // A node is "inside" if its entire bounds are within the parent bounds
    const nodesToGroup: string[] = [];

    for (const node of nodes) {
      // Skip the selected node itself
      if (node.id === selectedNode.id) continue;
      // Skip nodes that are already children of the selected node
      if (node.parentId === selectedNode.id) continue;
      // Skip nodes that are ancestors of the selected node (to avoid circular references)
      if (isAncestorOf(node.id, selectedNode.id)) continue;

      const nodeBounds = getAbsoluteNodeBounds(node.id, nodes);
      if (!nodeBounds) continue;

      // Check if the node is fully contained within the parent bounds
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

    // Update nodes: change parentId and convert position to relative
    setNodes((nds) =>
      nds.map((node) => {
        if (nodesToGroup.includes(node.id)) {
          const nodeBounds = getAbsoluteNodeBounds(node.id, nds);
          if (!nodeBounds) return node;

          // Calculate relative position within the new parent
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

    console.log(`Grouped ${nodesToGroup.length} state(s) into ${selectedNode.data.label}.`);
  }, [nodes, setNodes, isAncestorOf]);

  // Ungroup state: move a node out of its parent (Shift+G key)
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

    // Get the node's current absolute position
    const nodeBounds = getAbsoluteNodeBounds(nodeId, nodes);
    if (!nodeBounds) return false;

    // Determine the new parent (grandparent or null for root level)
    const grandparentId = parentNode.parentId || undefined;

    // Calculate new position relative to grandparent (or absolute if root level)
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
      // Moving to root level - use absolute position
      newPosition = { x: nodeBounds.x, y: nodeBounds.y };
    }

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
  }, [nodes, setNodes]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      type: 'spline',
      data: { controlPoints: [], label: '' },
      markerEnd: { type: MarkerType.ArrowClosed },
    }, eds)),
    [setEdges]
  );

  // Calculate best handles for connecting two nodes based on their positions
  const calculateBestHandles = useCallback((sourceId: string, targetId: string) => {
    const sourceBounds = getAbsoluteNodeBounds(sourceId, nodes);
    const targetBounds = getAbsoluteNodeBounds(targetId, nodes);

    if (!sourceBounds || !targetBounds) {
      return { sourceHandle: 'right-source', targetHandle: 'left-target' };
    }

    // Check for parent-child relationship
    const sourceIsParent = isAncestorOf(sourceId, targetId);
    const targetIsParent = isAncestorOf(targetId, sourceId);

    if (sourceIsParent || targetIsParent) {
      // For parent-child connections, find which edge of the child is closest to the parent's edge
      const child = sourceIsParent ? targetBounds : sourceBounds;
      const parent = sourceIsParent ? sourceBounds : targetBounds;

      // Calculate distances from child center to each parent edge
      const childCenterX = child.x + child.width / 2;
      const childCenterY = child.y + child.height / 2;

      const distToTop = childCenterY - parent.y;
      const distToBottom = (parent.y + parent.height) - childCenterY;
      const distToLeft = childCenterX - parent.x;
      const distToRight = (parent.x + parent.width) - childCenterX;

      const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

      // Both handles should be on the same side (edge goes inward)
      if (minDist === distToTop) {
        return sourceIsParent
          ? { sourceHandle: 'top-source', targetHandle: 'top-target' }
          : { sourceHandle: 'top-source', targetHandle: 'top-target' };
      } else if (minDist === distToBottom) {
        return sourceIsParent
          ? { sourceHandle: 'bottom-source', targetHandle: 'bottom-target' }
          : { sourceHandle: 'bottom-source', targetHandle: 'bottom-target' };
      } else if (minDist === distToLeft) {
        return sourceIsParent
          ? { sourceHandle: 'left-source', targetHandle: 'left-target' }
          : { sourceHandle: 'left-source', targetHandle: 'left-target' };
      } else {
        return sourceIsParent
          ? { sourceHandle: 'right-source', targetHandle: 'right-target' }
          : { sourceHandle: 'right-source', targetHandle: 'right-target' };
      }
    }

    // Normal case: nodes are not in parent-child relationship
    const sourceCenterX = sourceBounds.x + sourceBounds.width / 2;
    const sourceCenterY = sourceBounds.y + sourceBounds.height / 2;
    const targetCenterX = targetBounds.x + targetBounds.width / 2;
    const targetCenterY = targetBounds.y + targetBounds.height / 2;

    const dx = targetCenterX - sourceCenterX;
    const dy = targetCenterY - sourceCenterY;

    // Determine primary direction
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal: target is to the right or left
      if (dx > 0) {
        return { sourceHandle: 'right-source', targetHandle: 'left-target' };
      } else {
        return { sourceHandle: 'left-source', targetHandle: 'right-target' };
      }
    } else {
      // Vertical: target is below or above
      if (dy > 0) {
        return { sourceHandle: 'bottom-source', targetHandle: 'top-target' };
      } else {
        return { sourceHandle: 'top-source', targetHandle: 'bottom-target' };
      }
    }
  }, [nodes, isAncestorOf]);

  // Create a transition between two nodes
  const createTransition = useCallback((sourceId: string, targetId: string) => {
    const { sourceHandle, targetHandle } = calculateBestHandles(sourceId, targetId);

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

    setEdges((eds) => eds.concat(newEdge));
  }, [calculateBestHandles, setEdges]);

  const isValidConnection = useCallback(
    () => true, // Allow all connections including self-loops
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
  const [isAddingTransition, setIsAddingTransition] = useState(false);
  const [transitionSourceId, setTransitionSourceId] = useState<string | null>(null);
  const [isUngroupingMode, setIsUngroupingMode] = useState(false);
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
      // Convert position and dimension changes from screen coordinates to world coordinates
      const convertedChanges = changes.map(change => {
        if (change.type === 'position' && change.position) {
          // Find the original node to get its absolute position offset
          const node = nodes.find(n => n.id === change.id);
          if (node) {
            const bounds = getAbsoluteNodeBounds(change.id, nodes);
            if (bounds) {
              // The screen position from ReactFlow
              const screenX = change.position.x;
              const screenY = change.position.y;

              // Convert back to world coordinates
              let worldX = (screenX - effectivePan.x) / effectiveScale;
              let worldY = (screenY - effectivePan.y) / effectiveScale;

              // For nested nodes, we need relative position to parent
              if (node.parentId) {
                const parentBounds = getAbsoluteNodeBounds(node.parentId, nodes);
                if (parentBounds) {
                  // Calculate relative position
                  let relX = worldX - parentBounds.x;
                  let relY = worldY - parentBounds.y;

                  // Get node dimensions (in world coordinates)
                  const nodeWidth = (node.style?.width as number) || node.width || 150;
                  const nodeHeight = (node.style?.height as number) || node.height || 50;

                  // Constrain to parent bounds (with small padding)
                  const padding = 5;
                  relX = Math.max(padding, Math.min(relX, parentBounds.width - nodeWidth - padding));
                  relY = Math.max(padding, Math.min(relY, parentBounds.height - nodeHeight - padding));

                  return {
                    ...change,
                    position: { x: relX, y: relY },
                  };
                }
              }

              // Top-level node
              return {
                ...change,
                position: { x: worldX, y: worldY },
              };
            }
          }
        }

        // Handle dimension changes (from NodeResizer)
        if (change.type === 'dimensions' && change.updateStyle && change.dimensions) {
          // Only scale actual resize operations (updateStyle: true)
          // DOM measurement updates (no updateStyle) pass through unchanged
          return {
            ...change,
            dimensions: {
              width: change.dimensions.width / effectiveScale,
              height: change.dimensions.height / effectiveScale,
            },
          };
        }

        return change;
      });

      onNodesChange(convertedChanges);
      changes.forEach(change => {
        if (change.type === 'select' && change.selected) {
          setSelectedTreeItem(change.id);
        } else if (change.type === 'select' && !change.selected && selectedTreeItem === change.id) {
          setSelectedTreeItem(null);
        }
      });
    },
    [onNodesChange, selectedTreeItem, nodes, effectiveScale, effectivePan]
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
      } else if (event.key === 't' && !isModifierPressed) {
        event.preventDefault();
        // Check if a transition (edge) is selected - if so, recompute its handles
        const selectedEdge = edges.find(e => e.selected);
        if (selectedEdge) {
          const { sourceHandle, targetHandle } = calculateBestHandles(selectedEdge.source, selectedEdge.target);
          setEdges((eds) =>
            eds.map((edge) => {
              if (edge.id === selectedEdge.id) {
                return {
                  ...edge,
                  sourceHandle,
                  targetHandle,
                };
              }
              return edge;
            })
          );
        } else {
          // Start transition creation from currently selected node
          const selectedNode = nodes.find(n => n.selected);
          if (selectedNode) {
            setIsAddingTransition(true);
            setTransitionSourceId(selectedNode.id);
          }
        }
      } else if (event.key === 'Escape' && isAddingTransition) {
        event.preventDefault();
        setIsAddingTransition(false);
        setTransitionSourceId(null);
      } else if (event.key === 'z' && !isModifierPressed) {
        event.preventDefault();
        handleSemanticZoomToSelected();
      } else if (event.key === 'g' && !isModifierPressed && !event.shiftKey) {
        event.preventDefault();
        handleGroupStates();
      } else if (event.key === 'G' && event.shiftKey && !isModifierPressed) {
        event.preventDefault();
        // Shift+G: ungroup selected node and enter ungroup mode
        const selectedNode = nodes.find(n => n.selected);
        if (selectedNode && selectedNode.parentId) {
          handleUngroupState(selectedNode.id);
        }
        // Always enter ungroup mode so user can click on nodes to ungroup them
        setIsUngroupingMode(true);
        console.log('Entered ungroup mode');
      } else if (event.key === 'Escape' && isUngroupingMode) {
        event.preventDefault();
        setIsUngroupingMode(false);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handleNavigateUp();
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
  }, [handleCopy, handlePaste, handleDuplicate, handleSave, handleExport, handleOpen, handleSemanticZoomToSelected, handleNavigateUp, handleGroupStates, handleUngroupState, setIsAddingNode, nodes, edges, isAddingTransition, isUngroupingMode, calculateBestHandles, setEdges]);

  const onPaneClick = useCallback(
    (event) => {
      if (isAddingNode) {
        // Convert screen click position to world coordinates
        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldX = (screenX - effectivePan.x) / effectiveScale;
        const worldY = (screenY - effectivePan.y) / effectiveScale;

        const newNode = {
          id: getNextId(),
          type: 'stateNode',
          position: { x: worldX, y: worldY },
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
    [isAddingNode, setNodes, setEdges, generateUniqueNodeLabel, nodes, effectiveScale, effectivePan]
  );

  const onNodeClick = useCallback(
    (event, node) => {
      // Handle transition creation mode
      if (isAddingTransition && transitionSourceId) {
        // Create transition from source to this node
        createTransition(transitionSourceId, node.id);
        setIsAddingTransition(false);
        setTransitionSourceId(null);
        event.stopPropagation();
        return;
      }

      // Handle ungroup mode - move clicked node out of its parent
      if (isUngroupingMode) {
        // Find the original node (not the transformed one)
        const originalNode = nodes.find(n => n.id === node.id);
        if (originalNode && originalNode.parentId) {
          handleUngroupState(node.id);
        }
        event.stopPropagation();
        return;
      }

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

      if (isAddingNode && node.selected) {
        // Get the wrapper's bounding rect for screen-to-world conversion
        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        // Convert screen click position to world coordinates
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldClickX = (screenX - effectivePan.x) / effectiveScale;
        const worldClickY = (screenY - effectivePan.y) / effectiveScale;

        // Find the original (non-transformed) parent node
        const originalParent = nodes.find(n => n.id === node.id);
        if (!originalParent) return;

        // Get parent's absolute world position
        const parentBounds = getAbsoluteNodeBounds(node.id, nodes);
        if (!parentBounds) return;

        // Calculate the parent's depth and scale factor for the new child
        const parentDepth = calculateNodeDepth(node.id, nodes);
        const childDepth = parentDepth + 1;
        const scale = Math.pow(NESTING_SCALE_FACTOR, childDepth);

        // Scale the default node size (in world coordinates)
        const baseNodeWidth = 150;
        const baseNodeHeight = 50;
        const scaledNodeWidth = baseNodeWidth * scale;
        const scaledNodeHeight = baseNodeHeight * scale;

        // Calculate relative position within parent (in world coordinates)
        const newRelativePosition = {
          x: worldClickX - parentBounds.x,
          y: worldClickY - parentBounds.y,
        };

        const safePadding = 10 * scale;

        // Clamp to parent bounds (using world coordinate dimensions)
        newRelativePosition.x = Math.max(safePadding, newRelativePosition.x);
        newRelativePosition.x = Math.min(parentBounds.width - scaledNodeWidth - safePadding, newRelativePosition.x);

        newRelativePosition.y = Math.max(safePadding, newRelativePosition.y);
        newRelativePosition.y = Math.min(parentBounds.height - scaledNodeHeight - safePadding, newRelativePosition.y);

        const newNode = {
          id: getNextId(),
          type: 'stateNode',
          position: newRelativePosition,
          parentId: node.id,
          extent: 'parent',
          data: { label: generateUniqueNodeLabel('New Nested State', node.id, nodes), history: false, entry: '', exit: '', do: '' },
          style: { width: scaledNodeWidth, height: scaledNodeHeight },
        };
        setNodes((nds) => nds.concat(newNode));
        setIsAddingNode(false);
        event.stopPropagation();
      }
    },
    [isAddingNode, isAddingTransition, transitionSourceId, createTransition, isUngroupingMode, handleUngroupState, setNodes, setEdges, setSelectedTreeItem, nodes, generateUniqueNodeLabel, effectiveScale, effectivePan]
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
          ref={reactFlowWrapper}
          className={isAddingNode || isAddingTransition ? 'crosshair' : isUngroupingMode ? 'ungroup-cursor' : ''}
          sx={{
            flexGrow: 1,
            position: 'relative',
            cursor: isUngroupingMode ? 'n-resize' : (isAddingNode || isAddingTransition ? 'crosshair' : 'default'),
            '& *': {
              cursor: isUngroupingMode ? 'n-resize !important' : (isAddingNode || isAddingTransition ? 'crosshair !important' : undefined),
            },
          }}
          onMouseDown={handlePaneMouseDown}
          onMouseMove={handlePaneMouseMove}
          onMouseUp={handlePaneMouseUp}
          onMouseLeave={handlePaneMouseUp}
        >
          <ReactFlow
            nodes={transformedNodes}
            edges={transformedEdges}
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
            minZoom={1}
            maxZoom={1}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            panOnDrag={false}
            panOnScroll={false}
            autoPanOnNodeDrag={false}
            autoPanOnConnect={false}
            elevateNodesOnSelect={false}
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
