import { Node, Edge } from 'reactflow';

export type ConsistencyErrorKind =
  | 'dangling_edge_source'
  | 'dangling_edge_target'
  | 'dangling_parent'
  | 'broken_proxy_target'
  | 'dangling_initial';

export interface ConsistencyError {
  kind: ConsistencyErrorKind;
  message: string;
}

/**
 * Check that all ID references within the ReactFlow model are internally
 * consistent.  Returns an array of violations (empty = clean).
 *
 * Checks:
 *  - edge.source / edge.target point to existing nodes
 *  - node.parentId points to an existing node
 *  - proxyNode.data.targetId points to an existing node (unless marked broken)
 *  - stateNode.data.initial points to an existing node
 */
export function checkModelConsistency(nodes: Node[], edges: Edge[]): ConsistencyError[] {
  const errors: ConsistencyError[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        kind: 'dangling_edge_source',
        message: `Edge "${edge.id}" has source "${edge.source}" which does not exist`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        kind: 'dangling_edge_target',
        message: `Edge "${edge.id}" has target "${edge.target}" which does not exist`,
      });
    }
  }

  for (const node of nodes) {
    if (node.parentId !== undefined && !nodeIds.has(node.parentId)) {
      errors.push({
        kind: 'dangling_parent',
        message: `Node "${node.id}" ("${node.data?.label ?? node.id}") has parentId "${node.parentId}" which does not exist`,
      });
    }

    if (node.type === 'proxyNode') {
      const data = node.data as { targetId?: string; broken?: boolean };
      if (data.targetId && !data.broken && !nodeIds.has(data.targetId)) {
        errors.push({
          kind: 'broken_proxy_target',
          message: `Proxy node "${node.id}" has targetId "${data.targetId}" which does not exist`,
        });
      }
    }

    if (node.type === 'stateNode' && node.data?.initial) {
      if (!nodeIds.has(node.data.initial as string)) {
        errors.push({
          kind: 'dangling_initial',
          message: `Node "${node.id}" ("${node.data?.label}") has data.initial "${node.data.initial}" which does not exist`,
        });
      }
    }
  }

  return errors;
}

/**
 * Assert the model is consistent.  Throws an Error listing all violations if
 * not — designed for use inside test suites.
 */
export function assertModelConsistent(nodes: Node[], edges: Edge[]): void {
  const errors = checkModelConsistency(nodes, edges);
  if (errors.length > 0) {
    const lines = errors.map(e => `  [${e.kind}] ${e.message}`).join('\n');
    throw new Error(`Model consistency violations:\n${lines}`);
  }
}
