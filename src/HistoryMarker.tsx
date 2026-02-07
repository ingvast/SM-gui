import React, { memo } from 'react';
import { NodeResizer } from '@reactflow/node-resizer';

interface HistoryMarkerProps {
  data: {
    size: number;
  };
  selected: boolean;
}

const HistoryMarker: React.FC<HistoryMarkerProps> = memo(({ data, selected }) => {
  const size = data.size || 20;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
      }}
    >
      <NodeResizer
        isVisible={selected}
        keepAspectRatio={true}
        minWidth={10}
        minHeight={10}
      />
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={{ display: 'block' }}
      >
        <circle
          cx="12"
          cy="12"
          r="11"
          stroke="#333"
          fill="white"
          strokeWidth="1.5"
        />
        {/* Drawn H: two vertical bars + horizontal bar */}
        <line x1="7" y1="6" x2="7" y2="18" stroke="#333" strokeWidth="1.5" />
        <line x1="17" y1="6" x2="17" y2="18" stroke="#333" strokeWidth="1.5" />
        <line x1="7" y1="12" x2="17" y2="12" stroke="#333" strokeWidth="1.5" />
      </svg>
    </div>
  );
});

export default HistoryMarker;
