import { create } from 'zustand';
import { Node } from 'reactflow';

// Configuration constants
export const SEMANTIC_ZOOM_CONFIG = {
  MIN_VISIBLE_SIZE: 20,       // Hide nodes smaller than 20px
  MAX_VISIBLE_SIZE: 5000,     // Hide nodes larger than 5000px
  TRANSITION_DURATION: 300,   // Animation duration in ms
  VIEWPORT_MARGIN: 50,        // Margin for viewport culling
};

// Semantic zoom state
export interface SemanticZoomState {
  focusNodeId: string | null;  // Node being zoomed into (null = root view)
  zoomLevel: number;           // 1.0 = normal, >1 = zoomed in
  panOffset: { x: number; y: number };  // Pan in screen pixels

  // Animation state
  isAnimating: boolean;
  animationStartTime: number;
  animationFrom: {
    zoomLevel: number;
    panOffset: { x: number; y: number };
  } | null;
  animationTo: {
    zoomLevel: number;
    panOffset: { x: number; y: number };
  } | null;

  // Actions
  setFocusNode: (nodeId: string | null) => void;
  setZoomLevel: (level: number) => void;
  adjustZoom: (delta: number, centerX?: number, centerY?: number) => void;
  adjustPan: (deltaX: number, deltaY: number) => void;
  setPan: (x: number, y: number) => void;
  startAnimation: (toZoomLevel: number, toPan: { x: number; y: number }) => void;
  updateAnimation: (progress: number) => void;
  finishAnimation: () => void;
}

export const useSemanticZoomStore = create<SemanticZoomState>((set, get) => ({
  focusNodeId: null,
  zoomLevel: 1.0,
  panOffset: { x: 0, y: 0 },
  isAnimating: false,
  animationStartTime: 0,
  animationFrom: null,
  animationTo: null,

  setFocusNode: (nodeId) => set({ focusNodeId: nodeId }),

  setZoomLevel: (level) => set({ zoomLevel: Math.max(0.01, level) }),

  adjustZoom: (delta, centerX, centerY) => {
    const state = get();
    const newZoom = Math.max(0.01, state.zoomLevel * (1 + delta));

    // If center point provided, adjust pan to keep that point fixed
    if (centerX !== undefined && centerY !== undefined) {
      const zoomRatio = newZoom / state.zoomLevel;
      const newPanX = centerX - (centerX - state.panOffset.x) * zoomRatio;
      const newPanY = centerY - (centerY - state.panOffset.y) * zoomRatio;
      set({
        zoomLevel: newZoom,
        panOffset: { x: newPanX, y: newPanY }
      });
    } else {
      set({ zoomLevel: newZoom });
    }
  },

  adjustPan: (deltaX, deltaY) => set((state) => ({
    panOffset: {
      x: state.panOffset.x + deltaX,
      y: state.panOffset.y + deltaY,
    },
  })),

  setPan: (x, y) => set({ panOffset: { x, y } }),

  startAnimation: (toZoomLevel, toPan) => set((state) => ({
    isAnimating: true,
    animationStartTime: performance.now(),
    animationFrom: {
      zoomLevel: state.zoomLevel,
      panOffset: { ...state.panOffset },
    },
    animationTo: {
      zoomLevel: toZoomLevel,
      panOffset: toPan,
    },
  })),

  updateAnimation: (progress) => {
    const state = get();
    if (!state.animationFrom || !state.animationTo) return;

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);

    const newZoom = state.animationFrom.zoomLevel +
      (state.animationTo.zoomLevel - state.animationFrom.zoomLevel) * eased;
    const newPanX = state.animationFrom.panOffset.x +
      (state.animationTo.panOffset.x - state.animationFrom.panOffset.x) * eased;
    const newPanY = state.animationFrom.panOffset.y +
      (state.animationTo.panOffset.y - state.animationFrom.panOffset.y) * eased;

    set({
      zoomLevel: newZoom,
      panOffset: { x: newPanX, y: newPanY },
    });
  },

  finishAnimation: () => set({
    isAnimating: false,
    animationFrom: null,
    animationTo: null,
  }),
}));

// Node visibility result
export interface NodeVisibility {
  visible: boolean;
  screenBounds: { x: number; y: number; width: number; height: number };
  effectiveScale: number;
  cullingReason?: 'too-small' | 'too-large' | 'outside-viewport';
}

// Transform result for a node
export interface NodeTransform {
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  effectiveScale: number;
}

// Calculate absolute position of a node by traversing up the parent chain
export function getAbsoluteNodeBounds(
  nodeId: string,
  nodesArray: Node[]
): { x: number; y: number; width: number; height: number } | null {
  const node = nodesArray.find(n => n.id === nodeId);
  if (!node) return null;

  let absoluteX = node.position.x;
  let absoluteY = node.position.y;
  let currentNode = node;

  while (currentNode.parentId) {
    const parent = nodesArray.find(n => n.id === currentNode.parentId);
    if (!parent) break;
    absoluteX += parent.position.x;
    absoluteY += parent.position.y;
    currentNode = parent;
  }

  const width = (node.style?.width as number) || node.width || 150;
  const height = (node.style?.height as number) || node.height || 50;

  return { x: absoluteX, y: absoluteY, width, height };
}

// Get all ancestor node IDs for a given node
export function getAncestorIds(nodeId: string, nodesArray: Node[]): string[] {
  const ancestors: string[] = [];
  let current = nodesArray.find(n => n.id === nodeId);

  while (current?.parentId) {
    ancestors.push(current.parentId);
    current = nodesArray.find(n => n.id === current!.parentId);
  }

  return ancestors;
}

// Calculate the semantic transform for a node
export function calculateSemanticTransform(
  nodeId: string,
  nodesArray: Node[],
  focusNodeId: string | null,
  zoomLevel: number,
  panOffset: { x: number; y: number },
  viewportSize: { width: number; height: number }
): NodeTransform | null {
  const nodeBounds = getAbsoluteNodeBounds(nodeId, nodesArray);
  if (!nodeBounds) return null;

  // If there's a focus node, calculate the transform relative to it
  let baseScale = zoomLevel;
  let offsetX = 0;
  let offsetY = 0;

  if (focusNodeId) {
    const focusBounds = getAbsoluteNodeBounds(focusNodeId, nodesArray);
    if (focusBounds) {
      // Calculate scale so focus node fills the viewport (with some padding)
      const padding = 0.1;
      const scaleX = viewportSize.width * (1 - padding * 2) / focusBounds.width;
      const scaleY = viewportSize.height * (1 - padding * 2) / focusBounds.height;
      baseScale = Math.min(scaleX, scaleY) * zoomLevel;

      // Calculate offset so focus node is centered
      const focusCenterX = focusBounds.x + focusBounds.width / 2;
      const focusCenterY = focusBounds.y + focusBounds.height / 2;
      offsetX = viewportSize.width / 2 - focusCenterX * baseScale;
      offsetY = viewportSize.height / 2 - focusCenterY * baseScale;
    }
  } else {
    // No focus node - viewport offset is just panOffset (no centering)
    // This matches the renderer's setViewport call
    offsetX = 0;
    offsetY = 0;
  }

  // Apply pan offset
  offsetX += panOffset.x;
  offsetY += panOffset.y;

  // Calculate screen position and size
  const screenX = nodeBounds.x * baseScale + offsetX;
  const screenY = nodeBounds.y * baseScale + offsetY;
  const screenWidth = nodeBounds.width * baseScale;
  const screenHeight = nodeBounds.height * baseScale;

  return {
    screenX,
    screenY,
    screenWidth,
    screenHeight,
    effectiveScale: baseScale,
  };
}

// Determine if a node should be visible based on its transform
export function calculateNodeVisibility(
  transform: NodeTransform,
  viewportSize: { width: number; height: number },
  config = SEMANTIC_ZOOM_CONFIG
): NodeVisibility {
  const { screenX, screenY, screenWidth, screenHeight, effectiveScale } = transform;
  const { MIN_VISIBLE_SIZE, MAX_VISIBLE_SIZE, VIEWPORT_MARGIN } = config;

  const screenBounds = {
    x: screenX,
    y: screenY,
    width: screenWidth,
    height: screenHeight,
  };

  // Check if too small
  if (screenWidth < MIN_VISIBLE_SIZE || screenHeight < MIN_VISIBLE_SIZE) {
    return {
      visible: false,
      screenBounds,
      effectiveScale,
      cullingReason: 'too-small',
    };
  }

  // Check if too large (ancestor when zoomed in)
  if (screenWidth > MAX_VISIBLE_SIZE || screenHeight > MAX_VISIBLE_SIZE) {
    return {
      visible: false,
      screenBounds,
      effectiveScale,
      cullingReason: 'too-large',
    };
  }

  // Check if outside viewport (with margin)
  const isOutside =
    screenX + screenWidth < -VIEWPORT_MARGIN ||
    screenY + screenHeight < -VIEWPORT_MARGIN ||
    screenX > viewportSize.width + VIEWPORT_MARGIN ||
    screenY > viewportSize.height + VIEWPORT_MARGIN;

  if (isOutside) {
    return {
      visible: false,
      screenBounds,
      effectiveScale,
      cullingReason: 'outside-viewport',
    };
  }

  return {
    visible: true,
    screenBounds,
    effectiveScale,
  };
}

// Compute all visible nodes with their transforms
export function computeVisibleNodes(
  nodes: Node[],
  focusNodeId: string | null,
  zoomLevel: number,
  panOffset: { x: number; y: number },
  viewportSize: { width: number; height: number }
): Map<string, { transform: NodeTransform; visibility: NodeVisibility }> {
  const result = new Map<string, { transform: NodeTransform; visibility: NodeVisibility }>();

  for (const node of nodes) {
    const transform = calculateSemanticTransform(
      node.id,
      nodes,
      focusNodeId,
      zoomLevel,
      panOffset,
      viewportSize
    );

    if (transform) {
      const visibility = calculateNodeVisibility(transform, viewportSize);
      result.set(node.id, { transform, visibility });
    }
  }

  return result;
}
