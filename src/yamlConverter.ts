import yaml from 'js-yaml';
import { Node, Edge, MarkerType } from 'reactflow';

interface StateData {
  label: string;
  history: boolean;
  orthogonal: boolean;
  entry: string;
  exit: string;
  do: string;
  annotation?: string;
  showAnnotation?: boolean;
  showEntry?: boolean;
  showDo?: boolean;
  showExit?: boolean;
  initial?: string;
  initialMarkerPos?: { x: number; y: number };
  initialMarkerSize?: number;
  historyMarkerPos?: { x: number; y: number };
  historyMarkerSize?: number;
}

export interface MachineProperties {
  language: string;
  includes: string;
  context: string;
  context_init: string;
  entry: string;
  exit: string;
  do: string;
  hooks: {
    entry: string;
    exit: string;
    do: string;
    transition: string;
  };
  initial?: string;  // ID of initial top-level state
  initialMarkerPos?: { x: number; y: number };
  initialMarkerSize?: number;
  historyMarkerPos?: { x: number; y: number };
  historyMarkerSize?: number;
}

export const defaultMachineProperties: MachineProperties = {
  language: '',
  includes: '',
  context: '',
  context_init: '',
  entry: '',
  exit: '',
  do: '',
  hooks: {
    entry: '',
    exit: '',
    do: '',
    transition: '',
  },
};

interface YamlDecisionTransition {
  to: string;
  guard?: string;
  action?: string;
  graphics?: {
    sourceHandle?: string;
    targetHandle?: string;
    controlPoints?: { x: number; y: number }[];
    labelPosition?: number;
  };
}

interface YamlDecision {
  transitions: YamlDecisionTransition[];
  graphics?: {
    x: number;
    y: number;
    size: number;
  };
}

interface YamlState {
  entry?: string;
  exit?: string;
  do?: string;
  annotation?: string;
  history?: boolean;
  orthogonal?: boolean;
  initial?: string;
  states?: Record<string, YamlState>;
  decisions?: Record<string, YamlDecisionTransition[] | YamlDecision>;
  transitions?: YamlTransition[];
  graphics?: {
    x: number;
    y: number;
    width: number;
    height: number;
    initialMarkerPos?: { x: number; y: number };
    initialMarkerSize?: number;
    historyMarkerPos?: { x: number; y: number };
    historyMarkerSize?: number;
    showAnnotation?: boolean;
    showEntry?: boolean;
    showDo?: boolean;
    showExit?: boolean;
  };
}

interface YamlTransition {
  to: string;
  guard?: string;
  action?: string;
  graphics?: {
    sourceHandle?: string;
    targetHandle?: string;
    controlPoints?: { x: number; y: number }[];
    labelPosition?: number;
  };
}

interface YamlDocument {
  language?: string;
  includes?: string;
  context?: string;
  context_init?: string;
  hooks?: {
    entry?: string;
    exit?: string;
    do?: string;
    transition?: string;
  };
  entry?: string;
  exit?: string;
  do?: string;
  history?: boolean;
  initial?: string;
  states?: Record<string, YamlState>;
  decisions?: Record<string, YamlDecisionTransition[] | YamlDecision>;
  graphics?: {
    initialMarkerPos?: { x: number; y: number };
    initialMarkerSize?: number;
    historyMarkerPos?: { x: number; y: number };
    historyMarkerSize?: number;
  };
}

// Build a map of node ID to its full path (e.g., "Parent/Child/Grandchild")
function buildNodePathMap(nodes: Node<StateData>[]): Map<string, string> {
  const pathMap = new Map<string, string>();
  const nodeMap = new Map<string, Node<StateData>>();

  nodes.forEach(node => nodeMap.set(node.id, node));

  function getPath(node: Node<StateData>): string {
    const existingPath = pathMap.get(node.id);
    if (existingPath !== undefined) {
      return existingPath;
    }

    if (!node.parentId) {
      const path = node.data.label;
      pathMap.set(node.id, path);
      return path;
    }

    const parent = nodeMap.get(node.parentId);
    if (!parent) {
      const path = node.data.label;
      pathMap.set(node.id, path);
      return path;
    }

    const parentPath = getPath(parent);
    const path = `${parentPath}/${node.data.label}`;
    pathMap.set(node.id, path);
    return path;
  }

  nodes.forEach(node => getPath(node));
  return pathMap;
}

// Compute a relative path from sourcePath to targetPath
// Rules:
//   Sibling (same parent): just the target name, e.g. "B"
//   Self: "."
//   Child: "./Child" or "./Child/Grandchild"
//   Parent: ".."
//   General: "../../Uncle/Cousin"
function computeRelativePath(sourcePath: string, targetPath: string): string {
  if (sourcePath === targetPath) return '.';

  const sourceParts = sourcePath.split('/');
  const targetParts = targetPath.split('/');

  // Target is a descendant of source
  if (targetPath.startsWith(sourcePath + '/')) {
    return './' + targetPath.substring(sourcePath.length + 1);
  }

  // Sibling check (same parent)
  const sourceParent = sourceParts.slice(0, -1).join('/');
  const targetParent = targetParts.slice(0, -1).join('/');
  if (sourceParent === targetParent) {
    return targetParts[targetParts.length - 1];
  }

  // General case: find longest common prefix, then go up and down
  let commonLen = 0;
  const minLen = Math.min(sourceParts.length, targetParts.length);
  for (let i = 0; i < minLen; i++) {
    if (sourceParts[i] === targetParts[i]) {
      commonLen = i + 1;
    } else {
      break;
    }
  }

  const ups = sourceParts.length - commonLen;
  const downs = targetParts.slice(commonLen);

  const upPath = Array(ups).fill('..').join('/');
  if (downs.length === 0) {
    return upPath; // target is an ancestor
  }
  return upPath + '/' + downs.join('/');
}

export function convertToYaml(
  nodes: Node<StateData>[],
  edges: Edge[],
  rootHistory: boolean,
  includeGraphics: boolean,
  machineProperties?: MachineProperties
): string {
  // Separate state nodes and decision nodes
  const stateNodes = nodes.filter(n => n.type !== 'decisionNode');
  const decisionNodes = nodes.filter(n => n.type === 'decisionNode');

  const pathMap = buildNodePathMap(stateNodes);

  // Build decision name map: decision node ID -> label
  const decisionIdToName = new Map<string, string>();
  decisionNodes.forEach(n => decisionIdToName.set(n.id, n.data.label));

  // Group edges by source node
  const edgesBySource = new Map<string, Edge[]>();
  edges.forEach(edge => {
    const list = edgesBySource.get(edge.source) || [];
    list.push(edge);
    edgesBySource.set(edge.source, list);
  });

  // Resolve an edge target to a YAML path string
  // If target is a decision, use @name; if target is a state, use relative path from source
  function resolveEdgeTarget(edge: Edge): string {
    const decisionName = decisionIdToName.get(edge.target);
    if (decisionName) {
      return `@${decisionName}`;
    }
    // For state targets, compute relative path from source
    // Source might be a decision — find its parent state for path context
    const sourceNode = nodes.find(n => n.id === edge.source);
    let sourcePath: string | undefined;
    if (sourceNode?.type === 'decisionNode') {
      // Decision's context is its parent state
      if (sourceNode.parentId) {
        sourcePath = pathMap.get(sourceNode.parentId);
      }
      // If no parent (root-level decision), sourcePath stays undefined (top-level context)
    } else {
      sourcePath = pathMap.get(edge.source);
    }
    const targetPath = pathMap.get(edge.target);
    if (targetPath && sourcePath) {
      return computeRelativePath(sourcePath, targetPath);
    }
    return targetPath || edge.target;
  }

  // Build nested state structure recursively
  function buildStateObj(node: Node<StateData>): YamlState {
    const stateObj: YamlState = {};

    // Add actions if present
    if (node.data.entry?.trim()) {
      stateObj.entry = node.data.entry;
    }
    if (node.data.exit?.trim()) {
      stateObj.exit = node.data.exit;
    }
    if (node.data.do?.trim()) {
      stateObj.do = node.data.do;
    }
    if (node.data.annotation?.trim()) {
      stateObj.annotation = node.data.annotation;
    }
    if (node.data.history) {
      stateObj.history = true;
    }
    if (node.data.orthogonal) {
      stateObj.orthogonal = true;
    }

    // Add graphics if requested
    if (includeGraphics) {
      stateObj.graphics = {
        x: node.position.x,
        y: node.position.y,
        width: (node.style?.width as number) || 150,
        height: (node.style?.height as number) || 50,
      };

      // Store history marker geometry
      if (node.data.history && node.data.historyMarkerPos) {
        stateObj.graphics.historyMarkerPos = node.data.historyMarkerPos;
        stateObj.graphics.historyMarkerSize = node.data.historyMarkerSize;
      }
      // Store show flags
      if (node.data.showAnnotation) stateObj.graphics.showAnnotation = true;
      if (node.data.showEntry) stateObj.graphics.showEntry = true;
      if (node.data.showDo) stateObj.graphics.showDo = true;
      if (node.data.showExit) stateObj.graphics.showExit = true;
    }

    // Add child states (exclude decision nodes)
    const stateChildren = nodes.filter(n => n.parentId === node.id && n.type !== 'decisionNode');
    if (stateChildren.length > 0) {
      const states: Record<string, YamlState> = {};
      stateChildren.forEach(child => {
        states[child.data.label] = buildStateObj(child);
      });
      stateObj.states = states;

      // Add initial state if set
      if (node.data.initial) {
        const initialChild = stateChildren.find(c => c.id === node.data.initial);
        if (initialChild) {
          stateObj.initial = initialChild.data.label;
          // Store initial marker position in graphics
          if (includeGraphics && node.data.initialMarkerPos) {
            if (!stateObj.graphics) {
              stateObj.graphics = {
                x: node.position.x,
                y: node.position.y,
                width: (node.style?.width as number) || 150,
                height: (node.style?.height as number) || 50,
              };
            }
            stateObj.graphics.initialMarkerPos = node.data.initialMarkerPos;
            stateObj.graphics.initialMarkerSize = node.data.initialMarkerSize;
          }
        }
      }
    }

    // Add decision children
    const decisionChildren = decisionNodes.filter(n => n.parentId === node.id);
    if (decisionChildren.length > 0) {
      const decisions: Record<string, YamlDecisionTransition[] | YamlDecision> = {};
      decisionChildren.forEach(decision => {
        const decisionEdges = edgesBySource.get(decision.id) || [];
        const transitions: YamlDecisionTransition[] = decisionEdges.map(edge => {
          const t: YamlDecisionTransition = { to: resolveEdgeTarget(edge) };
          if ((edge.data as { guard?: string })?.guard) {
            t.guard = (edge.data as { guard: string }).guard;
          }
          if ((edge.data as { action?: string })?.action) {
            t.action = (edge.data as { action: string }).action;
          }
          if (includeGraphics) {
            const edgeData = edge.data as { controlPoints?: { x: number; y: number }[]; labelPosition?: number } | undefined;
            const hasHandles = edge.sourceHandle || edge.targetHandle;
            const hasControlPoints = edgeData?.controlPoints && edgeData.controlPoints.length > 0;
            const hasLabelPosition = edgeData?.labelPosition != null;
            if (hasHandles || hasControlPoints || hasLabelPosition) {
              t.graphics = {
                sourceHandle: edge.sourceHandle || undefined,
                targetHandle: edge.targetHandle || undefined,
                controlPoints: hasControlPoints ? edgeData!.controlPoints : undefined,
                labelPosition: hasLabelPosition ? edgeData!.labelPosition : undefined,
              };
            }
          }
          return t;
        });

        if (includeGraphics) {
          const size = (decision.style?.width as number) || 15;
          decisions[decision.data.label] = {
            transitions,
            graphics: {
              x: decision.position.x,
              y: decision.position.y,
              size,
            },
          };
        } else {
          decisions[decision.data.label] = transitions;
        }
      });
      stateObj.decisions = decisions;
    }

    // Add transitions for state nodes
    const nodeEdges = edgesBySource.get(node.id) || [];
    if (nodeEdges.length > 0) {
      stateObj.transitions = nodeEdges.map(edge => {
        const transition: YamlTransition = {
          to: resolveEdgeTarget(edge),
        };
        // Include edge data if present
        if ((edge.data as { guard?: string })?.guard) {
          transition.guard = (edge.data as { guard: string }).guard;
        }
        if ((edge.data as { action?: string })?.action) {
          transition.action = (edge.data as { action: string }).action;
        }
        // Save edge graphics if present (only when includeGraphics is true)
        if (includeGraphics) {
          const edgeData = edge.data as { controlPoints?: { x: number; y: number }[]; labelPosition?: number } | undefined;
          const hasHandles = edge.sourceHandle || edge.targetHandle;
          const hasControlPoints = edgeData?.controlPoints && edgeData.controlPoints.length > 0;
          const hasLabelPosition = edgeData?.labelPosition != null;
          if (hasHandles || hasControlPoints || hasLabelPosition) {
            transition.graphics = {
              sourceHandle: edge.sourceHandle || undefined,
              targetHandle: edge.targetHandle || undefined,
              controlPoints: hasControlPoints ? edgeData!.controlPoints : undefined,
              labelPosition: hasLabelPosition ? edgeData!.labelPosition : undefined,
            };
          }
        }
        return transition;
      });
    }

    return stateObj;
  }

  // Build the document with explicit property ordering
  // Machine properties go first, then states
  const doc: YamlDocument = {};

  // 1. Language first
  if (machineProperties?.language?.trim()) {
    doc.language = machineProperties.language;
  }

  // 2. Includes
  if (machineProperties?.includes?.trim()) {
    doc.includes = machineProperties.includes;
  }

  // 3. Context
  if (machineProperties?.context?.trim()) {
    doc.context = machineProperties.context;
  }

  // 4. Context init
  if (machineProperties?.context_init?.trim()) {
    doc.context_init = machineProperties.context_init;
  }

  // 5. Hooks (global hooks for all states)
  if (machineProperties) {
    const hooks = machineProperties.hooks;
    if (hooks.entry?.trim() || hooks.exit?.trim() || hooks.do?.trim() || hooks.transition?.trim()) {
      doc.hooks = {};
      if (hooks.entry?.trim()) doc.hooks.entry = hooks.entry;
      if (hooks.exit?.trim()) doc.hooks.exit = hooks.exit;
      if (hooks.do?.trim()) doc.hooks.do = hooks.do;
      if (hooks.transition?.trim()) doc.hooks.transition = hooks.transition;
    }
  }

  // 6. Root state entry/exit/do
  if (machineProperties?.entry?.trim()) {
    doc.entry = machineProperties.entry;
  }
  if (machineProperties?.exit?.trim()) {
    doc.exit = machineProperties.exit;
  }
  if (machineProperties?.do?.trim()) {
    doc.do = machineProperties.do;
  }

  // 7. Root history
  if (rootHistory) {
    doc.history = true;
    if (includeGraphics && machineProperties?.historyMarkerPos) {
      if (!doc.graphics) doc.graphics = {};
      doc.graphics.historyMarkerPos = machineProperties.historyMarkerPos;
      doc.graphics.historyMarkerSize = machineProperties.historyMarkerSize;
    }
  }

  // 8. Root initial state
  if (machineProperties?.initial) {
    const initialNode = nodes.find(n => n.id === machineProperties.initial);
    if (initialNode && !initialNode.parentId) {
      doc.initial = initialNode.data.label;
      if (includeGraphics && machineProperties.initialMarkerPos) {
        doc.graphics = {
          initialMarkerPos: machineProperties.initialMarkerPos,
          initialMarkerSize: machineProperties.initialMarkerSize,
        };
      }
    }
  }

  // 9. Get top-level states (no parent, exclude decisions)
  const topLevelStateNodes = stateNodes.filter(n => !n.parentId);
  if (topLevelStateNodes.length > 0) {
    const states: Record<string, YamlState> = {};
    topLevelStateNodes.forEach(node => {
      states[node.data.label] = buildStateObj(node);
    });
    doc.states = states;
  }

  // 10. Root-level decisions
  const rootDecisions = decisionNodes.filter(n => !n.parentId);
  if (rootDecisions.length > 0) {
    const decisions: Record<string, YamlDecisionTransition[] | YamlDecision> = {};
    rootDecisions.forEach(decision => {
      const decisionEdges = edgesBySource.get(decision.id) || [];
      const transitions: YamlDecisionTransition[] = decisionEdges.map(edge => {
        const t: YamlDecisionTransition = { to: resolveEdgeTarget(edge) };
        if ((edge.data as { guard?: string })?.guard) {
          t.guard = (edge.data as { guard: string }).guard;
        }
        if ((edge.data as { action?: string })?.action) {
          t.action = (edge.data as { action: string }).action;
        }
        if (includeGraphics) {
          const edgeData = edge.data as { controlPoints?: { x: number; y: number }[]; labelPosition?: number } | undefined;
          const hasHandles = edge.sourceHandle || edge.targetHandle;
          const hasControlPoints = edgeData?.controlPoints && edgeData.controlPoints.length > 0;
          const hasLabelPosition = edgeData?.labelPosition != null;
          if (hasHandles || hasControlPoints || hasLabelPosition) {
            t.graphics = {
              sourceHandle: edge.sourceHandle || undefined,
              targetHandle: edge.targetHandle || undefined,
              controlPoints: hasControlPoints ? edgeData!.controlPoints : undefined,
              labelPosition: hasLabelPosition ? edgeData!.labelPosition : undefined,
            };
          }
        }
        return t;
      });

      if (includeGraphics) {
        const size = (decision.style?.width as number) || 15;
        decisions[decision.data.label] = {
          transitions,
          graphics: {
            x: decision.position.x,
            y: decision.position.y,
            size,
          },
        };
      } else {
        decisions[decision.data.label] = transitions;
      }
    });
    doc.decisions = decisions;
  }

  return yaml.dump(doc, { lineWidth: -1, noRefs: true });
}

export function convertToPhoenixYaml(
  nodes: Node<StateData>[],
  edges: Edge[],
): { yaml: string; warnings: string[] } {
  const warnings: string[] = [];

  // Build maps
  const nodeMap = new Map<string, Node<StateData>>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  // Identify top-level states and second-level states
  const topLevelStates = nodes.filter(n => !n.parentId && n.type === 'stateNode');
  const topLevelIds = new Set(topLevelStates.map(n => n.id));

  const secondLevelStates = nodes.filter(n => n.parentId && topLevelIds.has(n.parentId) && n.type === 'stateNode');
  const secondLevelIds = new Set(secondLevelStates.map(n => n.id));

  // Warn about decision nodes
  const decisionNodes = nodes.filter(n => n.type === 'decisionNode');
  decisionNodes.forEach(d => {
    warnings.push(`Decision node "${d.data.label}" was skipped`);
  });

  // Warn about states deeper than 2 levels
  nodes.forEach(n => {
    if (n.type !== 'stateNode') return;
    if (!n.parentId) return; // top-level
    if (topLevelIds.has(n.parentId)) return; // second-level
    const path = buildPathForNode(n, nodeMap);
    warnings.push(`State "${path}" is deeper than 2 levels and was skipped`);
  });

  // Warn about top-level states with entry/exit/do
  topLevelStates.forEach(n => {
    if (n.data.entry?.trim()) warnings.push(`Top-level state "${n.data.label}" has entry code that was ignored`);
    if (n.data.exit?.trim()) warnings.push(`Top-level state "${n.data.label}" has exit code that was ignored`);
    if (n.data.do?.trim()) warnings.push(`Top-level state "${n.data.label}" has 'do' code that was ignored`);
  });

  // Warn about second-level states with do code
  secondLevelStates.forEach(n => {
    const parentLabel = nodeMap.get(n.parentId!)?.data.label || '?';
    if (n.data.do?.trim()) warnings.push(`State "${parentLabel}/${n.data.label}" has 'do' code that was ignored`);
  });

  // Warn about transitions on top-level states
  const edgesBySource = new Map<string, Edge[]>();
  edges.forEach(edge => {
    const list = edgesBySource.get(edge.source) || [];
    list.push(edge);
    edgesBySource.set(edge.source, list);
  });

  topLevelStates.forEach(n => {
    const topEdges = edgesBySource.get(n.id) || [];
    if (topEdges.length > 0) {
      warnings.push(`Top-level state "${n.data.label}" has transitions that were ignored`);
    }
  });

  // Helper: resolve target to "TopLevel secondLevel" format
  function resolvePhoenixTarget(targetId: string): string | null {
    const targetNode = nodeMap.get(targetId);
    if (!targetNode || targetNode.type !== 'stateNode') return null;

    if (topLevelIds.has(targetId)) {
      // Target is a top-level state - just the name
      return targetNode.data.label;
    }
    if (secondLevelIds.has(targetId)) {
      const parent = nodeMap.get(targetNode.parentId!);
      if (parent) {
        return `${parent.data.label} ${targetNode.data.label}`;
      }
    }
    // Deeper than 2 levels
    return null;
  }

  // Build output structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: Record<string, any> = {};

  topLevelStates.forEach(topState => {
    const children = secondLevelStates.filter(n => n.parentId === topState.id);
    if (children.length === 0) {
      doc[topState.data.label] = null;
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childMap: Record<string, any> = {};
    children.forEach(child => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childObj: Record<string, any> = {};

      // in (entry)
      if (child.data.entry?.trim()) {
        const lines = child.data.entry.trim().split('\n').map((l: string) => l.trim()).filter((l: string) => l);
        if (lines.length > 0) {
          childObj['in'] = lines;
        }
      }

      // out (exit)
      if (child.data.exit?.trim()) {
        const lines = child.data.exit.trim().split('\n').map((l: string) => l.trim()).filter((l: string) => l);
        if (lines.length > 0) {
          childObj['out'] = lines;
        }
      }

      // next (transitions)
      const childEdges = (edgesBySource.get(child.id) || []).filter(e => {
        // Skip edges to decision nodes or deep states
        const target = resolvePhoenixTarget(e.target);
        if (!target) {
          const targetNode = nodeMap.get(e.target);
          if (targetNode) {
            const path = buildPathForNode(targetNode, nodeMap);
            warnings.push(`Transition from "${topState.data.label}/${child.data.label}" to "${path}" was skipped (target not in top 2 levels)`);
          }
          return false;
        }
        return true;
      });

      if (childEdges.length === 1) {
        const edge = childEdges[0];
        const guard = (edge.data as { guard?: string })?.guard?.trim();
        const target = resolvePhoenixTarget(edge.target)!;
        if (guard) {
          childObj['next'] = { [guard]: target };
        } else {
          childObj['next'] = target;
        }
      } else if (childEdges.length > 1) {
        const nextMap: Record<string, string> = {};
        childEdges.forEach(edge => {
          const guard = (edge.data as { guard?: string })?.guard?.trim() || 'else';
          const target = resolvePhoenixTarget(edge.target)!;
          nextMap[guard] = target;
        });
        childObj['next'] = nextMap;
      }

      if (Object.keys(childObj).length === 0) {
        childMap[child.data.label] = null;
      } else {
        childMap[child.data.label] = childObj;
      }
    });

    doc[topState.data.label] = childMap;
  });

  return {
    yaml: yaml.dump(doc, { lineWidth: -1, noRefs: true }),
    warnings,
  };
}

function buildPathForNode(node: Node<StateData>, nodeMap: Map<string, Node<StateData>>): string {
  const parts: string[] = [node.data.label];
  let current = node;
  while (current.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    parts.unshift(parent.data.label);
    current = parent;
  }
  return parts.join('/');
}

interface ConvertFromYamlResult {
  nodes: Node<StateData>[];
  edges: Edge[];
  rootHistory: boolean;
  machineProperties: MachineProperties;
}

export function convertFromYaml(yamlContent: string): ConvertFromYamlResult {
  const doc = yaml.load(yamlContent) as YamlDocument;

  const nodes: Node<StateData>[] = [];
  const edges: Edge[] = [];
  let nodeIdCounter = 1;

  // Map from path to node ID for resolving transitions
  const pathToIdMap = new Map<string, string>();

  // Map from decision name to node ID for resolving @name references
  const decisionNameToIdMap = new Map<string, string>();

  // Auto-layout settings
  const defaultWidth = 150;
  const defaultHeight = 50;
  const defaultDecisionSize = 15;
  const horizontalGap = 50;

  function processState(
    stateName: string,
    stateData: YamlState | null | undefined,
    parentId: string | undefined,
    parentPath: string,
    autoLayoutX: number,
    autoLayoutY: number
  ): { width: number; height: number } {
    const nodeId = `node_${nodeIdCounter++}`;
    const fullPath = parentPath ? `${parentPath}/${stateName}` : stateName;
    pathToIdMap.set(fullPath, nodeId);

    // Handle null/undefined or empty state data
    const safeStateData = stateData || {};

    // Use graphics if present, otherwise auto-layout
    let x = autoLayoutX;
    let y = autoLayoutY;
    let width = defaultWidth;
    let height = defaultHeight;

    if (safeStateData.graphics) {
      x = safeStateData.graphics.x;
      y = safeStateData.graphics.y;
      width = safeStateData.graphics.width;
      height = safeStateData.graphics.height;
    }

    const node: Node<StateData> = {
      id: nodeId,
      type: 'stateNode',
      position: { x, y },
      data: {
        label: stateName,
        history: safeStateData.history || false,
        orthogonal: safeStateData.orthogonal || false,
        entry: safeStateData.entry || '',
        exit: safeStateData.exit || '',
        do: safeStateData.do || '',
        annotation: safeStateData.annotation || '',
        showAnnotation: safeStateData.graphics?.showAnnotation || false,
        showEntry: safeStateData.graphics?.showEntry || false,
        showDo: safeStateData.graphics?.showDo || false,
        showExit: safeStateData.graphics?.showExit || false,
        // initial will be resolved after children are created
        initialMarkerPos: safeStateData.graphics?.initialMarkerPos,
        initialMarkerSize: safeStateData.graphics?.initialMarkerSize,
        historyMarkerPos: safeStateData.graphics?.historyMarkerPos,
        historyMarkerSize: safeStateData.graphics?.historyMarkerSize,
      },
      style: { width, height },
    };

    // Default history marker position if history=true but no geometry
    if (node.data.history && !node.data.historyMarkerPos) {
      node.data.historyMarkerPos = { x: width * 0.05, y: height * 0.05 };
      node.data.historyMarkerSize = Math.min(width, height) * 0.15;
    }

    if (parentId) {
      node.parentId = parentId;
      node.extent = 'parent';
    }

    // IMPORTANT: Push parent node BEFORE children for ReactFlow to render correctly
    nodes.push(node);

    // Process child states
    let childX = 20;
    const childY = 40;
    let maxChildHeight = 0;
    let totalChildrenWidth = 0;

    if (safeStateData.states) {
      const childNames = Object.keys(safeStateData.states);
      childNames.forEach((childName) => {
        const childData = safeStateData.states ? safeStateData.states[childName] : null;
        const childResult = processState(childName, childData, nodeId, fullPath, childX, childY);

        childX += childResult.width + horizontalGap;
        totalChildrenWidth = childX - horizontalGap;
        maxChildHeight = Math.max(maxChildHeight, childResult.height);
      });
    }

    // Process decision children
    if (safeStateData.decisions) {
      processDecisions(safeStateData.decisions, nodeId, childX, childY);
    }

    // If no graphics, expand node to fit children
    if (!safeStateData.graphics && safeStateData.states) {
      const neededWidth = Math.max(defaultWidth, totalChildrenWidth + 40);
      const neededHeight = Math.max(defaultHeight, maxChildHeight + childY + 20);
      node.style = { width: neededWidth, height: neededHeight };
      width = neededWidth;
      height = neededHeight;
    }

    return { width, height };
  }

  // Process decisions dictionary and create decision nodes
  function processDecisions(
    decisions: Record<string, YamlDecisionTransition[] | YamlDecision>,
    parentId: string | undefined,
    autoLayoutX: number,
    autoLayoutY: number
  ) {
    let dx = autoLayoutX;
    Object.keys(decisions).forEach(decisionName => {
      const decisionData = decisions[decisionName];
      const nodeId = `node_${nodeIdCounter++}`;
      decisionNameToIdMap.set(decisionName, nodeId);

      let x = dx;
      let y = autoLayoutY;
      let size = defaultDecisionSize;

      // Check if it has graphics (object form with transitions + graphics)
      if (decisionData && !Array.isArray(decisionData) && 'transitions' in decisionData) {
        const d = decisionData as YamlDecision;
        if (d.graphics) {
          x = d.graphics.x;
          y = d.graphics.y;
          size = d.graphics.size || defaultDecisionSize;
        }
      }

      const node: Node<StateData> = {
        id: nodeId,
        type: 'decisionNode',
        position: { x, y },
        data: {
          label: decisionName,
          history: false,
          orthogonal: false,
          entry: '',
          exit: '',
          do: '',
        },
        style: { width: size, height: size },
      };

      if (parentId) {
        node.parentId = parentId;
        node.extent = 'parent';
      }

      nodes.push(node);
      dx += size + horizontalGap;
    });
  }

  // Process top-level states
  let topLevelX = 50;
  const topLevelY = 50;

  if (doc.states) {
    const stateNames = Object.keys(doc.states);
    stateNames.forEach(stateName => {
      const stateData = doc.states ? doc.states[stateName] : null;
      if (!stateData) return;
      const result = processState(stateName, stateData, undefined, '', topLevelX, topLevelY);
      topLevelX += result.width + horizontalGap;
    });
  }

  // Process root-level decisions
  if (doc.decisions) {
    processDecisions(doc.decisions, undefined, topLevelX, topLevelY);
  }

  // Resolve a target path (possibly relative) to an absolute path
  function resolveTargetPath(target: string, sourcePath: string): string {
    // Absolute path (leading /)
    if (target.startsWith('/')) {
      return target.substring(1);
    }

    // Self-reference
    if (target === '.') {
      return sourcePath;
    }

    // Starts with "./" — descendant of source
    if (target.startsWith('./')) {
      return sourcePath + '/' + target.substring(2);
    }

    // Starts with ".." — go up from source
    if (target.startsWith('..')) {
      const sourceParts = sourcePath.split('/');
      const targetSegments = target.split('/');
      let depth = sourceParts.length; // current position = source state
      let i = 0;
      while (i < targetSegments.length && targetSegments[i] === '..') {
        depth--;
        i++;
      }
      if (depth < 0) depth = 0;
      const baseParts = sourceParts.slice(0, depth);
      const rest = targetSegments.slice(i);
      return [...baseParts, ...rest].join('/');
    }

    // No prefix — treat as relative to parent (sibling scope)
    // "B" = sibling B, "A/B" = sibling A's child B
    const lastSlashIdx = sourcePath.lastIndexOf('/');
    if (lastSlashIdx >= 0) {
      const parentPath = sourcePath.substring(0, lastSlashIdx);
      return parentPath + '/' + target;
    }
    // Source is top-level, so sibling scope is also top-level
    return target;
  }

  // Resolve a transition target, handling @decision references
  function resolveTransitionTarget(rawTarget: string, sourcePath: string): string | undefined {
    if (!rawTarget) return undefined;

    // Decision reference: @decisionName
    if (rawTarget.startsWith('@')) {
      const decisionName = rawTarget.substring(1);
      return decisionNameToIdMap.get(decisionName);
    }

    // State path reference
    const targetPath = resolveTargetPath(rawTarget, sourcePath);
    return pathToIdMap.get(targetPath);
  }

  // Create an edge from a transition definition
  function createEdgeFromTransition(
    sourceId: string,
    targetId: string,
    transition: { to: string; guard?: string; action?: string; graphics?: { sourceHandle?: string; targetHandle?: string; controlPoints?: { x: number; y: number }[]; labelPosition?: number }; geometry?: { sourceHandle?: string; targetHandle?: string; controlPoints?: { x: number; y: number }[]; labelPosition?: number } }
  ) {
    const edgeGraphics = transition.graphics || transition.geometry;
    const edge: Edge = {
      id: `e${sourceId}-${targetId}-${edges.length}`,
      source: sourceId,
      target: targetId,
      type: 'spline',
      data: {
        controlPoints: edgeGraphics?.controlPoints || [],
        labelPosition: edgeGraphics?.labelPosition,
        label: '',
        guard: transition.guard || '',
        action: transition.action || '',
      },
      markerEnd: { type: MarkerType.ArrowClosed },
    };

    if (edgeGraphics?.sourceHandle) {
      edge.sourceHandle = edgeGraphics.sourceHandle;
    }
    if (edgeGraphics?.targetHandle) {
      edge.targetHandle = edgeGraphics.targetHandle;
    }

    edges.push(edge);
  }

  // Process transitions after all nodes are created
  function processTransitions(
    stateData: YamlState | null | undefined,
    sourcePath: string
  ) {
    if (!stateData) return;

    const sourceId = pathToIdMap.get(sourcePath);

    if (stateData.transitions && sourceId) {
      stateData.transitions.forEach(transition => {
        if (!transition.to) return;
        const targetId = resolveTransitionTarget(transition.to, sourcePath);
        if (sourceId && targetId) {
          createEdgeFromTransition(sourceId, targetId, transition);
        }
      });
    }

    // Process decision transitions
    if (stateData.decisions) {
      Object.keys(stateData.decisions).forEach(decisionName => {
        const decisionId = decisionNameToIdMap.get(decisionName);
        if (!decisionId) return;

        const decisionData = stateData.decisions![decisionName];
        const transitions: YamlDecisionTransition[] = Array.isArray(decisionData)
          ? decisionData
          : (decisionData as YamlDecision).transitions || [];

        transitions.forEach(transition => {
          if (!transition.to) return;
          // For decisions, use the parent state's path context for resolving relative paths
          const targetId = resolveTransitionTarget(transition.to, sourcePath);
          if (targetId) {
            createEdgeFromTransition(decisionId, targetId, transition);
          }
        });
      });
    }

    // Recurse into child states
    if (stateData.states) {
      Object.keys(stateData.states).forEach(childName => {
        const childPath = sourcePath ? `${sourcePath}/${childName}` : childName;
        const childData = stateData.states ? stateData.states[childName] : null;
        if (childData) {
          processTransitions(childData, childPath);
        }
      });
    }
  }

  // Process all transitions
  if (doc.states) {
    Object.keys(doc.states).forEach(stateName => {
      const stateData = doc.states ? doc.states[stateName] : null;
      if (stateData) {
        processTransitions(stateData, stateName);
      }
    });
  }

  // Process root-level decision transitions
  if (doc.decisions) {
    Object.keys(doc.decisions).forEach(decisionName => {
      const decisionId = decisionNameToIdMap.get(decisionName);
      if (!decisionId) return;

      const decisionData = doc.decisions![decisionName];
      const transitions: YamlDecisionTransition[] = Array.isArray(decisionData)
        ? decisionData
        : (decisionData as YamlDecision).transitions || [];

      transitions.forEach(transition => {
        if (!transition.to) return;
        // Root-level decisions use empty string as source path context
        const targetId = resolveTransitionTarget(transition.to, '');
        if (targetId) {
          createEdgeFromTransition(decisionId, targetId, transition);
        }
      });
    });
  }

  // Resolve initial state references (name -> node ID)
  function resolveInitialStates(
    stateData: YamlState | null | undefined,
    sourcePath: string
  ) {
    if (!stateData) return;

    const sourceId = pathToIdMap.get(sourcePath);
    const sourceNode = nodes.find(n => n.id === sourceId);

    if (sourceNode && stateData.initial && stateData.states) {
      // Find the child with the matching label
      const initialPath = `${sourcePath}/${stateData.initial}`;
      const initialId = pathToIdMap.get(initialPath);
      if (initialId) {
        sourceNode.data.initial = initialId;
      }
    }

    // Recurse into child states
    if (stateData.states) {
      Object.keys(stateData.states).forEach(childName => {
        const childPath = sourcePath ? `${sourcePath}/${childName}` : childName;
        const childData = stateData.states ? stateData.states[childName] : null;
        if (childData) {
          resolveInitialStates(childData, childPath);
        }
      });
    }
  }

  // Resolve all initial state references
  if (doc.states) {
    Object.keys(doc.states).forEach(stateName => {
      const stateData = doc.states ? doc.states[stateName] : null;
      if (stateData) {
        resolveInitialStates(stateData, stateName);
      }
    });
  }

  // Resolve root initial state (name -> node ID)
  let rootInitialId: string | undefined;
  if (doc.initial) {
    rootInitialId = pathToIdMap.get(doc.initial);
  }

  // Extract machine properties
  const machineProperties: MachineProperties = {
    language: doc.language || '',
    includes: doc.includes || '',
    context: doc.context || '',
    context_init: doc.context_init || '',
    entry: doc.entry || '',
    exit: doc.exit || '',
    do: doc.do || '',
    hooks: {
      entry: doc.hooks?.entry || '',
      exit: doc.hooks?.exit || '',
      do: doc.hooks?.do || '',
      transition: doc.hooks?.transition || '',
    },
    initial: rootInitialId,
    initialMarkerPos: doc.graphics?.initialMarkerPos,
    initialMarkerSize: doc.graphics?.initialMarkerSize,
    historyMarkerPos: doc.graphics?.historyMarkerPos,
    historyMarkerSize: doc.graphics?.historyMarkerSize,
  };

  // Default root history marker position if history=true but no geometry
  if ((doc.history || false) && !machineProperties.historyMarkerPos) {
    machineProperties.historyMarkerPos = { x: 20, y: 20 };
    machineProperties.historyMarkerSize = 20;
  }

  return {
    nodes,
    edges,
    rootHistory: doc.history || false,
    machineProperties,
  };
}
