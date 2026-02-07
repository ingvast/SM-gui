import React, { useCallback, useState, useEffect, useRef } from 'react';
import { EdgeProps, useReactFlow, useStore, Position } from 'reactflow';

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

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

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
  const { setEdges } = useReactFlow();
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
  const guardText = data?.guard;

  // Fixed visual sizes in screen pixels
  const strokeWidth = selected ? 2.5 : 1.5;
  const hitAreaWidth = 20;
  const controlPointRadius = 8;
  const controlPointStrokeWidth = 2;
  const labelFontSize = 12;
  const arrowLength = 15; // Length of the MetaPost-style curved arrowhead
  const arrowGap = 6; // Gap between arrow tip and node edge
  const arrowAngleRad = 15 * Math.PI / 180; // 15 degrees rotation for arrowhead curves

  // Two-step de Casteljau: first truncate the gap, then extract the arrow portion.
  const { p0, p1, p2, p3 } = pathResult.lastSegment;
  const speed = 3 * Math.hypot(p3.x - p2.x, p3.y - p2.y); // |B'(1)|

  // Step 1: Truncate the last segment to end arrowGap px before the node edge
  const tGap = Math.max(0, 1 - arrowGap / (speed || 1));
  const gapSplit = splitBezierAt(p0, p1, p2, p3, tGap);
  // gapSplit.q0..q3 is the truncated curve (ends at arrow tip)

  // Step 2: From the truncated curve, extract the last arrowLength px for the arrowhead
  const gapSpeed = 3 * Math.hypot(gapSplit.q3.x - gapSplit.q2.x, gapSplit.q3.y - gapSplit.q2.y);
  const tArrow = Math.max(0, 1 - arrowLength / (gapSpeed || 1));
  const arrowSplit = splitBezierAt(gapSplit.q0, gapSplit.q1, gapSplit.q2, gapSplit.q3, tArrow);

  // Visible path ends where the arrowhead starts
  const lastCIdx = pathD.lastIndexOf('C');
  const visiblePathD = pathD.substring(0, lastCIdx)
    + `C ${arrowSplit.q1.x} ${arrowSplit.q1.y}, ${arrowSplit.q2.x} ${arrowSplit.q2.y}, ${arrowSplit.q3.x} ${arrowSplit.q3.y}`;

  // MetaPost-style arrowhead: take the arrow sub-curve (r0→r3), rotate ±15° around the tip (r3)
  const { r0, r1, r2, r3 } = arrowSplit;
  const tip = r3; // The arrow tip (offset from node edge by arrowGap)

  // Rotate the arrow sub-curve clockwise and counter-clockwise around the tip
  const cwR0 = rotatePoint(r0, tip, arrowAngleRad);
  const cwR1 = rotatePoint(r1, tip, arrowAngleRad);
  const cwR2 = rotatePoint(r2, tip, arrowAngleRad);
  const ccwR0 = rotatePoint(r0, tip, -arrowAngleRad);
  const ccwR1 = rotatePoint(r1, tip, -arrowAngleRad);
  const ccwR2 = rotatePoint(r2, tip, -arrowAngleRad);

  // Build arrowhead: CW curve from back to tip, then CCW curve from tip to back, close
  const arrowPath = `M ${cwR0.x} ${cwR0.y} C ${cwR1.x} ${cwR1.y}, ${cwR2.x} ${cwR2.y}, ${tip.x} ${tip.y} `
    + `C ${ccwR2.x} ${ccwR2.y}, ${ccwR1.x} ${ccwR1.y}, ${ccwR0.x} ${ccwR0.y} Z`;

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
        stroke={selected ? '#1976d2' : '#b1b1b7'}
        strokeWidth={strokeWidth}
      />

      {/* Custom arrowhead */}
      <path
        d={arrowPath}
        fill={selected ? '#1976d2' : '#b1b1b7'}
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
      {(guardText || data?.label) && (
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
                fill: '#666',
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
                fill: '#333',
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
