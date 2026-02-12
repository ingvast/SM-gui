import { Node } from 'reactflow';
import { isAncestorOf } from './nodeUtils';
import { getAbsoluteNodeBounds } from '../semanticZoom';

export function calculateBestHandles(sourceId: string, targetId: string, nodes: Node[]): { sourceHandle: string; targetHandle: string } {
  const sourceBounds = getAbsoluteNodeBounds(sourceId, nodes);
  const targetBounds = getAbsoluteNodeBounds(targetId, nodes);

  if (!sourceBounds || !targetBounds) {
    return { sourceHandle: 'right-source', targetHandle: 'left-target' };
  }

  // Check for parent-child relationship
  const sourceIsParent = isAncestorOf(sourceId, targetId, nodes);
  const targetIsParent = isAncestorOf(targetId, sourceId, nodes);

  if (sourceIsParent || targetIsParent) {
    // For parent-child connections, find which edge of the child is closest to the parent's edge
    const child = sourceIsParent ? targetBounds : sourceBounds;
    const parent = sourceIsParent ? sourceBounds : targetBounds;

    // Calculate distances from child center to each parent edge
    const childCenterX = child.x + child.width / 2;
    const childCenterY = child.y + child.height / 2;

    const distToTop = childCenterY - parent.y;
    const distToBottom = (parent.y + parent.height) - childCenterY;
    const distToLeft = childCenterX - parent.x;
    const distToRight = (parent.x + parent.width) - childCenterX;

    const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

    // Both handles should be on the same side (edge goes inward)
    if (minDist === distToTop) {
      return { sourceHandle: 'top-source', targetHandle: 'top-target' };
    } else if (minDist === distToBottom) {
      return { sourceHandle: 'bottom-source', targetHandle: 'bottom-target' };
    } else if (minDist === distToLeft) {
      return { sourceHandle: 'left-source', targetHandle: 'left-target' };
    } else {
      return { sourceHandle: 'right-source', targetHandle: 'right-target' };
    }
  }

  // Normal case: nodes are not in parent-child relationship
  const sourceCenterX = sourceBounds.x + sourceBounds.width / 2;
  const sourceCenterY = sourceBounds.y + sourceBounds.height / 2;
  const targetCenterX = targetBounds.x + targetBounds.width / 2;
  const targetCenterY = targetBounds.y + targetBounds.height / 2;

  const dx = targetCenterX - sourceCenterX;
  const dy = targetCenterY - sourceCenterY;

  // Determine primary direction
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) {
      return { sourceHandle: 'right-source', targetHandle: 'left-target' };
    } else {
      return { sourceHandle: 'left-source', targetHandle: 'right-target' };
    }
  } else {
    if (dy > 0) {
      return { sourceHandle: 'bottom-source', targetHandle: 'top-target' };
    } else {
      return { sourceHandle: 'top-source', targetHandle: 'bottom-target' };
    }
  }
}
