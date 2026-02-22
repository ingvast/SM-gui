import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import './ProxyNode.css';

interface ProxyNodeData {
  name: string;
  label: string;
  targetId: string;
  targetPath: string;
  broken?: boolean;
  screenWidth?: number;
  screenHeight?: number;
}

interface ProxyNodeProps {
  data: ProxyNodeData;
  selected: boolean;
}

export default memo(({ data }: ProxyNodeProps) => {
  return (
    <div className={`proxy-node${data.broken ? ' broken' : ''}`}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.broken ? `⚠ ${data.targetPath}` : `→ ${data.label}`}
      </span>

      {/* Only target handles — proxy nodes cannot be source of transitions */}
      <Handle type="target" position={Position.Top} id="top-target" className="invisible-handle" />
      <Handle type="target" position={Position.Right} id="right-target" className="invisible-handle" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="invisible-handle" />
      <Handle type="target" position={Position.Left} id="left-target" className="invisible-handle" />
    </div>
  );
});
