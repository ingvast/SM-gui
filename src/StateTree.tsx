import React from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { Box } from '@mui/material';

const TreeNode = ({ node, onSelect, selectedItemId }) => {
  return (
    <TreeItem
      itemId={node.id}
      label={node.label}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id, node.type);
      }}
    >
      {node.children && node.children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          onSelect={onSelect}
          selectedItemId={selectedItemId}
        />
      ))}
    </TreeItem>
  );
};

const StateTree = ({ treeData, onSelect, selectedItemId }) => {
  return (
    <Box sx={{ minHeight: 200, flexGrow: 1 }}>
      <SimpleTreeView
        selectedItems={selectedItemId}
        onSelectedItemsChange={() => {
          // Selection is handled by TreeNode onClick
        }}
        defaultExpandedItems={['/']}
      >
        {treeData.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            onSelect={onSelect}
            selectedItemId={selectedItemId}
          />
        ))}
      </SimpleTreeView>
    </Box>
  );
};

export default StateTree;
