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

// Generate a Catmull-Rom spline path that passes THROUGH all control points
// with orthogonal exit/entry at source/target
function generateSplinePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  controlPoints: ControlPoint[],
  sourcePosition: Position,
  targetPosition: Position
): string {
  const absPoints = controlPoints.map(cp =>
    localToAbsolute(cp, sourceX, sourceY, targetX, targetY)
  );

  // Calculate tangent offset distance based on edge length
  const edgeLength = Math.hypot(targetX - sourceX, targetY - sourceY);
  const tangentOffset = Math.min(50, edgeLength * 0.25);

  // Get orthogonal directions
  const sourceDir = getPositionDirection(sourcePosition);
  const targetDir = getPositionDirection(targetPosition);

  // Create phantom points for orthogonal tangents at source and target
  // These points are "before" source and "after" target for Catmull-Rom calculation
  const phantomSource = {
    x: sourceX - sourceDir.x * tangentOffset,
    y: sourceY - sourceDir.y * tangentOffset,
  };
  const phantomTarget = {
    x: targetX - targetDir.x * tangentOffset,
    y: targetY - targetDir.y * tangentOffset,
  };

  const allPoints = [
    { x: sourceX, y: sourceY },
    ...absPoints,
    { x: targetX, y: targetY },
  ];

  if (allPoints.length === 2) {
    // No control points - use cubic bezier with orthogonal tangents
    const cp1x = sourceX + sourceDir.x * tangentOffset;
    const cp1y = sourceY + sourceDir.y * tangentOffset;
    const cp2x = targetX + targetDir.x * tangentOffset;
    const cp2y = targetY + targetDir.y * tangentOffset;
    return `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;
  }

  // Catmull-Rom spline with phantom points for orthogonal tangents
  let path = `M ${allPoints[0].x} ${allPoints[0].y}`;

  for (let i = 0; i < allPoints.length - 1; i++) {
    // Get 4 points for Catmull-Rom segment
    // Use phantom points at the ends for orthogonal tangents
    let p0, p3;
    const p1 = allPoints[i];
    const p2 = allPoints[i + 1];

    if (i === 0) {
      p0 = phantomSource; // Phantom point before source
    } else {
      p0 = allPoints[i - 1];
    }

    if (i === allPoints.length - 2) {
      p3 = phantomTarget; // Phantom point after target
    } else {
      p3 = allPoints[i + 2];
    }

    // Catmull-Rom to Cubic Bezier conversion
    const tension = 1 / 6;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
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
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  data,
}) => {
  const { setEdges } = useReactFlow();
  const transform = useStore((state) => ({ x: state.transform[0], y: state.transform[1], zoom: state.transform[2] }));
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragDataRef = useRef({
    sourceX,
    sourceY,
    targetX,
    targetY,
    edgeId: id
  });

  // Keep ref updated with latest positions
  useEffect(() => {
    dragDataRef.current = {
      sourceX,
      sourceY,
      targetX,
      targetY,
      edgeId: id
    };
  }, [sourceX, sourceY, targetX, targetY, id]);

  const controlPoints: ControlPoint[] = data?.controlPoints || [];
  const pathD = generateSplinePath(sourceX, sourceY, targetX, targetY, controlPoints, sourcePosition, targetPosition);
  const absoluteControlPoints = controlPoints.map(cp =>
    localToAbsolute(cp, sourceX, sourceY, targetX, targetY)
  );

  // Handle double-click to add a new control point
  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();

    const container = document.querySelector('.react-flow');
    if (!container) return;

    const flowPos = screenToFlow(event.clientX, event.clientY, transform, container);
    const newPoint = absoluteToLocal(flowPos.x, flowPos.y, sourceX, sourceY, targetX, targetY);

    // Find insertion position based on x coordinate
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
  }, [id, sourceX, sourceY, targetX, targetY, controlPoints, setEdges, transform]);

  // Mouse move handler for dragging - store transform in ref for use in event handler
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

  // Handle control point drag start
  const handleControlPointMouseDown = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setDraggingIndex(index);
  }, []);

  // Handle right-click to remove control point
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

  return (
    <g>
      {/* Invisible wider path for easier clicking/double-clicking */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: 'pointer' }}
      />

      {/* Visible edge path */}
      <path
        d={pathD}
        fill="none"
        stroke={selected ? '#1976d2' : '#b1b1b7'}
        strokeWidth={selected ? 2 : 1.5}
        markerEnd={markerEnd}
        style={style}
        className="react-flow__edge-path"
      />

      {/* Control point handles (only shown when selected) */}
      {selected && absoluteControlPoints.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={8}
          fill={draggingIndex === index ? '#1976d2' : '#fff'}
          stroke="#1976d2"
          strokeWidth={2}
          style={{ cursor: draggingIndex === index ? 'grabbing' : 'grab', pointerEvents: 'all' }}
          onMouseDown={(e) => handleControlPointMouseDown(index, e)}
          onContextMenu={(e) => handleControlPointContextMenu(index, e)}
        />
      ))}

      {/* Label */}
      {data?.label && (
        <text
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2 - 10}
          textAnchor="middle"
          style={{
            fontSize: 12,
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
