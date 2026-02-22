import React, { useCallback, useState, useEffect, useRef } from 'react';
import { EdgeProps, useStore, Position } from 'reactflow';
import { useSetEdges, useLabelsVisible } from './EdgesContext';

// Coordinate system transformation utilities
// Local coords: (0,0) = source, (1,0) = target
// y-axis is perpendicular to the source-target line

interface ControlPoint {
  x: number; // 0 = source, 1 = target (along the edge)
  y: number; // perpendicular offset (positive = left of direction)
}

interface SplineEdgeData {
  controlPoints?: ControlPoint[];
  labelPosition?: number;      // 0-1 position along the edge (default 0.33)
  label?: string;
  guard?: string;
  action?: string;
  effectiveScale?: number;
  sourceIsAncestor?: boolean;  // true if source is ancestor of target
  targetIsAncestor?: boolean;  // true if target is ancestor of source
  warning?: boolean;           // true if this transition is unreachable (after a guardless transition)
}

// Transform from local (normalized) coordinates to absolute canvas coordinates
function localToAbsolute(
  point: ControlPoint,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  return {
    x: sourceX + point.x * dx - point.y * dy,
    y: sourceY + point.x * dy + point.y * dx,
  };
}

// Transform from absolute canvas coordinates to local (normalized) coordinates
function absoluteToLocal(
  absX: number,
  absY: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): ControlPoint {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return { x: 0, y: 0 };
  }

  const relX = absX - sourceX;
  const relY = absY - sourceY;

  return {
    x: (relX * dx + relY * dy) / lengthSq,
    y: (-relX * dy + relY * dx) / lengthSq,
  };
}

// Get direction vector for a handle position (orthogonal to node edge)
function getPositionDirection(position: Position): { x: number; y: number } {
  switch (position) {
    case Position.Top:
      return { x: 0, y: -1 };
    case Position.Bottom:
      return { x: 0, y: 1 };
    case Position.Left:
      return { x: -1, y: 0 };
    case Position.Right:
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 1 };
  }
}

interface Point { x: number; y: number }

interface BezierSegment {
  p0: Point; p1: Point; p2: Point; p3: Point;
}

interface PathResult {
  path: string;
  // Full control points of the last cubic bezier segment (for exact truncation)
  lastSegment: { p0: Point; p1: Point; p2: Point; p3: Point };
  // All bezier segments for evaluating points along the path
  segments: BezierSegment[];
}

// De Casteljau split: returns both sub-curves when splitting at parameter t
// First sub-curve: q0,q1,q2,q3 (start → split point)
// Second sub-curve: r0,r1,r2,r3 (split point → end)
function splitBezierAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number) {
  const a = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
  const b = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  const c = { x: p2.x + (p3.x - p2.x) * t, y: p2.y + (p3.y - p2.y) * t };
  const d = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const e = { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t };
  const f = { x: d.x + (e.x - d.x) * t, y: d.y + (e.y - d.y) * t };
  return {
    q0: p0, q1: a, q2: d, q3: f,   // first sub-curve
    r0: f, r1: e, r2: c, r3: p3,    // second sub-curve
  };
}

// Find t parameter such that the arc length from t to 1 equals the given distance.
// Uses binary search on arc length for robustness (unlike speed-based linear approximation).
function findTForDistanceFromEnd(p0: Point, p1: Point, p2: Point, p3: Point, distance: number): number {
  const totalLength = approxBezierLength(p0, p1, p2, p3);
  if (distance >= totalLength) return 0;
  if (distance <= 0) return 1;

  const targetFromStart = totalLength - distance;
  let lo = 0, hi = 1;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const split = splitBezierAt(p0, p1, p2, p3, mid);
    const lengthToMid = approxBezierLength(split.q0, split.q1, split.q2, split.q3);
    if (lengthToMid < targetFromStart) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// Split a multi-segment bezier path at a given distance from the end.
// Returns the portion before the split and after the split as separate segment arrays.
function splitMultiSegFromEnd(segments: BezierSegment[], distance: number): {
  before: BezierSegment[];
  after: BezierSegment[];
} {
  if (segments.length === 0) return { before: [], after: [] };

  let remaining = distance;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const segLen = approxBezierLength(seg.p0, seg.p1, seg.p2, seg.p3);
    if (remaining <= segLen) {
      const t = findTForDistanceFromEnd(seg.p0, seg.p1, seg.p2, seg.p3, remaining);
      const split = splitBezierAt(seg.p0, seg.p1, seg.p2, seg.p3, t);
      return {
        before: [
          ...segments.slice(0, i),
          { p0: split.q0, p1: split.q1, p2: split.q2, p3: split.q3 },
        ],
        after: [
          { p0: split.r0, p1: split.r1, p2: split.r2, p3: split.r3 },
          ...segments.slice(i + 1),
        ],
      };
    }
    remaining -= segLen;
  }
  // Distance exceeds total path length
  return { before: [], after: [...segments] };
}

// Rotate a point around a center by angle (radians)
function rotatePoint(pt: Point, center: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

// Generate a self-loop path from source handle to target handle on the same node
function generateSelfLoopPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  loopSize = 50
): PathResult {
  const sourceDir = getPositionDirection(sourcePosition);
  const targetDir = getPositionDirection(targetPosition);

  // Perpendicular vector to spread control points for a visible bow
  const sourcePerpX = -sourceDir.y;
  const sourcePerpY = sourceDir.x;
  const targetPerpX = -targetDir.y;
  const targetPerpY = targetDir.x;

  // Control points extend outward AND spread perpendicular to form a loop
  const spread = loopSize * 0.6;
  const cp1x = sourceX + sourceDir.x * loopSize + sourcePerpX * spread;
  const cp1y = sourceY + sourceDir.y * loopSize + sourcePerpY * spread;
  const cp2x = targetX + targetDir.x * loopSize - targetPerpX * spread;
  const cp2y = targetY + targetDir.y * loopSize - targetPerpY * spread;

  const seg = {
    p0: { x: sourceX, y: sourceY },
    p1: { x: cp1x, y: cp1y },
    p2: { x: cp2x, y: cp2y },
    p3: { x: targetX, y: targetY },
  };
  return {
    path: `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`,
    lastSegment: seg,
    segments: [seg],
  };
}

// Evaluate a point on a cubic bezier curve at parameter t
function evalBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

// Approximate the length of a cubic bezier segment by sampling
function approxBezierLength(p0: Point, p1: Point, p2: Point, p3: Point, steps = 20): number {
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const pt = evalBezier(p0, p1, p2, p3, i / steps);
    length += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return length;
}

// Evaluate a point at fractional distance t along a multi-segment bezier path
function evalPointOnPath(segments: BezierSegment[], t: number): Point {
  if (segments.length === 0) return { x: 0, y: 0 };
  if (segments.length === 1) return evalBezier(segments[0].p0, segments[0].p1, segments[0].p2, segments[0].p3, t);

  // Compute lengths of each segment
  const lengths = segments.map(s => approxBezierLength(s.p0, s.p1, s.p2, s.p3));
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  if (totalLength === 0) return segments[0].p0;

  const targetDist = t * totalLength;
  let accumulated = 0;
  for (let i = 0; i < segments.length; i++) {
    if (accumulated + lengths[i] >= targetDist || i === segments.length - 1) {
      const localT = lengths[i] > 0 ? (targetDist - accumulated) / lengths[i] : 0;
      const s = segments[i];
      return evalBezier(s.p0, s.p1, s.p2, s.p3, Math.max(0, Math.min(1, localT)));
    }
    accumulated += lengths[i];
  }
  const last = segments[segments.length - 1];
  return last.p3;
}

// Find the t value (0-1) on the path closest to a given point
function closestTOnPath(segments: BezierSegment[], px: number, py: number, samples = 100): number {
  if (segments.length === 0) return 0;
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pt = evalPointOnPath(segments, t);
    const dist = (pt.x - px) * (pt.x - px) + (pt.y - py) * (pt.y - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestT = t;
    }
  }
  return bestT;
}

// Generate a Catmull-Rom spline path that passes THROUGH all control points
// with orthogonal exit/entry at source/target
function generateSplinePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  controlPoints: ControlPoint[],
  sourcePosition: Position,
  targetPosition: Position,
  sourceIsAncestor = false,
  targetIsAncestor = false
): PathResult {
  const absPoints = controlPoints.map(cp =>
    localToAbsolute(cp, sourceX, sourceY, targetX, targetY)
  );

  // Calculate tangent offset distance based on edge length
  const edgeLength = Math.hypot(targetX - sourceX, targetY - sourceY);
  const tangentOffset = Math.min(50, edgeLength * 0.25);

  // Get orthogonal directions
  const sourceDir = getPositionDirection(sourcePosition);
  const targetDir = getPositionDirection(targetPosition);

  // For ancestor endpoints, INVERT the direction (curve goes inward)
  // For descendant/normal endpoints, use normal direction (curve goes outward)
  const effectiveSourceDir = sourceIsAncestor
    ? { x: -sourceDir.x, y: -sourceDir.y }
    : sourceDir;
  const effectiveTargetDir = targetIsAncestor
    ? { x: -targetDir.x, y: -targetDir.y }
    : targetDir;

  const phantomSource = {
    x: sourceX - effectiveSourceDir.x * tangentOffset,
    y: sourceY - effectiveSourceDir.y * tangentOffset,
  };
  const phantomTarget = {
    x: targetX - effectiveTargetDir.x * tangentOffset,
    y: targetY - effectiveTargetDir.y * tangentOffset,
  };
  const cp1Dir = effectiveSourceDir;
  const cp2Dir = effectiveTargetDir;

  const allPoints = [
    { x: sourceX, y: sourceY },
    ...absPoints,
    { x: targetX, y: targetY },
  ];

  if (allPoints.length === 2) {
    // No control points - use cubic bezier with tangents
    const cp1x = sourceX + cp1Dir.x * tangentOffset;
    const cp1y = sourceY + cp1Dir.y * tangentOffset;
    const cp2x = targetX + cp2Dir.x * tangentOffset;
    const cp2y = targetY + cp2Dir.y * tangentOffset;
    const seg = {
      p0: { x: sourceX, y: sourceY },
      p1: { x: cp1x, y: cp1y },
      p2: { x: cp2x, y: cp2y },
      p3: { x: targetX, y: targetY },
    };
    return {
      path: `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`,
      lastSegment: seg,
      segments: [seg],
    };
  }

  // Catmull-Rom spline with phantom points for tangents
  let path = `M ${allPoints[0].x} ${allPoints[0].y}`;
  const allSegments: BezierSegment[] = [];
  let lastSegP0 = allPoints[0];
  let lastSegCP1 = { x: 0, y: 0 };
  let lastSegCP2 = { x: 0, y: 0 };
  let lastSegEnd = allPoints[0];

  for (let i = 0; i < allPoints.length - 1; i++) {
    let p0, p3;
    const p1 = allPoints[i];
    const p2 = allPoints[i + 1];

    if (i === 0) {
      p0 = phantomSource;
    } else {
      p0 = allPoints[i - 1];
    }

    if (i === allPoints.length - 2) {
      p3 = phantomTarget;
    } else {
      p3 = allPoints[i + 2];
    }

    const tension = 1 / 6;

    let cp1x = p1.x + (p2.x - p0.x) * tension;
    let cp1y = p1.y + (p2.y - p0.y) * tension;
    let cp2x = p2.x - (p3.x - p1.x) * tension;
    let cp2y = p2.y - (p3.y - p1.y) * tension;

    // Force endpoint tangents to be normal to node surface (same as no-control-point case)
    if (i === 0) {
      cp1x = sourceX + cp1Dir.x * tangentOffset;
      cp1y = sourceY + cp1Dir.y * tangentOffset;
    }
    if (i === allPoints.length - 2) {
      cp2x = targetX + cp2Dir.x * tangentOffset;
      cp2y = targetY + cp2Dir.y * tangentOffset;
    }

    lastSegP0 = p1;
    lastSegCP1 = { x: cp1x, y: cp1y };
    lastSegCP2 = { x: cp2x, y: cp2y };
    lastSegEnd = p2;

    allSegments.push({ p0: p1, p1: { x: cp1x, y: cp1y }, p2: { x: cp2x, y: cp2y }, p3: p2 });

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return {
    path,
    lastSegment: { p0: lastSegP0, p1: lastSegCP1, p2: lastSegCP2, p3: lastSegEnd },
    segments: allSegments,
  };
}

// Helper to get flow coordinates from screen coordinates
function screenToFlow(
  clientX: number,
  clientY: number,
  transform: { x: number; y: number; zoom: number },
  container: Element
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  return {
    x: (clientX - rect.left - transform.x) / transform.zoom,
    y: (clientY - rect.top - transform.y) / transform.zoom,
  };
}

const SplineEdge: React.FC<EdgeProps<SplineEdgeData>> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  selected,
  data,
}) => {
  const setEdges = useSetEdges();
  const showLabels = useLabelsVisible();
  const transform = useStore((state) => ({ x: state.transform[0], y: state.transform[1], zoom: state.transform[2] }));

  // No counter-scaling needed - viewport is locked at zoom=1 and edges are at screen coordinates
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [draggingLabel, setDraggingLabel] = useState(false);
  const dragDataRef = useRef({
    sourceX,
    sourceY,
    targetX,
    targetY,
    edgeId: id
  });

  // Check for self-loop
  const isSelfLoop = source === target;

  const controlPoints: ControlPoint[] = data?.controlPoints || [];

  // Get ancestor relationship info from edge data
  const sourceIsAncestor = data?.sourceIsAncestor ?? false;
  const targetIsAncestor = data?.targetIsAncestor ?? false;
  const isAncestorDescendant = sourceIsAncestor || targetIsAncestor;

  // Offset for edge endpoints (0 = at the node border)
  const edgeOffset = 0;

  // Calculate adjusted positions based on ancestor relationship
  // Rule: Ancestor endpoint is INSIDE, descendant/other endpoint is OUTSIDE
  let adjustedSourceX = sourceX;
  let adjustedSourceY = sourceY;
  let adjustedTargetX = targetX;
  let adjustedTargetY = targetY;

  const sourceDir = getPositionDirection(sourcePosition);
  const targetDir = getPositionDirection(targetPosition);

  if (sourceIsAncestor) {
    // Source is ancestor: offset source INWARD (opposite to handle direction)
    adjustedSourceX = sourceX - sourceDir.x * edgeOffset;
    adjustedSourceY = sourceY - sourceDir.y * edgeOffset;
    // Target is descendant: offset target OUTWARD (same as handle direction)
    adjustedTargetX = targetX + targetDir.x * edgeOffset;
    adjustedTargetY = targetY + targetDir.y * edgeOffset;
  } else if (targetIsAncestor) {
    // Source is descendant: offset source OUTWARD (same as handle direction)
    adjustedSourceX = sourceX + sourceDir.x * edgeOffset;
    adjustedSourceY = sourceY + sourceDir.y * edgeOffset;
    // Target is ancestor: offset target INWARD (opposite to handle direction)
    adjustedTargetX = targetX - targetDir.x * edgeOffset;
    adjustedTargetY = targetY - targetDir.y * edgeOffset;
  } else {
    // Normal edge (siblings/unrelated): both endpoints OUTSIDE
    adjustedSourceX = sourceX + sourceDir.x * edgeOffset;
    adjustedSourceY = sourceY + sourceDir.y * edgeOffset;
    adjustedTargetX = targetX + targetDir.x * edgeOffset;
    adjustedTargetY = targetY + targetDir.y * edgeOffset;
  }

  // Keep ref updated with latest positions (use adjusted positions for control point dragging)
  useEffect(() => {
    dragDataRef.current = {
      sourceX: adjustedSourceX,
      sourceY: adjustedSourceY,
      targetX: adjustedTargetX,
      targetY: adjustedTargetY,
      edgeId: id
    };
  }, [adjustedSourceX, adjustedSourceY, adjustedTargetX, adjustedTargetY, id]);

  // Generate appropriate path based on edge type
  let pathResult: PathResult;
  if (isSelfLoop) {
    pathResult = generateSelfLoopPath(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition);
  } else {
    pathResult = generateSplinePath(
      adjustedSourceX, adjustedSourceY, adjustedTargetX, adjustedTargetY,
      controlPoints, sourcePosition, targetPosition,
      sourceIsAncestor, targetIsAncestor
    );
  }
  const pathD = pathResult.path;

  // Keep segments ref for label dragging
  const segmentsRef = useRef(pathResult.segments);
  segmentsRef.current = pathResult.segments;

  const absoluteControlPoints = isSelfLoop ? [] : controlPoints.map(cp =>
    localToAbsolute(cp, adjustedSourceX, adjustedSourceY, adjustedTargetX, adjustedTargetY)
  );

  // Handle double-click to add a new control point (disabled for self-loops)
  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    if (isSelfLoop) return;

    event.stopPropagation();
    event.preventDefault();

    const container = document.querySelector('.react-flow');
    if (!container) return;

    const flowPos = screenToFlow(event.clientX, event.clientY, transform, container);
    const newPoint = absoluteToLocal(flowPos.x, flowPos.y, adjustedSourceX, adjustedSourceY, adjustedTargetX, adjustedTargetY);

    let insertIndex = 0;
    for (let i = 0; i < controlPoints.length; i++) {
      if (controlPoints[i].x < newPoint.x) {
        insertIndex = i + 1;
      }
    }

    const newControlPoints = [...controlPoints];
    newControlPoints.splice(insertIndex, 0, newPoint);

    setEdges(edges => edges.map(edge => {
      if (edge.id === id) {
        return {
          ...edge,
          data: { ...edge.data, controlPoints: newControlPoints },
        };
      }
      return edge;
    }));
  }, [id, adjustedSourceX, adjustedSourceY, adjustedTargetX, adjustedTargetY, controlPoints, setEdges, transform, isSelfLoop]);

  // Mouse move handler for dragging
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    if (draggingIndex === null) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const container = document.querySelector('.react-flow');
      if (!container) return;

      const flowPos = screenToFlow(moveEvent.clientX, moveEvent.clientY, transformRef.current, container);
      const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, edgeId } = dragDataRef.current;
      const newLocalPoint = absoluteToLocal(flowPos.x, flowPos.y, sx, sy, tx, ty);

      setEdges(edges => edges.map(edge => {
        if (edge.id === edgeId) {
          const newControlPoints = [...(edge.data?.controlPoints || [])];
          newControlPoints[draggingIndex] = newLocalPoint;
          return {
            ...edge,
            data: { ...edge.data, controlPoints: newControlPoints },
          };
        }
        return edge;
      }));
    };

    const handleMouseUp = () => {
      setDraggingIndex(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingIndex, setEdges]);

  const handleControlPointMouseDown = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setDraggingIndex(index);
  }, []);

  const handleControlPointContextMenu = useCallback((index: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setEdges(edges => edges.map(edge => {
      if (edge.id === id) {
        const newControlPoints = [...(edge.data?.controlPoints || [])];
        newControlPoints.splice(index, 1);
        return {
          ...edge,
          data: { ...edge.data, controlPoints: newControlPoints },
        };
      }
      return edge;
    }));
  }, [id, setEdges]);

  // Label dragging along the edge
  const handleLabelMouseDown = useCallback((event: React.MouseEvent) => {
    if (!selected) return;
    event.stopPropagation();
    event.preventDefault();
    setDraggingLabel(true);
  }, [selected]);

  useEffect(() => {
    if (!draggingLabel) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const container = document.querySelector('.react-flow');
      if (!container) return;

      const flowPos = screenToFlow(moveEvent.clientX, moveEvent.clientY, transformRef.current, container);
      const newT = closestTOnPath(segmentsRef.current, flowPos.x, flowPos.y);

      setEdges(edges => edges.map(edge => {
        if (edge.id === id) {
          return {
            ...edge,
            data: { ...edge.data, labelPosition: Math.max(0.05, Math.min(0.95, newT)) },
          };
        }
        return edge;
      }));
    };

    const handleMouseUp = () => {
      setDraggingLabel(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingLabel, id, setEdges]);

  // Calculate label position along the actual edge path
  const labelT = data?.labelPosition ?? 0.33;
  const labelPoint = evalPointOnPath(pathResult.segments, labelT);
  let labelX = labelPoint.x;
  let labelY = labelPoint.y;
  if (isSelfLoop) {
    // Position label at the apex of the bow
    const sourceDir = getPositionDirection(sourcePosition);
    const targetDir = getPositionDirection(targetPosition);
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    // Offset toward the average of both directions
    labelX = midX + (sourceDir.x + targetDir.x) * 30;
    labelY = midY + (sourceDir.y + targetDir.y) * 30;
  }

  // Get guard text to display
  const guardText = data?.guard?.trim() || undefined;

  // Fixed visual sizes in screen pixels
  const strokeWidth = selected ? 2.5 : 1.5;
  const hitAreaWidth = 20;
  const controlPointRadius = 8;
  const controlPointStrokeWidth = 2;
  const labelFontSize = 12;
  const arrowLength = 15; // Length of the MetaPost-style curved arrowhead
  const arrowGap = 6; // Gap between arrow tip and node edge
  const arrowAngleRad = 15 * Math.PI / 180; // 15 degrees rotation for arrowhead curves

  // Two-step de Casteljau across ALL segments: first truncate the gap, then extract the arrow.
  // Uses arc-length binary search and works across multi-segment splines (control points).
  const allSegments = pathResult.segments;
  const segLengths = allSegments.map(s => approxBezierLength(s.p0, s.p1, s.p2, s.p3));
  const totalPathLength = segLengths.reduce((a, b) => a + b, 0);

  // Scale down arrow dimensions when the TOTAL path is too short
  const totalArrowSpace = arrowGap + arrowLength;
  let effectiveGap = arrowGap;
  let effectiveArrowLen = arrowLength;
  if (totalPathLength < totalArrowSpace * 1.5) {
    const scale = Math.max(0, totalPathLength / (totalArrowSpace * 1.5));
    effectiveGap = arrowGap * scale;
    effectiveArrowLen = arrowLength * scale;
  }

  // Step 1: Split full path at effectiveGap from end (removes the gap near target node)
  const gapSplitResult = splitMultiSegFromEnd(allSegments, effectiveGap);

  // Step 2: From the path-before-gap, extract the arrow portion from its end
  const arrowSplitResult = splitMultiSegFromEnd(gapSplitResult.before, effectiveArrowLen);
  const visibleSegments = arrowSplitResult.before;  // path up to arrowhead base
  const arrowSegments = arrowSplitResult.after;      // arrowhead sub-curve(s)

  // Build visible path SVG string from segments
  let visiblePathD: string;
  if (visibleSegments.length > 0) {
    visiblePathD = `M ${visibleSegments[0].p0.x} ${visibleSegments[0].p0.y}`;
    for (const seg of visibleSegments) {
      visiblePathD += ` C ${seg.p1.x} ${seg.p1.y}, ${seg.p2.x} ${seg.p2.y}, ${seg.p3.x} ${seg.p3.y}`;
    }
  } else {
    // Arrow consumes entire path; visible path is just the start point
    const startPt = arrowSegments.length > 0 ? arrowSegments[0].p0 : allSegments[0].p0;
    visiblePathD = `M ${startPt.x} ${startPt.y}`;
  }

  // Arrow tip is the last point of the arrow segments (= start of the gap)
  const tip = arrowSegments.length > 0
    ? arrowSegments[arrowSegments.length - 1].p3
    : (gapSplitResult.before.length > 0
      ? gapSplitResult.before[gapSplitResult.before.length - 1].p3
      : allSegments[allSegments.length - 1].p3);

  // MetaPost-style arrowhead: rotate all arrow segments ±15° around the tip.
  // CW path goes forward (base → tip), CCW path goes backward (tip → base), then close.
  let arrowPath = '';
  if (arrowSegments.length > 0) {
    // CW forward: base → tip
    const cwFirst = rotatePoint(arrowSegments[0].p0, tip, arrowAngleRad);
    arrowPath = `M ${cwFirst.x} ${cwFirst.y}`;
    for (const seg of arrowSegments) {
      const cp1 = rotatePoint(seg.p1, tip, arrowAngleRad);
      const cp2 = rotatePoint(seg.p2, tip, arrowAngleRad);
      const end = rotatePoint(seg.p3, tip, arrowAngleRad);
      arrowPath += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
    }
    // CCW reverse: tip → base (traverse segments backwards, reversing each curve)
    for (let i = arrowSegments.length - 1; i >= 0; i--) {
      const seg = arrowSegments[i];
      // Reversed bezier (p3→p0): control points swap to p2, p1
      const rcp1 = rotatePoint(seg.p2, tip, -arrowAngleRad);
      const rcp2 = rotatePoint(seg.p1, tip, -arrowAngleRad);
      const rend = rotatePoint(seg.p0, tip, -arrowAngleRad);
      arrowPath += ` C ${rcp1.x} ${rcp1.y}, ${rcp2.x} ${rcp2.y}, ${rend.x} ${rend.y}`;
    }
    arrowPath += ' Z';
  }

  return (
    <g>
      {/* Invisible wider path for easier clicking (uses full path to node edge) */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={hitAreaWidth}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: 'pointer' }}
      />

      {/* Visible edge path (truncated before the arrowhead) */}
      <path
        d={visiblePathD}
        fill="none"
        stroke={selected ? '#1976d2' : (data?.warning ? '#e65100' : '#b1b1b7')}
        strokeWidth={strokeWidth}
      />

      {/* Custom arrowhead */}
      <path
        d={arrowPath}
        fill={selected ? '#1976d2' : (data?.warning ? '#e65100' : '#b1b1b7')}
        stroke="none"
      />

      {/* Control point handles (only shown when selected, not for self-loops) */}
      {selected && !isSelfLoop && absoluteControlPoints.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={controlPointRadius}
          fill={draggingIndex === index ? '#1976d2' : '#fff'}
          stroke="#1976d2"
          strokeWidth={controlPointStrokeWidth}
          style={{ cursor: draggingIndex === index ? 'grabbing' : 'grab', pointerEvents: 'all' }}
          onMouseDown={(e) => handleControlPointMouseDown(index, e)}
          onContextMenu={(e) => handleControlPointContextMenu(index, e)}
        />
      ))}

      {/* Background filter for label readability */}
      <defs>
        <filter id={`label-bg-${id}`} x="-0.05" y="-0.05" width="1.1" height="1.1">
          <feFlood floodColor="white" floodOpacity="0.5" result="bg" />
          <feMerge>
            <feMergeNode in="bg" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Transition labels (guard + label), draggable along edge when selected */}
      {showLabels && (guardText || data?.label) && (
        <g
          onMouseDown={handleLabelMouseDown}
          filter={`url(#label-bg-${id})`}
          style={{
            cursor: selected ? (draggingLabel ? 'grabbing' : 'grab') : 'default',
            pointerEvents: (guardText || data?.label) ? 'all' : 'none',
          }}
        >
          {guardText && (
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              style={{
                fontSize: labelFontSize,
                fill: data?.warning && !selected ? '#e65100' : '#666',
                fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
              }}
            >
              [{guardText}]
            </text>
          )}
          {data?.label && (
            <text
              x={labelX}
              y={labelY + (guardText ? 14 : 0)}
              textAnchor="middle"
              style={{
                fontSize: labelFontSize,
                fill: data?.warning && !selected ? '#e65100' : '#333',
              }}
            >
              {data.label}
            </text>
          )}
        </g>
      )}
    </g>
  );
};

export default SplineEdge;
