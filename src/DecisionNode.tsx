import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';

import '@reactflow/node-resizer/dist/style.css';
import './DecisionNode.css';

interface DecisionNodeData {
  label: string;
  screenWidth?: number;
}

interface DecisionNodeProps {
  data: DecisionNodeData;
  selected: boolean;
}

export default memo(({ selected }: DecisionNodeProps) => {
  return (
    <div className="decision-node">
      <NodeResizer
        isVisible={selected}
        keepAspectRatio={true}
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
    </div>
  );
});
