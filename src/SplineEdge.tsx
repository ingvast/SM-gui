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

interface PathResult {
  path: string;
  // Full control points of the last cubic bezier segment (for exact truncation)
  lastSegment: { p0: Point; p1: Point; p2: Point; p3: Point };
}

// De Casteljau split: returns the first sub-curve [Q0, Q1, Q2, Q3] when splitting at parameter t
function splitBezierAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number) {
  const q0 = p0;
  const q1 = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
  const mid = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  const q2 = { x: q1.x + (mid.x - q1.x) * t, y: q1.y + (mid.y - q1.y) * t };
  const s = { x: p2.x + (p3.x - p2.x) * t, y: p2.y + (p3.y - p2.y) * t };
  const tt = { x: mid.x + (s.x - mid.x) * t, y: mid.y + (s.y - mid.y) * t };
  const q3 = { x: q2.x + (tt.x - q2.x) * t, y: q2.y + (tt.y - q2.y) * t };
  return { q0, q1, q2, q3 };
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

  return {
    path: `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`,
    lastSegment: {
      p0: { x: sourceX, y: sourceY },
      p1: { x: cp1x, y: cp1y },
      p2: { x: cp2x, y: cp2y },
      p3: { x: targetX, y: targetY },
    },
  };
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
    return {
      path: `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`,
      lastSegment: {
        p0: { x: sourceX, y: sourceY },
        p1: { x: cp1x, y: cp1y },
        p2: { x: cp2x, y: cp2y },
        p3: { x: targetX, y: targetY },
      },
    };
  }

  // Catmull-Rom spline with phantom points for tangents
  let path = `M ${allPoints[0].x} ${allPoints[0].y}`;
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

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return {
    path,
    lastSegment: { p0: lastSegP0, p1: lastSegCP1, p2: lastSegCP2, p3: lastSegEnd },
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

  // Calculate label position at 1/3 from source to target
  const labelT = 0.33; // Position along the edge (0 = source, 1 = target)
  let labelX = adjustedSourceX + (adjustedTargetX - adjustedSourceX) * labelT;
  let labelY = adjustedSourceY + (adjustedTargetY - adjustedSourceY) * labelT - 10;
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
  const arrowSize = 10;
  const arrowGap = 6; // Distance from node edge where visible path ends and arrowhead sits

  // Split the last bezier segment to truncate the visible path arrowGap pixels before the endpoint.
  // This preserves the exact curve shape (de Casteljau subdivision).
  const { p0, p1, p2, p3 } = pathResult.lastSegment;
  const speed = 3 * Math.hypot(p3.x - p2.x, p3.y - p2.y); // |B'(1)|
  const tSplit = Math.max(0, 1 - arrowGap / (speed || 1));
  const { q1, q2, q3 } = splitBezierAt(p0, p1, p2, p3, tSplit);

  // The arrowhead sits at the split point, oriented along the tangent there
  const arrowTipX = q3.x;
  const arrowTipY = q3.y;
  const arrowDirX = q3.x - q2.x;
  const arrowDirY = q3.y - q2.y;
  const arrowDirLen = Math.hypot(arrowDirX, arrowDirY) || 1;
  const normDirX = arrowDirX / arrowDirLen;
  const normDirY = arrowDirY / arrowDirLen;

  // Replace the last C segment in the path with the truncated sub-curve
  const lastCIdx = pathD.lastIndexOf('C');
  const visiblePathD = pathD.substring(0, lastCIdx)
    + `C ${q1.x} ${q1.y}, ${q2.x} ${q2.y}, ${q3.x} ${q3.y}`;

  // Arrowhead points
  const arrowAngle = Math.PI / 6; // 30 degrees
  const ax1 = arrowTipX - arrowSize * (normDirX * Math.cos(arrowAngle) - normDirY * Math.sin(arrowAngle));
  const ay1 = arrowTipY - arrowSize * (normDirY * Math.cos(arrowAngle) + normDirX * Math.sin(arrowAngle));
  const ax2 = arrowTipX - arrowSize * (normDirX * Math.cos(arrowAngle) + normDirY * Math.sin(arrowAngle));
  const ay2 = arrowTipY - arrowSize * (normDirY * Math.cos(arrowAngle) - normDirX * Math.sin(arrowAngle));
  const arrowPath = `M ${arrowTipX} ${arrowTipY} L ${ax1} ${ay1} L ${ax2} ${ay2} Z`;

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

      {/* Guard label */}
      {guardText && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          style={{
            fontSize: labelFontSize,
            fill: '#666',
            fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
            pointerEvents: 'none',
          }}
        >
          [{guardText}]
        </text>
      )}

      {/* Custom label */}
      {data?.label && (
        <text
          x={labelX}
          y={labelY + (guardText ? 14 : 0)}
          textAnchor="middle"
          style={{
            fontSize: labelFontSize,
            fill: '#333',
            pointerEvents: 'none',
          }}
        >
          {data.label}
        </text>
      )}
    </g>
  );
};

export default SplineEdge;
