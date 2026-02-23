import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  ConnectionMode,
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
  Settings as SettingsIcon,
  Tune as TuneIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
} from '@mui/icons-material';

import './index.css';
import { useUndoRedo } from './useUndoRedo';
import StateNode from './StateNode';
import DecisionNode from './DecisionNode';
import ProxyNode from './ProxyNode';
import InitialMarker from './InitialMarker';
import HistoryMarker from './HistoryMarker';
import StateTree from './StateTree';
import PropertiesPanel from './PropertiesPanel';
import SplineEdge from './SplineEdge';
import { EdgesProvider, LabelsVisibleProvider } from './EdgesContext';
import MachinePropertiesDialog from './MachinePropertiesDialog';
import SettingsDialog, { Settings } from './SettingsDialog';
import { MachineProperties, defaultMachineProperties, computeProxyLabel } from './yamlConverter';
import {
  useSemanticZoomStore,
  getAbsoluteNodeBounds,
  SEMANTIC_ZOOM_CONFIG,
} from './semanticZoom';
import { calculateNodeDepth, isAncestorOf, buildTreeData, getAllDescendants, computeNodePath } from './utils/nodeUtils';
import { calculateBestHandles } from './utils/handleUtils';
import { getNextId, getNextStateName, getNextDecisionName, getNextProxyName } from './utils/idCounters';
import { useClipboard } from './hooks/useClipboard';
import { useFileOperations } from './hooks/useFileOperations';
import { useGrouping } from './hooks/useGrouping';
import { useEdgeOperations } from './hooks/useEdgeOperations';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { copyImageToClipboard } from './utils/exportImage';

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

// Type declaration for the APIs exposed from preload
declare global {
  interface Window {
    fileAPI: {
      saveFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
      saveFileDirect: (content: string, filePath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; canceled?: boolean; error?: string }>;
      importPhoenix: () => Promise<{ success: boolean; content?: string; filePath?: string; canceled?: boolean; error?: string }>;
      onImportPhoenix: (callback: () => void) => () => void;
    };
    settingsAPI: {
      get: () => Promise<Settings>;
      save: (settings: Settings) => Promise<{ success: boolean }>;
    };
    editorAPI: {
      editExternal: (content: string, language: string) => Promise<{
        success: boolean;
        content?: string;
        canceled?: boolean;
        error?: string;
        useBuiltin?: boolean;
        fallbackToBuiltin?: boolean;
      }>;
    };
  }
}

const nodeTypes = { stateNode: StateNode, decisionNode: DecisionNode, proxyNode: ProxyNode, initialMarker: InitialMarker, historyMarker: HistoryMarker };
const edgeTypes = { spline: SplineEdge };

const initialNodes = [
  {
    id: '1',
    type: 'stateNode',
    position: { x: 0, y: 0 },
    data: { label: 'S1', history: false, orthogonal: false, entry: '', exit: '', do: '' },
    style: { width: 150, height: 75 },
  },
  {
    id: '2',
    type: 'stateNode',
    position: { x: 0, y: 100 },
    data: { label: 'S2', history: false, orthogonal: false, entry: '', exit: '', do: '' },
    style: { width: 150, height: 75 },
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

// Scale factor for nested states (will be configurable later)
const NESTING_SCALE_FACTOR = 0.85;

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

  // Machine properties (needs to be before transformedNodes useMemo)
  const [machineProperties, setMachineProperties] = useState<MachineProperties>(defaultMachineProperties);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [rootHistory, setRootHistory] = useState(false);

  // Undo/Redo
  const { pushSnapshot, undo, redo, canUndo, canRedo, clear: clearUndoRedo } = useUndoRedo();
  const saveSnapshot = useCallback(() => {
    pushSnapshot({ nodes, edges, machineProperties, rootHistory });
  }, [nodes, edges, machineProperties, rootHistory, pushSnapshot]);
  const dragStartSnapshot = useRef<{ nodes: typeof nodes; edges: typeof edges; machineProperties: typeof machineProperties; rootHistory: boolean } | null>(null);

  const handleUndo = useCallback(() => {
    const snapshot = undo({ nodes, edges, machineProperties, rootHistory });
    if (snapshot) {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setMachineProperties(snapshot.machineProperties);
      setRootHistory(snapshot.rootHistory);
    }
  }, [nodes, edges, machineProperties, rootHistory, undo, setNodes, setEdges, setMachineProperties, setRootHistory]);

  const handleRedo = useCallback(() => {
    const snapshot = redo({ nodes, edges, machineProperties, rootHistory });
    if (snapshot) {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setMachineProperties(snapshot.machineProperties);
      setRootHistory(snapshot.rootHistory);
    }
  }, [nodes, edges, machineProperties, rootHistory, redo, setNodes, setEdges, setMachineProperties, setRootHistory]);

  // Track dragging marker position (for smooth visual feedback)
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [draggingMarkerPos, setDraggingMarkerPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

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

  // Load settings on mount
  useEffect(() => {
    window.settingsAPI.get().then((loadedSettings) => {
      setSettings(loadedSettings);
    }).catch((error) => {
      console.error('Error loading settings:', error);
    });
  }, []);

  // Update window title based on current file
  useEffect(() => {
    if (currentFilePath) {
      const fileName = currentFilePath.split('/').pop()?.replace(/\.(smb|yaml|yml)$/i, '') || currentFilePath;
      document.title = `${fileName} - SM Editor`;
    } else {
      document.title = 'SM Editor';
    }
  }, [currentFilePath]);

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

  // Zoom and pan are directly driven by the store values.
  // When 'z' is pressed, the target zoom/pan are computed once and animated to.
  const effectiveScale = zoomLevel;
  const effectivePan = panOffset;

  // Transform nodes to screen coordinates based on semantic zoom
  const transformedNodes = useMemo(() => {
    // First pass: compute transforms and visibility for all nodes
    const nodeTransforms = new Map<string, {
      screenX: number;
      screenY: number;
      screenWidth: number;
      screenHeight: number;
      isTooSmall: boolean;
      isTooLarge: boolean;
      isOutside: boolean;
      isSelected: boolean;
      hasSelectedAncestor: boolean;
    }>();

    for (const node of nodes) {
      const bounds = getAbsoluteNodeBounds(node.id, nodes);
      if (!bounds) continue;

      const screenX = bounds.x * effectiveScale + effectivePan.x;
      const screenY = bounds.y * effectiveScale + effectivePan.y;
      const screenWidth = bounds.width * effectiveScale;
      const screenHeight = bounds.height * effectiveScale;

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

      const isTooSmall = screenWidth < SEMANTIC_ZOOM_CONFIG.MIN_VISIBLE_SIZE ||
                         screenHeight < SEMANTIC_ZOOM_CONFIG.MIN_VISIBLE_SIZE;
      const isTooLarge = screenWidth > SEMANTIC_ZOOM_CONFIG.MAX_VISIBLE_SIZE ||
                         screenHeight > SEMANTIC_ZOOM_CONFIG.MAX_VISIBLE_SIZE;
      const isOutside = screenX + screenWidth < -SEMANTIC_ZOOM_CONFIG.VIEWPORT_MARGIN ||
                        screenY + screenHeight < -SEMANTIC_ZOOM_CONFIG.VIEWPORT_MARGIN ||
                        screenX > viewportSize.width + SEMANTIC_ZOOM_CONFIG.VIEWPORT_MARGIN ||
                        screenY > viewportSize.height + SEMANTIC_ZOOM_CONFIG.VIEWPORT_MARGIN;

      nodeTransforms.set(node.id, {
        screenX, screenY, screenWidth, screenHeight,
        isTooSmall, isTooLarge, isOutside,
        isSelected, hasSelectedAncestor,
      });
    }

    // Identify nodes that are "intrinsically visible" (in viewport, right size)
    const intrinsicallyVisible = new Set<string>();
    for (const [nodeId, t] of nodeTransforms) {
      if (t.isSelected || t.hasSelectedAncestor || (!t.isTooSmall && !t.isTooLarge && !t.isOutside)) {
        intrinsicallyVisible.add(nodeId);
      }
    }

    // Find nodes outside viewport that have edges to intrinsically visible nodes
    const connectedToVisible = new Set<string>();
    for (const edge of edges) {
      const sourceVisible = intrinsicallyVisible.has(edge.source);
      const targetVisible = intrinsicallyVisible.has(edge.target);
      // If one end is visible and the other is outside (but not too small/large), include it
      if (sourceVisible && !targetVisible) {
        const t = nodeTransforms.get(edge.target);
        if (t && !t.isTooSmall && !t.isTooLarge) {
          connectedToVisible.add(edge.target);
        }
      }
      if (targetVisible && !sourceVisible) {
        const t = nodeTransforms.get(edge.source);
        if (t && !t.isTooSmall && !t.isTooLarge) {
          connectedToVisible.add(edge.source);
        }
      }
    }

    // Compute minimum screen-space dimensions for each parent node based on children
    const minScreenDims = new Map<string, { minWidth: number; minHeight: number }>();
    const childPadding = 5 * effectiveScale; // padding in screen pixels
    for (const node of nodes) {
      if (!node.parentId) continue;
      const parentT = nodeTransforms.get(node.parentId);
      const childT = nodeTransforms.get(node.id);
      if (!parentT || !childT) continue;

      // Child's right/bottom edge relative to parent's top-left
      const childRight = (childT.screenX - parentT.screenX) + childT.screenWidth + childPadding;
      const childBottom = (childT.screenY - parentT.screenY) + childT.screenHeight + childPadding;

      const existing = minScreenDims.get(node.parentId);
      if (existing) {
        existing.minWidth = Math.max(existing.minWidth, childRight);
        existing.minHeight = Math.max(existing.minHeight, childBottom);
      } else {
        minScreenDims.set(node.parentId, { minWidth: childRight, minHeight: childBottom });
      }
    }

    // Compute set of state IDs that have at least one proxy node pointing to them
    const proxyTargetIds = new Set<string>(
      nodes
        .filter(n => n.type === 'proxyNode')
        .map(n => (n.data as unknown as { targetId: string }).targetId)
    );

    // Compute set of currently selected state/decision node IDs
    const selectedNodeIds = new Set<string>(
      nodes.filter(n => n.selected).map(n => n.id)
    );

    // Build result with all visible nodes
    const result = nodes.map(node => {
      const t = nodeTransforms.get(node.id);
      if (!t) return null;

      const shouldInclude = intrinsicallyVisible.has(node.id) || connectedToVisible.has(node.id);
      if (!shouldInclude) return null;

      const depth = calculateNodeDepth(node.id, nodes);
      const mins = minScreenDims.get(node.id);

      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        position: { x: t.screenX, y: t.screenY },
        zIndex: 1000 + depth * 10,
        style: {
          ...node.style,
          width: t.screenWidth,
          height: t.screenHeight,
        },
        data: {
          ...node.data,
          semanticScale: effectiveScale,
          screenWidth: t.screenWidth,
          screenHeight: t.screenHeight,
          minWidth: mins?.minWidth,
          minHeight: mins?.minHeight,
          hasProxy: node.type === 'stateNode' && proxyTargetIds.has(node.id),
          targetSelected: node.type === 'proxyNode' && selectedNodeIds.has((node.data as unknown as { targetId: string }).targetId),
        },
      };
    }).filter(Boolean) as typeof nodes;

    // Sort by depth so children render after (on top of) parents
    result.sort((a, b) => {
      const depthA = calculateNodeDepth(a.id, nodes);
      const depthB = calculateNodeDepth(b.id, nodes);
      return depthA - depthB;
    });

    // Add initial marker nodes for parents that have initial set
    const initialMarkers: typeof nodes = [];
    for (const node of nodes) {
      if (node.data.initial && node.data.initialMarkerPos) {
        const parentBounds = getAbsoluteNodeBounds(node.id, nodes);
        if (!parentBounds) continue;

        // Check if target state is visible (marker stays as long as target is visible)
        const targetId = node.data.initial as string;
        const targetVisible = intrinsicallyVisible.has(targetId) || connectedToVisible.has(targetId);
        if (!targetVisible) continue;

        // Calculate marker position in screen coordinates
        const markerWorldX = parentBounds.x + (node.data.initialMarkerPos as { x: number; y: number }).x;
        const markerWorldY = parentBounds.y + (node.data.initialMarkerPos as { x: number; y: number }).y;
        const markerScreenX = markerWorldX * effectiveScale + effectivePan.x;
        const markerScreenY = markerWorldY * effectiveScale + effectivePan.y;

        // Scale the marker size
        const baseSize = (node.data.initialMarkerSize as number) || parentBounds.width * 0.03;
        const screenSize = baseSize * effectiveScale;

        // Fixed size marker (15px)
        const markerSize = 15;
        const depth = calculateNodeDepth(node.id, nodes);
        const markerId = `initial-marker-${node.id}`;
        // Use dragging position if this marker is being dragged
        const markerPosition = (draggingMarkerId === markerId && draggingMarkerPos)
          ? draggingMarkerPos
          : { x: markerScreenX - markerSize / 2, y: markerScreenY - markerSize / 2 };
        initialMarkers.push({
          id: markerId,
          type: 'initialMarker',
          position: markerPosition,
          zIndex: 2000 + depth * 10, // Above state nodes
          style: { width: markerSize, height: markerSize },
          data: {
            size: markerSize,
            parentId: node.id,
            targetId: node.data.initial,
          },
          selectable: true,
          draggable: true,
          hidden: false,
          width: markerSize,
          height: markerSize,
        } as typeof nodes[0]);
      }
    }

    // Add root initial marker (for top-level states)
    if (machineProperties.initial && machineProperties.initialMarkerPos) {
      const targetId = machineProperties.initial;
      const targetVisible = intrinsicallyVisible.has(targetId) || connectedToVisible.has(targetId);
      const targetNode = nodes.find(n => n.id === targetId);
      if (targetNode && !targetNode.parentId && targetVisible) {
        // Calculate marker position in screen coordinates
        const markerWorldX = machineProperties.initialMarkerPos.x;
        const markerWorldY = machineProperties.initialMarkerPos.y;
        const markerScreenX = markerWorldX * effectiveScale + effectivePan.x;
        const markerScreenY = markerWorldY * effectiveScale + effectivePan.y;

        // Fixed size marker (15px)
        const markerSize = 15;
        const markerId = 'initial-marker-root';
        // Use dragging position if this marker is being dragged
        const markerPosition = (draggingMarkerId === markerId && draggingMarkerPos)
          ? draggingMarkerPos
          : { x: markerScreenX - markerSize / 2, y: markerScreenY - markerSize / 2 };
        initialMarkers.push({
          id: markerId,
          type: 'initialMarker',
          position: markerPosition,
          zIndex: 2000, // Above state nodes
          style: { width: markerSize, height: markerSize },
          data: {
            size: markerSize,
            parentId: null,
            targetId: machineProperties.initial,
          },
          selectable: true,
          draggable: true,
          hidden: false,
          width: markerSize,
          height: markerSize,
        } as typeof nodes[0]);
      }
    }

    // Add history marker nodes for states that have history=true
    const historyMarkers: typeof nodes = [];
    for (const node of nodes) {
      if (node.data.history && node.data.historyMarkerPos) {
        const stateBounds = getAbsoluteNodeBounds(node.id, nodes);
        if (!stateBounds) continue;

        // Check if this state is visible
        const stateVisible = intrinsicallyVisible.has(node.id) || connectedToVisible.has(node.id);
        if (!stateVisible) continue;

        const markerWorldX = stateBounds.x + (node.data.historyMarkerPos as { x: number; y: number }).x;
        const markerWorldY = stateBounds.y + (node.data.historyMarkerPos as { x: number; y: number }).y;
        const markerScreenX = markerWorldX * effectiveScale + effectivePan.x;
        const markerScreenY = markerWorldY * effectiveScale + effectivePan.y;

        const baseSize = (node.data.historyMarkerSize as number) || Math.min(stateBounds.width, stateBounds.height) * 0.15;
        const screenSize = baseSize * effectiveScale;

        // Hide if too small (same rule as states)
        if (screenSize < SEMANTIC_ZOOM_CONFIG.MIN_VISIBLE_SIZE) continue;

        const depth = calculateNodeDepth(node.id, nodes);
        const markerId = `history-marker-${node.id}`;
        const markerPosition = (draggingMarkerId === markerId && draggingMarkerPos)
          ? draggingMarkerPos
          : { x: markerScreenX - screenSize / 2, y: markerScreenY - screenSize / 2 };
        historyMarkers.push({
          id: markerId,
          type: 'historyMarker',
          position: markerPosition,
          zIndex: 2000 + depth * 10,
          style: { width: screenSize, height: screenSize },
          data: {
            size: screenSize,
          },
          selected: selectedMarkerId === markerId,
          selectable: true,
          draggable: true,
          hidden: false,
          width: screenSize,
          height: screenSize,
        } as typeof nodes[0]);
      }
    }

    // Add root history marker (check machineProperties only - rootHistory state is declared later)
    if (machineProperties.historyMarkerPos) {
      const baseSize = (machineProperties.historyMarkerSize as number) || 20;
      const screenSize = baseSize * effectiveScale;

      if (screenSize >= SEMANTIC_ZOOM_CONFIG.MIN_VISIBLE_SIZE) {
      const markerWorldX = machineProperties.historyMarkerPos.x;
      const markerWorldY = machineProperties.historyMarkerPos.y;
      const markerScreenX = markerWorldX * effectiveScale + effectivePan.x;
      const markerScreenY = markerWorldY * effectiveScale + effectivePan.y;

      const markerId = 'history-marker-root';
      const markerPosition = (draggingMarkerId === markerId && draggingMarkerPos)
        ? draggingMarkerPos
        : { x: markerScreenX - screenSize / 2, y: markerScreenY - screenSize / 2 };
      historyMarkers.push({
        id: markerId,
        type: 'historyMarker',
        position: markerPosition,
        zIndex: 2000,
        style: { width: screenSize, height: screenSize },
        data: {
          size: screenSize,
        },
        selected: selectedMarkerId === markerId,
        selectable: true,
        draggable: true,
        hidden: false,
        width: screenSize,
        height: screenSize,
      } as typeof nodes[0]);
      }
    }

    return [...result, ...initialMarkers, ...historyMarkers];
  }, [nodes, edges, effectiveScale, effectivePan, viewportSize, machineProperties, draggingMarkerId, draggingMarkerPos, selectedMarkerId]);

  // Build a set of visible node IDs for edge filtering
  const visibleNodeIds = useMemo(() => {
    return new Set(transformedNodes.map(n => n.id));
  }, [transformedNodes]);

  // Filter edges: show if at least one endpoint is visible
  const transformedEdges = useMemo(() => {
    const anyEdgeSelected = edges.some(e => e.selected);
    const regularEdges = edges
      .filter(edge => {
        return visibleNodeIds.has(edge.source) || visibleNodeIds.has(edge.target);
      })
      .map(edge => {
        // Check if this is an ancestor-descendant relationship (any level)
        // sourceIsAncestor: source is an ancestor of target (source is parent/grandparent/etc of target)
        // targetIsAncestor: target is an ancestor of source (target is parent/grandparent/etc of source)
        const sourceIsAncestor = isAncestorOf(edge.source, edge.target, nodes);
        const targetIsAncestor = isAncestorOf(edge.target, edge.source, nodes);

        return {
          ...edge,
          // Only allow reconnecting selected edges (avoids ambiguity when multiple edges share a handle)
          reconnectable: edge.selected ? true : undefined,
          data: {
            ...edge.data,
            effectiveScale,
            sourceIsAncestor,  // true if source is ancestor of target
            targetIsAncestor,  // true if target is ancestor of source
            anyEdgeSelected,
          },
        };
      });

    // Compute warning flags: transitions after a guardless one from the same source are unreachable
    const warningEdgeIds = new Set<string>();
    const edgesBySource = new Map<string, typeof regularEdges>();
    for (const edge of regularEdges) {
      const list = edgesBySource.get(edge.source) || [];
      list.push(edge);
      edgesBySource.set(edge.source, list);
    }
    for (const siblings of edgesBySource.values()) {
      let seenGuardless = false;
      for (const edge of siblings) {
        if (seenGuardless) {
          warningEdgeIds.add(edge.id);
        } else if (!edge.data?.guard) {
          seenGuardless = true;
        }
      }
    }
    // Apply warning flags
    for (let i = 0; i < regularEdges.length; i++) {
      if (warningEdgeIds.has(regularEdges[i].id)) {
        regularEdges[i] = {
          ...regularEdges[i],
          data: { ...regularEdges[i].data, warning: true },
        };
      }
    }

    // Add initial transition edges (from marker to initial child)
    const initialEdges: typeof edges = [];
    for (const node of nodes) {
      if (node.data.initial && node.data.initialMarkerPos) {
        const markerId = `initial-marker-${node.id}`;
        const targetId = node.data.initial as string;

        // Check if both marker and target are visible
        const markerVisible = transformedNodes.some(n => n.id === markerId);
        const targetVisible = visibleNodeIds.has(targetId);

        if (markerVisible && targetVisible) {
          // Determine best handle based on relative positions
          const parentBounds = getAbsoluteNodeBounds(node.id, nodes);
          const targetBounds = getAbsoluteNodeBounds(targetId, nodes);
          if (parentBounds && targetBounds) {
            const markerPos = node.data.initialMarkerPos as { x: number; y: number };
            const markerX = parentBounds.x + markerPos.x;
            const markerY = parentBounds.y + markerPos.y;
            const targetCenterX = targetBounds.x + targetBounds.width / 2;
            const targetCenterY = targetBounds.y + targetBounds.height / 2;

            const dx = targetCenterX - markerX;
            const dy = targetCenterY - markerY;

            let sourceHandle: string;
            let targetHandle: string;

            if (Math.abs(dx) > Math.abs(dy)) {
              if (dx > 0) {
                sourceHandle = 'right-source';
                targetHandle = 'left-target';
              } else {
                sourceHandle = 'left-source';
                targetHandle = 'right-target';
              }
            } else {
              if (dy > 0) {
                sourceHandle = 'bottom-source';
                targetHandle = 'top-target';
              } else {
                sourceHandle = 'top-source';
                targetHandle = 'bottom-target';
              }
            }

            initialEdges.push({
              id: `initial-edge-${node.id}`,
              source: markerId,
              target: targetId,
              sourceHandle,
              targetHandle,
              type: 'spline',
              data: {
                controlPoints: [],
                effectiveScale,
                isInitialTransition: true,
              },
              markerEnd: { type: MarkerType.ArrowClosed },
              selectable: false,
            } as typeof edges[0]);
          }
        }
      }
    }

    // Add root initial edge
    if (machineProperties.initial && machineProperties.initialMarkerPos) {
      const markerId = 'initial-marker-root';
      const targetId = machineProperties.initial;

      const markerVisible = transformedNodes.some(n => n.id === markerId);
      const targetVisible = visibleNodeIds.has(targetId);

      if (markerVisible && targetVisible) {
        const targetBounds = getAbsoluteNodeBounds(targetId, nodes);
        if (targetBounds) {
          const markerX = machineProperties.initialMarkerPos.x;
          const markerY = machineProperties.initialMarkerPos.y;
          const targetCenterX = targetBounds.x + targetBounds.width / 2;
          const targetCenterY = targetBounds.y + targetBounds.height / 2;

          const dx = targetCenterX - markerX;
          const dy = targetCenterY - markerY;

          let sourceHandle: string;
          let targetHandle: string;

          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) {
              sourceHandle = 'right-source';
              targetHandle = 'left-target';
            } else {
              sourceHandle = 'left-source';
              targetHandle = 'right-target';
            }
          } else {
            if (dy > 0) {
              sourceHandle = 'bottom-source';
              targetHandle = 'top-target';
            } else {
              sourceHandle = 'top-source';
              targetHandle = 'bottom-target';
            }
          }

          initialEdges.push({
            id: 'initial-edge-root',
            source: markerId,
            target: targetId,
            sourceHandle,
            targetHandle,
            type: 'spline',
            data: {
              controlPoints: [],
              effectiveScale,
              isInitialTransition: true,
            },
            markerEnd: { type: MarkerType.ArrowClosed },
            selectable: false,
          } as typeof edges[0]);
        }
      }
    }

    const result = [...regularEdges, ...initialEdges];
    return result;
  }, [edges, visibleNodeIds, effectiveScale, nodes, transformedNodes, machineProperties]);

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
    // Don't start panning if clicking on a node, edge, handle, or edge reconnection anchor
    const target = event.target as HTMLElement;
    if (target.closest('.react-flow__node') || target.closest('.react-flow__edge') || target.closest('.react-flow__handle') || target.closest('.react-flow__edgeupdater')) {
      return;
    }
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
      // Zoom to selected node - compute absolute target zoom and pan
      const bounds = getAbsoluteNodeBounds(selectedNode.id, nodes);
      if (!bounds) return;

      const scaleX = viewportSize.width * (1 - padding * 2) / bounds.width;
      const scaleY = viewportSize.height * (1 - padding * 2) / bounds.height;
      const targetZoom = Math.min(scaleX, scaleY);

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const targetPanX = viewportSize.width / 2 - centerX * targetZoom;
      const targetPanY = viewportSize.height / 2 - centerY * targetZoom;

      setFocusNode(selectedNode.id);
      startAnimation(targetZoom, { x: targetPanX, y: targetPanY });
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
      // Fit all nodes
      handleSemanticZoomToSelected();
      return;
    }

    const padding = 0.1;

    if (focusNode.parentId) {
      // Navigate to parent - compute absolute zoom and pan
      const parentBounds = getAbsoluteNodeBounds(focusNode.parentId, nodes);
      if (parentBounds) {
        const scaleX = viewportSize.width * (1 - padding * 2) / parentBounds.width;
        const scaleY = viewportSize.height * (1 - padding * 2) / parentBounds.height;
        const targetZoom = Math.min(scaleX, scaleY);

        const centerX = parentBounds.x + parentBounds.width / 2;
        const centerY = parentBounds.y + parentBounds.height / 2;
        const targetPanX = viewportSize.width / 2 - centerX * targetZoom;
        const targetPanY = viewportSize.height / 2 - centerY * targetZoom;

        setFocusNode(focusNode.parentId);
        startAnimation(targetZoom, { x: targetPanX, y: targetPanY });
      }
    } else {
      // Navigate to root view - fit all nodes
      setFocusNode(null);
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
      startAnimation(targetZoom, { x: targetPanX, y: targetPanY });
    }
  }, [focusNodeId, nodes, viewportSize, setFocusNode, startAnimation]);

  // Grouping operations
  const { handleGroupStates, handleUngroupState } = useGrouping(nodes, setNodes, saveSnapshot);

  const [showLabels, setShowLabels] = useState(true);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [isAddingDecision, setIsAddingDecision] = useState(false);
  const [isAddingProxy, setIsAddingProxy] = useState(false);
  const [proxyTargetId, setProxyTargetId] = useState<string | null>(null);
  const [proxySourceEdgeId, setProxySourceEdgeId] = useState<string | null>(null);
  const [isAddingTransition, setIsAddingTransition] = useState(false);
  const [transitionSourceId, setTransitionSourceId] = useState<string | null>(null);
  const [isRetargetingTransition, setIsRetargetingTransition] = useState(false);
  const [isResourcingTransition, setIsResourcingTransition] = useState(false);
  const [retargetEdgeId, setRetargetEdgeId] = useState<string | null>(null);
  const [focusGuard, setFocusGuard] = useState(false);
  const [focusName, setFocusName] = useState(false);

  // Edge operations
  const { onConnect: onConnectBase, onReconnect, isValidConnection, createTransition, handleEdgePropertyChange, handleReorderEdge } = useEdgeOperations(nodes, setEdges, saveSnapshot);

  const justConnectedRef = useRef(false);

  const onConnect = useCallback((params) => {
    onConnectBase(params);
    // Deselect nodes and focus the Guard field, same as the t-key transition path
    justConnectedRef.current = true;
    setSelectedTreeItem(null);
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    setFocusGuard(true);
  }, [onConnectBase, setNodes]);
  const [isUngroupingMode, setIsUngroupingMode] = useState(false);
  const [isSettingInitial, setIsSettingInitial] = useState(false);
  const [initialTargetId, setInitialTargetId] = useState<string | null>(null);
  const [isSettingHistory, setIsSettingHistory] = useState(false);
  const [selectedTreeItem, setSelectedTreeItem] = useState(null);
  const [machinePropertiesDialogOpen, setMachinePropertiesDialogOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    editorPreference: 'builtin',
    customEditorCommand: 'code -w {file}',
    tabWidth: 4,
    defaultShowEntry: false,
    defaultShowExit: false,
    defaultShowDo: false,
    defaultShowAnnotation: false,
  });
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  // Clipboard operations
  const { handleCopy, handlePaste, handleDuplicate: handleDuplicateBase, handleDuplicateWithExternalEdges: handleDuplicateWithExternalEdgesBase } = useClipboard(nodes, edges, setNodes, setEdges, setSelectedTreeItem, saveSnapshot);

  const handleDuplicate = useCallback(() => {
    handleDuplicateBase();
    setFocusName(true);
  }, [handleDuplicateBase]);

  const handleDuplicateWithExternalEdges = useCallback(() => {
    handleDuplicateWithExternalEdgesBase();
    setFocusName(true);
  }, [handleDuplicateWithExternalEdgesBase]);

  const selectedNode = useMemo(() => {
    if (selectedTreeItem === '/') {
      // Root node uses machineProperties for entry/exit/do
      return {
        id: '/',
        data: {
          label: '/',
          history: rootHistory,
          entry: machineProperties.entry,
          exit: machineProperties.exit,
          do: machineProperties.do,
        },
      };
    }
    return nodes.find(n => n.id === selectedTreeItem);
  }, [nodes, selectedTreeItem, rootHistory, machineProperties]);




  // File operations
  const { handleSave, handleOpen, handleNew } = useFileOperations(
    nodes, edges, rootHistory, machineProperties, currentFilePath,
    setNodes, setEdges, setRootHistory, setMachineProperties, setSelectedTreeItem, setCurrentFilePath, clearUndoRedo,
  );

  const treeData = useMemo(() => buildTreeData(nodes), [nodes]);

  const onNodesChangeWithSelection = useCallback(
    (changes) => {
      // Snapshot before node removal
      const hasRemove = changes.some(c => c.type === 'remove' && !c.id?.startsWith('initial-marker') && !c.id?.startsWith('history-marker'));
      if (hasRemove) {
        saveSnapshot();
        // Cascade delete: also remove all descendants of removed nodes
        const removeIds = new Set(changes.filter(c => c.type === 'remove').map(c => c.id));
        for (const id of removeIds) {
          if (id?.startsWith('initial-marker') || id?.startsWith('history-marker')) continue;
          const descendants = getAllDescendants(id, nodes);
          for (const desc of descendants) {
            if (!removeIds.has(desc.id)) {
              removeIds.add(desc.id);
              changes.push({ type: 'remove', id: desc.id });
            }
          }
        }
        // Also remove proxy nodes whose targetId is being deleted
        nodes.forEach(n => {
          if (n.type === 'proxyNode') {
            const proxyData = n.data as unknown as { targetId: string };
            if (removeIds.has(proxyData.targetId) && !removeIds.has(n.id)) {
              removeIds.add(n.id);
              changes.push({ type: 'remove', id: n.id });
            }
          }
        });
      }
      // Detect resize-from-left/top: nodes that have both position and dimensions changes
      const hasPositionChange = new Set<string>();
      const hasDimensionsChange = new Set<string>();
      for (const change of changes) {
        if (change.type === 'position' && change.position) hasPositionChange.add(change.id);
        if (change.type === 'dimensions' && change.updateStyle && change.dimensions) hasDimensionsChange.add(change.id);
      }

      // Intercept remove and resize changes for history markers
      const historyRemoves: string[] = [];
      const filteredChanges = changes.filter(change => {
        if (change.type === 'remove' && change.id?.startsWith('history-marker-')) {
          historyRemoves.push(change.id);
          return false; // Don't let ReactFlow remove the synthetic node
        }
        // Intercept dimension changes from history marker resize
        if (change.type === 'dimensions' && change.id?.startsWith('history-marker-') && change.updateStyle && change.dimensions) {
          const newSize = Math.max(change.dimensions.width, change.dimensions.height) / effectiveScale;
          if (change.id === 'history-marker-root') {
            setMachineProperties(prev => ({ ...prev, historyMarkerSize: newSize }));
          } else {
            const stateId = change.id.replace('history-marker-', '');
            setNodes(nds => nds.map(n => {
              if (n.id === stateId) {
                return { ...n, data: { ...n.data, historyMarkerSize: newSize } };
              }
              return n;
            }));
          }
          return true; // Let it through so ReactFlow updates the visual
        }
        return true;
      });
      if (historyRemoves.length > 0) {
        saveSnapshot();
        for (const markerId of historyRemoves) {
          if (markerId === 'history-marker-root') {
            setRootHistory(false);
            setMachineProperties(prev => {
              const { historyMarkerPos, historyMarkerSize, ...rest } = prev as typeof prev & { historyMarkerPos?: unknown; historyMarkerSize?: unknown };
              return rest;
            });
          } else {
            const stateId = markerId.replace('history-marker-', '');
            setNodes(nds => nds.map(n => {
              if (n.id === stateId) {
                const { historyMarkerPos, historyMarkerSize, ...restData } = n.data as typeof n.data & { historyMarkerPos?: unknown; historyMarkerSize?: unknown };
                return { ...n, data: { ...restData, history: false } };
              }
              return n;
            }));
          }
        }
        if (filteredChanges.length === 0) return;
      }

      // Track world-space position deltas for nodes being resized from left/top
      const resizeDeltas = new Map<string, { dx: number; dy: number }>();

      // Convert position and dimension changes from screen coordinates to world coordinates
      const convertedChanges = filteredChanges.map(change => {
        // Skip initial/history markers - they are virtual nodes
        if (change.id?.startsWith('initial-marker') || change.id?.startsWith('history-marker')) {
          return change;
        }

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
              const worldX = (screenX - effectivePan.x) / effectiveScale;
              const worldY = (screenY - effectivePan.y) / effectiveScale;

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

                  // Constrain to parent bounds (padding as 5% of parent, capped so node fits)
                  const paddingX = Math.max(0, Math.min(parentBounds.width * 0.05, (parentBounds.width - nodeWidth) / 2));
                  const paddingY = Math.max(0, Math.min(parentBounds.height * 0.05, (parentBounds.height - nodeHeight) / 2));
                  relX = Math.max(paddingX, Math.min(relX, parentBounds.width - nodeWidth - paddingX));
                  relY = Math.max(paddingY, Math.min(relY, parentBounds.height - nodeHeight - paddingY));

                  // Track delta if this is a resize-from-left/top
                  if (hasDimensionsChange.has(change.id)) {
                    resizeDeltas.set(change.id, {
                      dx: relX - node.position.x,
                      dy: relY - node.position.y,
                    });
                  }

                  return {
                    ...change,
                    position: { x: relX, y: relY },
                  };
                }
              }

              // Top-level node
              // Track delta if this is a resize-from-left/top
              if (hasDimensionsChange.has(change.id)) {
                resizeDeltas.set(change.id, {
                  dx: worldX - node.position.x,
                  dy: worldY - node.position.y,
                });
              }

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

      // Compensate children for resize-from-left/top so they stay in place on screen
      const childCompensation = [];
      for (const [parentId, delta] of resizeDeltas) {
        if (delta.dx === 0 && delta.dy === 0) continue;
        const children = nodes.filter(n => n.parentId === parentId);
        for (const child of children) {
          childCompensation.push({
            type: 'position' as const,
            id: child.id,
            position: {
              x: child.position.x - delta.dx,
              y: child.position.y - delta.dy,
            },
          });
        }
      }

      onNodesChange([...convertedChanges, ...childCompensation]);
      filteredChanges.forEach(change => {
        if (change.type === 'select' && change.selected) {
          setSelectedTreeItem(change.id);
        } else if (change.type === 'select' && !change.selected && selectedTreeItem === change.id) {
          setSelectedTreeItem(null);
        }
      });
    },
    [onNodesChange, selectedTreeItem, nodes, effectiveScale, effectivePan, setRootHistory, setMachineProperties, saveSnapshot]
  );

  const onEdgesChangeWithSelection = useCallback(
    (changes) => {
      const hasRemove = changes.some(c => c.type === 'remove' || c.type === 'reset');
      if (hasRemove) {
        saveSnapshot();
      }
      onEdgesChange(changes);
      changes.forEach(change => {
        if (change.type === 'select' && change.selected) {
          setSelectedTreeItem(change.id);
        } else if (change.type === 'select' && !change.selected && selectedTreeItem === change.id) {
          setSelectedTreeItem(null);
        }
      });
    },
    [onEdgesChange, selectedTreeItem, saveSnapshot]
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
    saveSnapshot();
    if (nodeId === '/') {
      if (propertyName === 'history') {
        setRootHistory(newValue);
      } else if (propertyName === 'entry' || propertyName === 'exit' || propertyName === 'do') {
        setMachineProperties(prev => ({
          ...prev,
          [propertyName]: newValue,
        }));
      }
      return true;
    }

    if (propertyName === 'label') {
      const trimmedNewValue = newValue.trim();
      if (!trimmedNewValue) {
        alert('State name cannot be empty!');
        return false;
      }
      if (trimmedNewValue.includes('/')) {
        alert('State name cannot contain slashes!');
        return false;
      }
      if (/^\.+$/.test(trimmedNewValue)) {
        alert('State name cannot consist of only dots!');
        return false;
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
          return false;
        }
      }
    }

    if (propertyName === 'label') {
      const trimmedNewValue = (newValue as string).trim();
      setNodes((nds) => {
        // Apply the label change
        const updatedNds = nds.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, label: trimmedNewValue } } : n
        );
        // Update all proxy nodes whose targetId matches
        return updatedNds.map(n => {
          if (n.type === 'proxyNode') {
            const proxyData = n.data as unknown as { targetId: string };
            if (proxyData.targetId === nodeId) {
              const newPath = computeNodePath(nodeId, updatedNds);
              const proxyParentPath = n.parentId ? computeNodePath(n.parentId, updatedNds) : '';
              const relLabel = computeProxyLabel(proxyParentPath, newPath);
              return { ...n, data: { ...n.data, targetPath: newPath, label: relLabel } as unknown as typeof n.data };
            }
          }
          return n;
        });
      });
    } else {
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
    }
    return true;
  }, [nodes, setNodes, setRootHistory, setMachineProperties, saveSnapshot]);

  const handleCopyImage = useCallback(async () => {
    if (!reactFlowWrapper.current) return;
    await copyImageToClipboard(reactFlowWrapper.current);
  }, []);

  const handleExportPdf = useCallback(async () => {
    // Inject @page CSS rule matching the canvas size so the PDF page matches the current view
    const pageStyle = document.createElement('style');
    pageStyle.textContent = `@page { size: ${viewportSize.width}px ${viewportSize.height}px; margin: 0; }`;
    document.head.appendChild(pageStyle);

    const name = currentFilePath
      ? currentFilePath.replace(/^.*[\\/]/, '').replace(/\.\w+$/, '')
      : 'statemachine';

    try {
      await (window as unknown as { fileAPI: { exportPdf: (f: string) => Promise<unknown> } })
        .fileAPI.exportPdf(name + '.pdf');
    } finally {
      pageStyle.remove();
    }
  }, [viewportSize, currentFilePath]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    handleCopy, handlePaste, handleDuplicate, handleDuplicateWithExternalEdges, handleSave, handleOpen,
    handleUndo, handleRedo, handleSemanticZoomToSelected, handleNavigateUp,
    handleGroupStates, handleUngroupState, saveSnapshot,
    handleCopyImage, handleExportPdf,
    nodes, edges,
    isAddingDecision, isAddingTransition, isUngroupingMode, isSettingInitial, isSettingHistory, isAddingProxy,
    isRetargetingTransition, isResourcingTransition,
    selectedMarkerId,
    setIsAddingNode, setIsAddingDecision, setIsAddingTransition, setTransitionSourceId,
    setIsUngroupingMode, setIsSettingInitial, setInitialTargetId, setIsSettingHistory,
    setIsAddingProxy, setProxyTargetId, setProxySourceEdgeId,
    setIsRetargetingTransition, setIsResourcingTransition, setRetargetEdgeId,
    setSelectedMarkerId, setEdges, setNodes, setRootHistory,
    setMachineProperties: setMachineProperties as unknown as (updater: (prev: unknown) => unknown) => void,
    toggleShowLabels: () => setShowLabels(v => !v),
  });

  const onPaneClick = useCallback(
    (event) => {
      // Handle setting root initial state (for top-level states)
      if (isSettingInitial && initialTargetId) {
        const targetNode = nodes.find(n => n.id === initialTargetId);
        if (targetNode && !targetNode.parentId) {
          // Top-level state - place root initial marker
          const rect = reactFlowWrapper.current?.getBoundingClientRect();
          if (!rect) return;

          const screenX = event.clientX - rect.left;
          const screenY = event.clientY - rect.top;
          const worldX = (screenX - effectivePan.x) / effectiveScale;
          const worldY = (screenY - effectivePan.y) / effectiveScale;

          // Calculate marker size (3% of viewport width in world coordinates)
          const markerSize = (viewportSize.width * 0.03) / effectiveScale;

          // Store in machineProperties
          saveSnapshot();
          setMachineProperties(prev => ({
            ...prev,
            initial: initialTargetId,
            initialMarkerPos: { x: worldX, y: worldY },
            initialMarkerSize: markerSize,
          }));

          console.log(`Set ${targetNode.data.label} as root initial state`);
          setIsSettingInitial(false);
          setInitialTargetId(null);
          event.stopPropagation();
          return;
        } else {
          // Not a top-level state, cancel
          setIsSettingInitial(false);
          setInitialTargetId(null);
          return;
        }
      }

      // Handle setting root history marker (click on canvas)
      if (isSettingHistory) {
        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldX = (screenX - effectivePan.x) / effectiveScale;
        const worldY = (screenY - effectivePan.y) / effectiveScale;

        const markerSize = (viewportSize.width * 0.03) / effectiveScale;

        saveSnapshot();
        setRootHistory(true);
        setMachineProperties(prev => ({
          ...prev,
          historyMarkerPos: { x: worldX, y: worldY },
          historyMarkerSize: markerSize,
        }));

        console.log('Set root history marker');
        setIsSettingHistory(false);
        event.stopPropagation();
        return;
      }

      if (isAddingProxy && proxyTargetId) {
        const targetNode = nodes.find(n => n.id === proxyTargetId);
        if (!targetNode) {
          setIsAddingProxy(false);
          setProxyTargetId(null);
          setProxySourceEdgeId(null);
          return;
        }

        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldX = (screenX - effectivePan.x) / effectiveScale;
        const worldY = (screenY - effectivePan.y) / effectiveScale;

        const targetPath = computeNodePath(proxyTargetId, nodes);
        const proxyWidth = 150 / effectiveScale;
        const proxyHeight = 40 / effectiveScale;

        const newProxyId = getNextId();
        const newProxy = {
          id: newProxyId,
          type: 'proxyNode',
          position: { x: worldX, y: worldY },
          data: {
            name: getNextProxyName(),
            targetId: proxyTargetId,
            targetPath,
            label: computeProxyLabel('', targetPath), // root-level: absolute path
            broken: false,
          } as unknown as typeof nodes[0]['data'],
          style: { width: proxyWidth, height: proxyHeight },
          selected: false,
        };

        saveSnapshot();
        setNodes((nds) => [...nds, newProxy]);
        if (proxySourceEdgeId) {
          const sourceId = edges.find(e => e.id === proxySourceEdgeId)?.source ?? '';
          const { sourceHandle, targetHandle } = calculateBestHandles(sourceId, newProxyId, [...nodes, newProxy]);
          setEdges((eds) => eds.map(edge =>
            edge.id === proxySourceEdgeId
              ? { ...edge, target: newProxyId, sourceHandle, targetHandle }
              : edge
          ));
          setProxySourceEdgeId(null);
        }
        setIsAddingProxy(false);
        setProxyTargetId(null);
        event.stopPropagation();
        return;
      } else if (isAddingDecision) {
        // Convert screen click position to world coordinates
        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldX = (screenX - effectivePan.x) / effectiveScale;
        const worldY = (screenY - effectivePan.y) / effectiveScale;

        // Decision size: small circle (~1.5% of viewport width)
        const decisionSize = (viewportSize.width * 0.015) / effectiveScale;

        const newNode = {
          id: getNextId(),
          type: 'decisionNode',
          position: { x: worldX, y: worldY },
          data: { label: getNextDecisionName() },
          style: { width: decisionSize, height: decisionSize },
        };
        saveSnapshot();
        setNodes((nds) => nds.concat(newNode));
        setIsAddingDecision(false);
      } else if (isAddingNode) {
        // Convert screen click position to world coordinates
        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldX = (screenX - effectivePan.x) / effectiveScale;
        const worldY = (screenY - effectivePan.y) / effectiveScale;

        // Size new states as 10% of viewport width, height is half of width
        // Convert from screen size to world size
        const stateWidth = (viewportSize.width * 0.1) / effectiveScale;
        const stateHeight = stateWidth / 2;

        const newNode = {
          id: getNextId(),
          type: 'stateNode',
          position: { x: worldX, y: worldY },
          data: { label: getNextStateName(), history: false, orthogonal: false, entry: '', exit: '', do: '', showEntry: settings.defaultShowEntry, showExit: settings.defaultShowExit, showDo: settings.defaultShowDo, showAnnotation: settings.defaultShowAnnotation },
          style: { width: stateWidth, height: stateHeight },
          selected: true,
        };
        saveSnapshot();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(newNode));
        setSelectedTreeItem(newNode.id);
        setIsAddingNode(false);
        setFocusName(true);
      } else {
        setSelectedTreeItem(null);
        setSelectedMarkerId(null);
        setNodes((nds) =>
          nds.map((node) => ({ ...node, selected: false }))
        );
        setEdges((eds) =>
          eds.map((edge) => ({ ...edge, selected: false }))
        );
      }
    },
    [isAddingNode, isAddingDecision, isAddingProxy, proxyTargetId, proxySourceEdgeId, isSettingInitial, initialTargetId, isSettingHistory, setNodes, setEdges, setMachineProperties, setRootHistory, nodes, edges, effectiveScale, effectivePan, viewportSize, saveSnapshot]
  );

  // Capture snapshot before drag begins
  const onNodeDragStart = useCallback(
    () => {
      dragStartSnapshot.current = { nodes, edges, machineProperties, rootHistory };
    },
    [nodes, edges, machineProperties, rootHistory]
  );

  // Handle marker drag (initial and history markers)
  const onNodeDrag = useCallback(
    (event, node) => {
      if (node.id.startsWith('initial-marker') || node.id.startsWith('history-marker')) {
        setDraggingMarkerId(node.id);
        setDraggingMarkerPos(node.position);
      }
    },
    []
  );

  // Handle drag stop - push pre-drag snapshot for undo
  const onNodeDragStop = useCallback(
    (event, node) => {
      // Push the pre-drag snapshot for undo
      if (dragStartSnapshot.current) {
        pushSnapshot(dragStartSnapshot.current);
        dragStartSnapshot.current = null;
      }
      if (node.id === 'initial-marker-root') {
        // Root initial marker - update machineProperties
        const screenX = node.position.x + 7.5; // Center of 15px marker
        const screenY = node.position.y + 7.5;
        const worldX = (screenX - effectivePan.x) / effectiveScale;
        const worldY = (screenY - effectivePan.y) / effectiveScale;
        setMachineProperties(prev => ({
          ...prev,
          initialMarkerPos: { x: worldX, y: worldY },
        }));
        setDraggingMarkerId(null);
        setDraggingMarkerPos(null);
      } else if (node.id.startsWith('initial-marker-')) {
        // Parent initial marker - update parent node
        const parentId = node.id.replace('initial-marker-', '');
        const parentBounds = getAbsoluteNodeBounds(parentId, nodes);
        if (parentBounds) {
          const screenX = node.position.x + 7.5; // Center of 15px marker
          const screenY = node.position.y + 7.5;
          const worldX = (screenX - effectivePan.x) / effectiveScale;
          const worldY = (screenY - effectivePan.y) / effectiveScale;
          const relX = worldX - parentBounds.x;
          const relY = worldY - parentBounds.y;
          setNodes(nds => nds.map(n => {
            if (n.id === parentId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  initialMarkerPos: { x: relX, y: relY },
                },
              };
            }
            return n;
          }));
        }
        setDraggingMarkerId(null);
        setDraggingMarkerPos(null);
      } else if (node.id === 'history-marker-root') {
        // Root history marker - update machineProperties
        const screenSize = node.style?.width as number || 20;
        const screenX = node.position.x + screenSize / 2;
        const screenY = node.position.y + screenSize / 2;
        const worldX = (screenX - effectivePan.x) / effectiveScale;
        const worldY = (screenY - effectivePan.y) / effectiveScale;
        setMachineProperties(prev => ({
          ...prev,
          historyMarkerPos: { x: worldX, y: worldY },
        }));
        setDraggingMarkerId(null);
        setDraggingMarkerPos(null);
      } else if (node.id.startsWith('history-marker-')) {
        // State history marker - update state node
        const stateId = node.id.replace('history-marker-', '');
        const stateBounds = getAbsoluteNodeBounds(stateId, nodes);
        if (stateBounds) {
          const screenSize = node.style?.width as number || 20;
          const screenX = node.position.x + screenSize / 2;
          const screenY = node.position.y + screenSize / 2;
          const worldX = (screenX - effectivePan.x) / effectiveScale;
          const worldY = (screenY - effectivePan.y) / effectiveScale;
          const relX = worldX - stateBounds.x;
          const relY = worldY - stateBounds.y;
          setNodes(nds => nds.map(n => {
            if (n.id === stateId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  historyMarkerPos: { x: relX, y: relY },
                },
              };
            }
            return n;
          }));
        }
        setDraggingMarkerId(null);
        setDraggingMarkerPos(null);
      }
    },
    [effectivePan, effectiveScale, nodes, setMachineProperties, setNodes, pushSnapshot]
  );

  const onNodeClick = useCallback(
    (event, node) => {
      // Handle transition creation mode
      if (isAddingTransition && transitionSourceId) {
        // Create transition from source to this node
        createTransition(transitionSourceId, node.id);
        setIsAddingTransition(false);
        setTransitionSourceId(null);
        // Deselect nodes so the transition properties panel shows with Guard focused
        setSelectedTreeItem(null);
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        setFocusGuard(true);
        event.stopPropagation();
        return;
      }

      // Handle retargeting a transition (Shift+T)
      if (isRetargetingTransition && retargetEdgeId) {
        saveSnapshot();
        const { sourceHandle, targetHandle } = calculateBestHandles(
          edges.find(e => e.id === retargetEdgeId)?.source ?? '',
          node.id,
          nodes,
        );
        setEdges((eds) => eds.map((edge) => {
          if (edge.id === retargetEdgeId) {
            return { ...edge, target: node.id, targetHandle, sourceHandle };
          }
          return edge;
        }));
        setIsRetargetingTransition(false);
        setRetargetEdgeId(null);
        event.stopPropagation();
        return;
      }

      // Handle re-sourcing a transition (Shift+S)
      if (isResourcingTransition && retargetEdgeId) {
        // Proxy nodes cannot be sources
        if (node.type === 'proxyNode') return;
        saveSnapshot();
        const { sourceHandle, targetHandle } = calculateBestHandles(
          node.id,
          edges.find(e => e.id === retargetEdgeId)?.target ?? '',
          nodes,
        );
        setEdges((eds) => eds.map((edge) => {
          if (edge.id === retargetEdgeId) {
            return { ...edge, source: node.id, sourceHandle, targetHandle };
          }
          return edge;
        }));
        setIsResourcingTransition(false);
        setRetargetEdgeId(null);
        event.stopPropagation();
        return;
      }

      // Handle setting initial state mode
      if (isSettingInitial && initialTargetId) {
        const targetNode = nodes.find(n => n.id === initialTargetId);
        if (targetNode && targetNode.parentId === node.id) {
          // Clicked on the parent of the target - place initial marker here
          const rect = reactFlowWrapper.current?.getBoundingClientRect();
          if (!rect) return;

          const screenX = event.clientX - rect.left;
          const screenY = event.clientY - rect.top;
          const worldX = (screenX - effectivePan.x) / effectiveScale;
          const worldY = (screenY - effectivePan.y) / effectiveScale;

          // Get parent bounds to calculate relative position
          const parentBounds = getAbsoluteNodeBounds(node.id, nodes);
          if (parentBounds) {
            const relativeX = worldX - parentBounds.x;
            const relativeY = worldY - parentBounds.y;

            // Calculate marker size (3% of parent width)
            const markerSize = parentBounds.width * 0.03;

            // Update parent node with initial info
            saveSnapshot();
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id === node.id) {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      initial: initialTargetId,
                      initialMarkerPos: { x: relativeX, y: relativeY },
                      initialMarkerSize: markerSize,
                    },
                  };
                }
                return n;
              })
            );

            console.log(`Set ${targetNode.data.label} as initial state of ${node.data.label}`);
          }

          setIsSettingInitial(false);
          setInitialTargetId(null);
          event.stopPropagation();
          return;
        }
      }

      // Handle setting history marker mode
      if (isSettingHistory && node.type === 'stateNode') {
        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldX = (screenX - effectivePan.x) / effectiveScale;
        const worldY = (screenY - effectivePan.y) / effectiveScale;

        const stateBounds = getAbsoluteNodeBounds(node.id, nodes);
        if (stateBounds) {
          const relativeX = worldX - stateBounds.x;
          const relativeY = worldY - stateBounds.y;
          const markerSize = Math.min(stateBounds.width, stateBounds.height) * 0.15;

          saveSnapshot();
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === node.id) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    history: true,
                    historyMarkerPos: { x: relativeX, y: relativeY },
                    historyMarkerSize: markerSize,
                  },
                };
              }
              return n;
            })
          );

          console.log(`Set history marker on ${node.data.label}`);
        }

        setIsSettingHistory(false);
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

      // For marker nodes (initial/history), track selection ourselves
      if (node.id.startsWith('initial-marker') || node.id.startsWith('history-marker')) {
        setSelectedMarkerId(node.id);
        setSelectedTreeItem(null);
        // Deselect all real nodes
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
        return;
      }

      // If we just created an edge by dragging (onConnect fired), skip normal node selection
      // so the newly created edge stays selected and the Guard field gets focus.
      if (justConnectedRef.current) {
        justConnectedRef.current = false;
        return;
      }

      setSelectedMarkerId(null);
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

        // Size based on 10% of viewport width, scaled for nesting depth
        // Convert from screen size to world size
        const baseNodeWidth = (viewportSize.width * 0.1) / effectiveScale;
        const baseNodeHeight = baseNodeWidth / 2;
        const scaledNodeWidth = baseNodeWidth * scale;
        const scaledNodeHeight = baseNodeHeight * scale;

        // Calculate relative position within parent (in world coordinates)
        const newRelativePosition = {
          x: worldClickX - parentBounds.x,
          y: worldClickY - parentBounds.y,
        };

        // Padding as 5% of parent dimension, capped so child always fits
        const safePaddingX = Math.min(parentBounds.width * 0.05, (parentBounds.width - scaledNodeWidth) / 2);
        const safePaddingY = Math.min(parentBounds.height * 0.05, (parentBounds.height - scaledNodeHeight) / 2);

        // Clamp to parent bounds (using world coordinate dimensions)
        if (safePaddingX > 0) {
          newRelativePosition.x = Math.max(safePaddingX, Math.min(newRelativePosition.x, parentBounds.width - scaledNodeWidth - safePaddingX));
        } else {
          // Child is larger than parent — center it
          newRelativePosition.x = (parentBounds.width - scaledNodeWidth) / 2;
        }

        if (safePaddingY > 0) {
          newRelativePosition.y = Math.max(safePaddingY, Math.min(newRelativePosition.y, parentBounds.height - scaledNodeHeight - safePaddingY));
        } else {
          // Child is larger than parent — center it
          newRelativePosition.y = (parentBounds.height - scaledNodeHeight) / 2;
        }



        const newNode = {
          id: getNextId(),
          type: 'stateNode',
          position: newRelativePosition,
          parentId: node.id,
          extent: 'parent',
          data: { label: getNextStateName(), history: false, orthogonal: false, entry: '', exit: '', do: '', showEntry: settings.defaultShowEntry, showExit: settings.defaultShowExit, showDo: settings.defaultShowDo, showAnnotation: settings.defaultShowAnnotation },
          style: { width: scaledNodeWidth, height: scaledNodeHeight },
          selected: true,
        };
        saveSnapshot();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(newNode));
        setSelectedTreeItem(newNode.id);
        setIsAddingNode(false);
        setFocusName(true);
        event.stopPropagation();
      }

      if (isAddingDecision && node.selected && node.type === 'stateNode') {
        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldClickX = (screenX - effectivePan.x) / effectiveScale;
        const worldClickY = (screenY - effectivePan.y) / effectiveScale;

        const parentBounds = getAbsoluteNodeBounds(node.id, nodes);
        if (!parentBounds) return;

        // Decision size: small circle (~1.5% of viewport width, scaled for depth)
        const parentDepth = calculateNodeDepth(node.id, nodes);
        const childDepth = parentDepth + 1;
        const scale = Math.pow(NESTING_SCALE_FACTOR, childDepth);
        const decisionSize = (viewportSize.width * 0.015) / effectiveScale * scale;

        const newRelativePosition = {
          x: worldClickX - parentBounds.x,
          y: worldClickY - parentBounds.y,
        };

        // Clamp to parent bounds
        const safePaddingX = Math.min(parentBounds.width * 0.05, (parentBounds.width - decisionSize) / 2);
        const safePaddingY = Math.min(parentBounds.height * 0.05, (parentBounds.height - decisionSize) / 2);
        if (safePaddingX > 0) {
          newRelativePosition.x = Math.max(safePaddingX, Math.min(newRelativePosition.x, parentBounds.width - decisionSize - safePaddingX));
        } else {
          newRelativePosition.x = (parentBounds.width - decisionSize) / 2;
        }
        if (safePaddingY > 0) {
          newRelativePosition.y = Math.max(safePaddingY, Math.min(newRelativePosition.y, parentBounds.height - decisionSize - safePaddingY));
        } else {
          newRelativePosition.y = (parentBounds.height - decisionSize) / 2;
        }

        const newNode = {
          id: getNextId(),
          type: 'decisionNode',
          position: newRelativePosition,
          parentId: node.id,
          extent: 'parent',
          data: { label: getNextDecisionName() },
          style: { width: decisionSize, height: decisionSize },
        };
        saveSnapshot();
        setNodes((nds) => nds.concat(newNode));
        setIsAddingDecision(false);
        event.stopPropagation();
      }

      // Handle proxy placement inside a parent state
      if (isAddingProxy && proxyTargetId && node.type === 'stateNode') {
        const targetNode = nodes.find(n => n.id === proxyTargetId);
        if (!targetNode) {
          setIsAddingProxy(false);
          setProxyTargetId(null);
          setProxySourceEdgeId(null);
          return;
        }

        const rect = reactFlowWrapper.current?.getBoundingClientRect();
        if (!rect) return;

        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldClickX = (screenX - effectivePan.x) / effectiveScale;
        const worldClickY = (screenY - effectivePan.y) / effectiveScale;

        const parentBounds = getAbsoluteNodeBounds(node.id, nodes);
        if (!parentBounds) return;

        const targetPath = computeNodePath(proxyTargetId, nodes);
        const proxyWidth = 150 / effectiveScale;
        const proxyHeight = 40 / effectiveScale;

        const newRelativePosition = {
          x: worldClickX - parentBounds.x,
          y: worldClickY - parentBounds.y,
        };

        // Clamp to parent bounds
        const safePaddingX = Math.min(parentBounds.width * 0.05, Math.max(0, (parentBounds.width - proxyWidth) / 2));
        const safePaddingY = Math.min(parentBounds.height * 0.05, Math.max(0, (parentBounds.height - proxyHeight) / 2));
        if (safePaddingX > 0) {
          newRelativePosition.x = Math.max(safePaddingX, Math.min(newRelativePosition.x, parentBounds.width - proxyWidth - safePaddingX));
        }
        if (safePaddingY > 0) {
          newRelativePosition.y = Math.max(safePaddingY, Math.min(newRelativePosition.y, parentBounds.height - proxyHeight - safePaddingY));
        }

        const parentPath = computeNodePath(node.id, nodes);
        const newProxyId = getNextId();
        const newProxy = {
          id: newProxyId,
          type: 'proxyNode',
          position: newRelativePosition,
          parentId: node.id,
          extent: 'parent',
          data: {
            name: getNextProxyName(),
            targetId: proxyTargetId,
            targetPath,
            label: computeProxyLabel(parentPath, targetPath), // relative from parent context
            broken: false,
          } as unknown as typeof nodes[0]['data'],
          style: { width: proxyWidth, height: proxyHeight },
          selected: false,
        };

        saveSnapshot();
        setNodes((nds) => [...nds, newProxy]);
        if (proxySourceEdgeId) {
          const sourceId = edges.find(e => e.id === proxySourceEdgeId)?.source ?? '';
          const { sourceHandle, targetHandle } = calculateBestHandles(sourceId, newProxyId, [...nodes, newProxy]);
          setEdges((eds) => eds.map(edge =>
            edge.id === proxySourceEdgeId
              ? { ...edge, target: newProxyId, sourceHandle, targetHandle }
              : edge
          ));
          setProxySourceEdgeId(null);
        }
        setIsAddingProxy(false);
        setProxyTargetId(null);
        event.stopPropagation();
      }
    },
    [isAddingNode, isAddingDecision, isAddingProxy, proxyTargetId, proxySourceEdgeId, isAddingTransition, transitionSourceId, createTransition, isUngroupingMode, handleUngroupState, isSettingInitial, initialTargetId, isSettingHistory, isRetargetingTransition, isResourcingTransition, retargetEdgeId, setNodes, setEdges, setSelectedTreeItem, nodes, edges, effectiveScale, effectivePan, viewportSize, saveSnapshot]
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <AppBar className="no-print" position="static" color="default" elevation={1}>
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
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <Button
                variant="outlined"
                size="small"
                startIcon={<UndoIcon />}
                onClick={handleUndo}
                disabled={!canUndo}
              >
                Undo
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Shift+Z)">
            <span>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RedoIcon />}
                onClick={handleRedo}
                disabled={!canRedo}
              >
                Redo
              </Button>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          <Tooltip title="Machine Properties">
            <Button
              variant="outlined"
              size="small"
              startIcon={<SettingsIcon />}
              onClick={() => setMachinePropertiesDialogOpen(true)}
            >
              Properties
            </Button>
          </Tooltip>
          <Tooltip title="Editor Settings">
            <Button
              variant="outlined"
              size="small"
              startIcon={<TuneIcon />}
              onClick={() => setSettingsDialogOpen(true)}
            >
              Settings
            </Button>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            Cmd+S: Save | Cmd+Shift+S: Export | Cmd+O: Open
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        <Paper
          className="no-print"
          elevation={0}
          sx={{
            width: 280,
            display: 'flex',
            flexDirection: 'column',
            borderRight: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ p: 2, maxHeight: '50%', overflowY: 'auto', flexShrink: 0 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              State Tree
            </Typography>
            <StateTree treeData={treeData} onSelect={handleTreeSelect} selectedItemId={selectedTreeItem} />
          </Box>

          <Divider />

          <Box sx={{ p: 2, flexGrow: 1, overflowY: 'auto' }}>
            <PropertiesPanel
              selectedNode={selectedNode}
              selectedCanvasEdge={edges.find(e => e.selected) || null}
              nodes={nodes}
              edges={edges}
              onPropertyChange={handlePropertyChange}
              onEdgePropertyChange={handleEdgePropertyChange}
              onReorderEdge={handleReorderEdge}
              settings={settings}
              language={machineProperties.language}
              focusGuard={focusGuard}
              onGuardFocused={() => setFocusGuard(false)}
              focusName={focusName}
              onNameFocused={() => setFocusName(false)}
            />
          </Box>
        </Paper>

        <Box
          ref={reactFlowWrapper}
          className={isAddingNode || isAddingDecision || isAddingProxy || isAddingTransition || isSettingInitial || isSettingHistory || isRetargetingTransition || isResourcingTransition ? 'crosshair' : isUngroupingMode ? 'ungroup-cursor' : ''}
          sx={{
            flexGrow: 1,
            position: 'relative',
            cursor: isUngroupingMode ? 'n-resize' : (isAddingNode || isAddingDecision || isAddingProxy || isAddingTransition || isSettingInitial || isSettingHistory || isRetargetingTransition || isResourcingTransition ? 'crosshair' : 'default'),
            '& *': {
              cursor: isUngroupingMode ? 'n-resize !important' : (isAddingNode || isAddingDecision || isAddingProxy || isAddingTransition || isSettingInitial || isSettingHistory || isRetargetingTransition || isResourcingTransition ? 'crosshair !important' : undefined),
            },
          }}
          onMouseDown={handlePaneMouseDown}
          onMouseMove={handlePaneMouseMove}
          onMouseUp={handlePaneMouseUp}
          onMouseLeave={handlePaneMouseUp}
        >
          <LabelsVisibleProvider value={showLabels}>
          <EdgesProvider value={setEdges}>
            <ReactFlow
              nodes={transformedNodes}
              edges={transformedEdges}
              onNodesChange={onNodesChangeWithSelection}
              onEdgesChange={onEdgesChangeWithSelection}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onPaneClick={onPaneClick}
              onNodeClick={onNodeClick}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              isValidConnection={isValidConnection}
              connectionRadius={40}
              connectionMode={ConnectionMode.Loose}
              edgesUpdatable={false}
              reconnectRadius={20}
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
              deleteKeyCode={['Backspace', 'Delete']}
              proOptions={{ hideAttribution: true }}
            />
          </EdgesProvider>
          </LabelsVisibleProvider>
        </Box>
      </Box>

      <MachinePropertiesDialog
        open={machinePropertiesDialogOpen}
        onClose={() => setMachinePropertiesDialogOpen(false)}
        machineProperties={machineProperties}
        onSave={(props) => { saveSnapshot(); setMachineProperties(props); }}
        tabWidth={settings.tabWidth}
      />

      <SettingsDialog
        open={settingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
        settings={settings}
        onSave={(newSettings) => {
          setSettings(newSettings);
          window.settingsAPI.save(newSettings).catch((error) => {
            console.error('Error saving settings:', error);
          });
        }}
      />
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
