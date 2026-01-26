import React from 'react';

const TreeNode = ({ node, onSelect, selectedItemId }) => {
  const isSelected = selectedItemId === node.id;
  return (
    <div style={{ marginLeft: 10 }}>
      <div
        style={{ cursor: 'pointer', 
                 fontWeight: isSelected ? 'bold' : 'normal',
                 color: isSelected ? '#007bff' : 'inherit' // Make it blue when selected
              }}
        onClick={() => onSelect(node.id, node.type)}
      >
        {node.label}
      </div>
      {node.children && node.children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          onSelect={onSelect}
          selectedItemId={selectedItemId}
        />
      ))}
    </div>
  );
};

const StateTree = ({ treeData, onSelect, selectedItemId }) => {
  return (
    <div>
      {treeData.map(node => (
        <TreeNode
          key={node.id}
          node={node}
          onSelect={onSelect}
          selectedItemId={selectedItemId}
        />
      ))}
    </div>
  );
};

export default StateTree;
