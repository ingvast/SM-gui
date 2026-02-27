import React from 'react';
import { Handle, Position } from 'reactflow';

interface InitialMarkerProps {
  data: {
    size: number;
  };
}

const InitialMarker: React.FC<InitialMarkerProps> = ({ data }) => {
  const size = data.size || 10;
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#333',
        position: 'relative',
        cursor: 'move',
        boxShadow: hovered ? '0 0 0 4px rgba(59, 130, 246, 0.8), 0 0 16px 8px rgba(59, 130, 246, 0.6)' : 'none',
        transition: 'box-shadow 0.15s ease',
      }}
    >
      {/* Source handles on all sides for the arrow to the initial state */}
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        style={{ opacity: 0, width: 1, height: 1 }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        style={{ opacity: 0, width: 1, height: 1 }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        style={{ opacity: 0, width: 1, height: 1 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        style={{ opacity: 0, width: 1, height: 1 }}
      />
    </div>
  );
};

export default InitialMarker;
