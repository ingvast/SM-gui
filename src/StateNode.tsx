import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';

import '@reactflow/node-resizer/dist/style.css';
import './StateNode.css';

interface StateNodeData {
  label: string;
  history?: boolean;
  orthogonal?: boolean;
  entry?: string;
  exit?: string;
  do?: string;
  depth?: number;
  scaleFactor?: number;
  semanticScale?: number;
  screenWidth?: number;  // Current rendered width in pixels
  minWidth?: number;     // Minimum width to contain children (screen pixels)
  minHeight?: number;    // Minimum height to contain children (screen pixels)
}

interface StateNodeProps {
  data: StateNodeData;
  selected: boolean;
  isParent?: boolean;
}

export default memo(({ data, selected, isParent }: StateNodeProps) => {
  // Fixed screen-pixel sizes (no counter-scaling needed since viewport zoom is 1
  // and nodes are already rendered at their screen size)
  const fontSize = 14;
  const borderWidth = 1;
  const labelMargin = -3;
  const borderRadius = 5;

  const isOrthogonal = data.orthogonal;

  // Hide label if it would be wider than the state box
  // Approximate label width: ~0.6 * fontSize per character (for typical fonts)
  const estimatedLabelWidth = data.label.length * fontSize * 0.6;
  const showLabel = !data.screenWidth || estimatedLabelWidth < data.screenWidth;

  const nodeStyle: React.CSSProperties = {
    position: 'relative',
    fontSize: `${fontSize}px`,
    borderWidth: isOrthogonal ? '2px' : `${borderWidth}px`,
    borderStyle: isOrthogonal ? 'dashed' : (isParent ? 'dashed' : 'solid'),
    borderColor: isOrthogonal ? '#0066cc' : (isParent ? '#666' : '#1a192b'),
    borderRadius: `${borderRadius}px`,
    backgroundColor: isOrthogonal ? 'rgba(240, 248, 255, 0.9)' : (isParent ? 'rgba(249, 249, 249, 0.85)' : 'rgba(255, 255, 255, 0.85)'),
    width: '100%',
    height: '100%',
  };

  const labelStyle: React.CSSProperties = {
    textAlign: 'center',
    marginTop: `${labelMargin}px`,
  };

  return (
    <div className="state-node" style={nodeStyle}>
      <NodeResizer
        isVisible={selected}
        minWidth={data.minWidth}
        minHeight={data.minHeight}
      />

      {/* Invisible ReactFlow Handles for connection logic */}
      <Handle type="source" position={Position.Top} id="top-source" className="invisible-handle" />
      <Handle type="target" position={Position.Top} id="top-target" className="invisible-handle" />
      <Handle type="source" position={Position.Right} id="right-source" className="invisible-handle" />
      <Handle type="target" position={Position.Right} id="right-target" className="invisible-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="invisible-handle" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="invisible-handle" />
      <Handle type="source" position={Position.Left} id="left-source" className="invisible-handle" />
      <Handle type="target" position={Position.Left} id="left-target" className="invisible-handle" />

      {showLabel && <div style={labelStyle}>{data.label}</div>}
    </div>
  );
});
