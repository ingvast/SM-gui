import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';

import '@reactflow/node-resizer/dist/style.css';
import './StateNode.css';

interface StateNodeData {
  label: string;
  history?: boolean;
  entry?: string;
  exit?: string;
  do?: string;
  depth?: number;
  scaleFactor?: number;
  semanticScale?: number;
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
  const labelMargin = 5;
  const borderRadius = 5;

  const nodeStyle: React.CSSProperties = {
    position: 'relative',
    fontSize: `${fontSize}px`,
    borderWidth: `${borderWidth}px`,
    borderStyle: isParent ? 'dashed' : 'solid',
    borderColor: isParent ? '#666' : '#1a192b',
    borderRadius: `${borderRadius}px`,
    backgroundColor: isParent ? '#f9f9f9' : 'white',
    width: '100%',
    height: '100%',
  };

  const labelStyle: React.CSSProperties = {
    textAlign: 'center',
    marginTop: `${labelMargin}px`,
  };

  return (
    <div className="state-node" style={nodeStyle}>
      <NodeResizer isVisible={selected} />

      {/* Invisible ReactFlow Handles for connection logic */}
      <Handle type="source" position={Position.Top} id="top-source" className="invisible-handle" />
      <Handle type="target" position={Position.Top} id="top-target" className="invisible-handle" />
      <Handle type="source" position={Position.Right} id="right-source" className="invisible-handle" />
      <Handle type="target" position={Position.Right} id="right-target" className="invisible-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="invisible-handle" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="invisible-handle" />
      <Handle type="source" position={Position.Left} id="left-source" className="invisible-handle" />
      <Handle type="target" position={Position.Left} id="left-target" className="invisible-handle" />

      <div style={labelStyle}>{data.label}</div>
    </div>
  );
});
