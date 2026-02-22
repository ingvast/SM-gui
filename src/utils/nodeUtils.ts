import { Node } from 'reactflow';

export function calculateNodeDepth(nodeId: string, nodesArray: Node[], cache: Map<string, number> = new Map()): number {
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }

  const node = nodesArray.find(n => n.id === nodeId);
  if (!node || !node.parentId) {
    cache.set(nodeId, 0);
    return 0;
  }

  const parentDepth = calculateNodeDepth(node.parentId, nodesArray, cache);
  const depth = parentDepth + 1;
  cache.set(nodeId, depth);
  return depth;
}

export function isAncestorOf(ancestorId: string, descendantId: string, nodes: Node[]): boolean {
  let current = nodes.find(n => n.id === descendantId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = nodes.find(n => n.id === current!.parentId);
  }
  return false;
}

export function getAllDescendants(parentNodeId: string, allNodes: Node[]): Node[] {
  const descendants: Node[] = [];
  const queue = [parentNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const children = allNodes.filter(n => n.parentId === currentId);
    for (const child of children) {
      descendants.push(child);
      queue.push(child.id);
    }
  }
  return descendants;
}

export function generateUniqueNodeLabel(baseLabel: string, parentId: string | undefined, currentNodes: Node[]): string {
  let counter = 1;
  let newLabel = baseLabel;
  let isUnique = false;

  while (!isUnique) {
    isUnique = true;
    const siblings = currentNodes.filter(n => n.parentId === parentId);
    for (const sibling of siblings) {
      if (sibling.data.label.trim() === newLabel.trim()) {
        isUnique = false;
        counter++;
        newLabel = `${baseLabel} ${counter}`;
        break;
      }
    }
  }
  return newLabel;
}

export function computeNodePath(nodeId: string, nodes: Node[]): string {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return '';
  const parts: string[] = [node.data.label];
  let current = node;
  while (current.parentId) {
    const parent = nodes.find(n => n.id === current.parentId);
    if (!parent) break;
    parts.unshift(parent.data.label);
    current = parent;
  }
  return parts.join('/');
}

export function buildTreeData(nodes: Node[]) {
  const stateNodes = nodes.filter(n => n.type !== 'decisionNode' && n.type !== 'proxyNode');
  const nodesMap = new Map(stateNodes.map(node => [node.id, { ...node, children: [] as Node[] }]));

  stateNodes.forEach(node => {
    if (node.parentId) {
      const parent = nodesMap.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  });

  const buildSubtree = (nodeItem: Node) => {
    const entry = nodesMap.get(nodeItem.id);
    const childrenNodes = entry ? entry.children : [];

    const treeNode = {
      id: nodeItem.id,
      label: nodeItem.data.label,
      type: 'state',
      children: [] as ReturnType<typeof buildSubtree>[],
    };

    childrenNodes.forEach(childNode => {
      treeNode.children.push(buildSubtree(childNode));
    });

    return treeNode;
  };

  const tree: ReturnType<typeof buildSubtree>[] = [];
  nodesMap.forEach(node => {
    if (!node.parentId) {
      tree.push(buildSubtree(node));
    }
  });

  return [{
    id: '/',
    label: '/',
    type: 'root',
    children: tree,
  }];
}
