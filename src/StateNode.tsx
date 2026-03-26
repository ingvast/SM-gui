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
  annotation?: string;
  showAnnotation?: boolean;
  showEntry?: boolean;
  showDo?: boolean;
  showExit?: boolean;
  historyMarkerPos?: { x: number; y: number };
  historyMarkerSize?: number;
  depth?: number;
  scaleFactor?: number;
  semanticScale?: number;
  screenWidth?: number;  // Current rendered width in pixels
  screenHeight?: number; // Current rendered height in pixels
  minWidth?: number;     // Minimum width to contain children (screen pixels)
  minHeight?: number;    // Minimum height to contain children (screen pixels)
  hasProxy?: boolean;    // True if at least one proxy node points to this state
  isCompound?: boolean;  // True if this state has child states/decisions
  isActive?: boolean;           // View mode: this state is an active leaf
  isAncestorActive?: boolean;   // View mode: this state is an ancestor of an active leaf
  activeTimerMs?: number;       // View mode: ms since this state became active
}

interface StateNodeProps {
  data: StateNodeData;
  selected: boolean;
}

export default memo(({ data, selected }: StateNodeProps) => {
  const isCompound = data.isCompound;
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

  const sectionFontSize = fontSize - 2; // 12px
  const charWidth = sectionFontSize * 0.6; // approx width per monospace char
  const lineHeight = sectionFontSize * 1.3;
  const availableWidth = (data.screenWidth || 999) - 16; // 8px padding each side
  const labelAreaHeight = showLabel ? fontSize + 4 : 4; // label + some margin
  const availableHeight = (data.screenHeight || 999) - labelAreaHeight - 4;

  // Check if ALL lines of a text are wider than available width
  const allLinesTooWide = (text: string): boolean => {
    const lines = text.split('\n');
    return lines.every(line => line.length * charWidth > availableWidth);
  };

  // Build candidate sections in order: annotation, entry, do, exit
  type Section = {
    key: string;
    text: string;
    textAlign: 'left' | 'center' | 'right';
    fontFamily: string;
    fontStyle?: string;
    whiteSpace: string;
    removePriority: number; // lower = removed first (do=1, exit=2, entry=3)
  };
  const candidates: Section[] = [];

  if (data.showAnnotation && data.annotation) {
    candidates.push({
      key: 'annotation', text: data.annotation, textAlign: 'center',
      fontFamily: 'inherit', fontStyle: 'italic',
      whiteSpace: 'pre-wrap', removePriority: 999, // never removed
    });
  }
  if (data.showEntry && data.entry) {
    candidates.push({
      key: 'entry', text: data.entry, textAlign: 'left',
      fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
      whiteSpace: 'pre', removePriority: 3,
    });
  }
  if (data.showDo && data.do) {
    candidates.push({
      key: 'do', text: data.do, textAlign: 'center',
      fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
      whiteSpace: 'pre', removePriority: 1,
    });
  }
  if (data.showExit && data.exit) {
    candidates.push({
      key: 'exit', text: data.exit, textAlign: 'right',
      fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
      whiteSpace: 'pre', removePriority: 2,
    });
  }

  // Filter out code sections where ALL lines are wider than available width
  let sections = candidates.filter(s => {
    if (s.key === 'annotation') return true; // annotation wraps, don't filter
    return !allLinesTooWide(s.text);
  });

  // Progressive removal if total height exceeds available space
  // Each section needs ~lineHeight per line; estimate total
  const estimateSectionHeight = (s: Section) => s.text.split('\n').length * lineHeight;
  const calcTotalHeight = (secs: Section[]) => secs.reduce((h, s) => h + estimateSectionHeight(s), 0);

  while (sections.length > 0 && calcTotalHeight(sections) > availableHeight) {
    // Find section with lowest removePriority (exclude annotation which has 999)
    const removable = sections.filter(s => s.removePriority < 999);
    if (removable.length === 0) break;
    const toRemove = removable.reduce((a, b) => a.removePriority < b.removePriority ? a : b);
    sections = sections.filter(s => s !== toRemove);
  }

  const isActive = data.isActive;
  const isAncestorActive = data.isAncestorActive;

  const borderColor = selected ? '#1976d2' : (isActive ? '#2e7d32' : (isOrthogonal ? '#0066cc' : (isCompound ? '#666' : '#1a192b')));

  // Determine background color based on active state
  let backgroundColor: string;
  if (isActive) {
    backgroundColor = 'rgba(200, 240, 200, 0.92)';
  } else if (isAncestorActive) {
    backgroundColor = 'rgba(220, 245, 220, 0.88)';
  } else if (isOrthogonal) {
    backgroundColor = 'rgba(240, 248, 255, 0.9)';
  } else if (isCompound) {
    backgroundColor = 'rgba(249, 249, 249, 0.85)';
  } else {
    backgroundColor = 'rgba(255, 255, 255, 0.85)';
  }

  // Determine box-shadow
  let boxShadow: string | undefined;
  if (selected) {
    boxShadow = '0 0 0 1.5px #1976d2, 0 0 12px 4px rgba(25, 118, 210, 0.35)';
  } else if (isActive) {
    boxShadow = '0 0 0 2px #4caf50, 0 0 16px 6px rgba(76, 175, 80, 0.45)';
  } else if (isAncestorActive) {
    boxShadow = '0 0 0 1px rgba(76, 175, 80, 0.4)';
  }

  const nodeStyle: React.CSSProperties = {
    position: 'relative',
    fontSize: `${fontSize}px`,
    borderWidth: isOrthogonal ? '2px' : (isActive ? '2px' : `${borderWidth}px`),
    borderStyle: isOrthogonal ? 'dashed' : (isCompound ? 'dashed' : 'solid'),
    borderColor,
    borderRadius: `${borderRadius}px`,
    backgroundColor,
    width: '100%',
    height: '100%',
    boxShadow,
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

      {data.hasProxy && (() => {
        const badgeDiameter = 16;
        const w = data.screenWidth ?? Infinity;
        const h = data.screenHeight ?? Infinity;
        return badgeDiameter < 0.7 * w && badgeDiameter < 0.7 * h;
      })() && (
        <div className="proxy-target-badge" title="This state has proxy references"
          style={{ borderColor, color: borderColor }}>
          ↙
        </div>
      )}

      {showLabel && sections.length > 0 && isCompound && (
        // Compound state: code/annotation displayed in a distinct double-bordered box
        <div style={{
          position: 'absolute',
          top: labelAreaHeight + 4,
          left: 8,
          right: 8,
          border: `3px double ${borderColor}`,
          borderRadius: 3,
          backgroundColor: 'rgba(242, 242, 248, 0.92)',
          padding: '3px 6px',
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 1,
        }}>
          {sections.map(s => (
            <div key={s.key} style={{
              fontSize: `${sectionFontSize}px`,
              fontFamily: s.fontFamily,
              fontStyle: s.fontStyle,
              textAlign: s.textAlign,
              whiteSpace: s.whiteSpace as React.CSSProperties['whiteSpace'],
              wordBreak: s.key === 'annotation' ? 'break-word' : undefined,
              lineHeight: '1.3',
              color: '#444',
              overflow: 'hidden',
            }}>
              {s.text}
            </div>
          ))}
        </div>
      )}

      {showLabel && sections.length > 0 && !isCompound && (
        // Leaf state: code/annotation displayed inline in the state area
        <div style={{
          position: 'absolute',
          top: labelAreaHeight,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-evenly',
          padding: '0 8px',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}>
          {sections.map(s => (
            <div key={s.key} style={{
              fontSize: `${sectionFontSize}px`,
              fontFamily: s.fontFamily,
              fontStyle: s.fontStyle,
              textAlign: s.textAlign,
              whiteSpace: s.whiteSpace as React.CSSProperties['whiteSpace'],
              wordBreak: s.key === 'annotation' ? 'break-word' : undefined,
              lineHeight: '1.3',
              color: '#444',
              overflow: 'hidden',
            }}>
              {s.text}
            </div>
          ))}
        </div>
      )}
      {(isActive || isAncestorActive) && data.activeTimerMs != null && (data.screenWidth ?? 999) > 60 && (data.screenHeight ?? 999) > 30 && (() => {
        const totalSec = Math.floor(data.activeTimerMs / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        const label = `${min}:${sec.toString().padStart(2, '0')}`;
        return (
          <div style={{
            position: 'absolute',
            bottom: 2,
            right: 4,
            fontSize: '10px',
            fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
            color: '#2e7d32',
            backgroundColor: 'rgba(255,255,255,0.8)',
            borderRadius: 3,
            padding: '0 3px',
            pointerEvents: 'none',
            lineHeight: '14px',
          }}>
            {label}
          </div>
        );
      })()}
    </div>
  );
});
