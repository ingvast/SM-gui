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
}

interface StateNodeProps {
  data: StateNodeData;
  selected: boolean;
  isParent?: boolean;
}

export default memo(({ data, selected, isParent }: StateNodeProps) => {
  const depth = data.depth || 0;
  const scaleFactor = data.scaleFactor || 0.85;

  // Calculate cumulative scale based on depth
  const scale = Math.pow(scaleFactor, depth);

  // Base values that will be scaled
  const baseFontSize = 14;
  const baseBorderWidth = 1;
  const baseSourceHandleSize = 12;
  const baseTargetHandleSize = 10;
  const baseLabelMargin = 5;

  // Scaled values
  const fontSize = baseFontSize * scale;
  const borderWidth = Math.max(1, baseBorderWidth * scale);
  const sourceHandleSize = Math.max(6, baseSourceHandleSize * scale);
  const targetHandleSize = Math.max(5, baseTargetHandleSize * scale);
  const labelMargin = baseLabelMargin * scale;

  const nodeStyle: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    borderWidth: `${borderWidth}px`,
    borderStyle: isParent ? 'dashed' : 'solid',
    borderColor: isParent ? '#666' : '#1a192b',
    borderRadius: `${5 * scale}px`,
    backgroundColor: isParent ? '#f9f9f9' : 'white',
    width: '100%',
    height: '100%',
  };

  const labelStyle: React.CSSProperties = {
    textAlign: 'center',
    marginTop: `${labelMargin}px`,
  };

  const sourceHandleStyle: React.CSSProperties = {
    width: `${sourceHandleSize}px`,
    height: `${sourceHandleSize}px`,
    backgroundColor: '#007bff',
    borderRadius: '50%',
    border: `${Math.max(1, scale)}px solid white`,
  };

  const targetHandleStyle: React.CSSProperties = {
    width: `${targetHandleSize}px`,
    height: `${targetHandleSize}px`,
    backgroundColor: '#28a745',
    borderRadius: '50%',
    border: `${Math.max(1, scale)}px solid white`,
  };

  return (
    <div className="state-node" style={nodeStyle}>
      <NodeResizer isVisible={selected} />

      {/* Top Handles */}
      <Handle type="source" position={Position.Top} id="top-source" style={{ ...sourceHandleStyle, left: '25%' }} />
      <Handle type="target" position={Position.Top} id="top-target" style={{ ...targetHandleStyle, left: '75%' }} />

      {/* Right Handles */}
      <Handle type="source" position={Position.Right} id="right-source" style={{ ...sourceHandleStyle, top: '25%' }} />
      <Handle type="target" position={Position.Right} id="right-target" style={{ ...targetHandleStyle, top: '75%' }} />

      {/* Bottom Handles */}
      <Handle type="source" position={Position.Bottom} id="bottom-source" style={{ ...sourceHandleStyle, left: '25%' }} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ ...targetHandleStyle, left: '75%' }} />

      {/* Left Handles */}
      <Handle type="source" position={Position.Left} id="left-source" style={{ ...sourceHandleStyle, top: '25%' }} />
      <Handle type="target" position={Position.Left} id="left-target" style={{ ...targetHandleStyle, top: '75%' }} />

      <div style={labelStyle}>{data.label}</div>
    </div>
  );
});
