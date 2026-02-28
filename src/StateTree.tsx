import React, { useRef, useState } from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { Box } from '@mui/material';

type TreeNodeData = {
  id: string;
  label: string;
  type: string;
  children?: TreeNodeData[];
};

type DragInfo = { id: string; parentId: string };
type DropInfo = { targetId: string; before: boolean } | null;

const StateTree = ({ treeData, onSelect, selectedItemId, onReorder }) => {
  const dragNodeRef = useRef<DragInfo | null>(null);
  const [dropInfo, setDropInfo] = useState<DropInfo>(null);

  const isDropBefore = (id: string) => dropInfo?.targetId === id && dropInfo.before;
  const isDropAfter = (id: string) => dropInfo?.targetId === id && !dropInfo.before;

  const renderTree = (nodes: TreeNodeData[], parentId: string) =>
    nodes.map(node => (
      <TreeItem
        key={node.id}
        itemId={node.id}
        label={node.label}
        onClick={(e) => { e.stopPropagation(); onSelect(node.id, node.type); }}
        sx={{
          '& > .MuiTreeItem-content': {
            borderTop: isDropBefore(node.id) ? '2px solid #1976d2' : undefined,
            borderBottom: isDropAfter(node.id) ? '2px solid #1976d2' : undefined,
          }
        }}
        slotProps={{
          content: {
            draggable: true,
            onDragStart: (e) => {
              dragNodeRef.current = { id: node.id, parentId };
              e.dataTransfer.effectAllowed = 'move';
              e.stopPropagation();
            },
            onDragOver: (e) => {
              if (!dragNodeRef.current || dragNodeRef.current.parentId !== parentId || dragNodeRef.current.id === node.id) return;
              e.preventDefault();
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setDropInfo({ targetId: node.id, before: e.clientY < rect.top + rect.height / 2 });
            },
            onDrop: (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragNodeRef.current?.parentId === parentId && dragNodeRef.current.id !== node.id) {
                onReorder(dragNodeRef.current.id, node.id, dropInfo?.before ?? false);
              }
              setDropInfo(null);
              dragNodeRef.current = null;
            },
            onDragLeave: (e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                setDropInfo(null);
              }
            },
            onDragEnd: () => {
              setDropInfo(null);
              dragNodeRef.current = null;
            },
          } as any
        }}
      >
        {node.children && node.children.length > 0 && renderTree(node.children, node.id)}
      </TreeItem>
    ));

  return (
    <Box sx={{ minHeight: 200, flexGrow: 1 }}>
      <SimpleTreeView
        selectedItems={selectedItemId}
        onSelectedItemsChange={() => {
          // Selection is handled by TreeNode onClick
        }}
        defaultExpandedItems={['/']}
        expansionTrigger="iconContainer"
        itemChildrenIndentation={24}
      >
        {treeData.map(node => (
          <TreeItem
            key={node.id}
            itemId={node.id}
            label={node.label}
            onClick={(e) => { e.stopPropagation(); onSelect(node.id, node.type); }}
          >
            {node.children && node.children.length > 0 && renderTree(node.children, node.id)}
          </TreeItem>
        ))}
      </SimpleTreeView>
    </Box>
  );
};

export default StateTree;
