import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';

import '@reactflow/node-resizer/dist/style.css';
import './StateNode.css';

export default memo(({ data, selected, isParent }) => {
  return (
    <div className={`state-node ${isParent ? 'is-parent' : ''}`}>
      <NodeResizer isVisible={selected} />

      {/* Top Handles */}
      <Handle type="source" position={Position.Top} id="top-source" style={{ left: '25%' }} />
      <Handle type="target" position={Position.Top} id="top-target" style={{ left: '75%' }} />

      {/* Right Handles */}
      <Handle type="source" position={Position.Right} id="right-source" style={{ top: '25%' }} />
      <Handle type="target" position={Position.Right} id="right-target" style={{ top: '75%' }} />

      {/* Bottom Handles */}
      <Handle type="source" position={Position.Bottom} id="bottom-source" style={{ left: '25%' }} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={{ left: '75%' }} />

      {/* Left Handles */}
      <Handle type="source" position={Position.Left} id="left-source" style={{ top: '25%' }} />
      <Handle type="target" position={Position.Left} id="left-target" style={{ top: '75%' }} />
      
      <div className="label">{data.label}</div>
    </div>
  );
});
