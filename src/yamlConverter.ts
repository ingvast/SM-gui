import yaml from 'js-yaml';
import { Node, Edge, MarkerType } from 'reactflow';

interface StateData {
  label: string;
  history: boolean;
  orthogonal: boolean;
  entry: string;
  exit: string;
  do: string;
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

interface YamlState {
  entry?: string;
  exit?: string;
  do?: string;
  history?: boolean;
  orthogonal?: boolean;
  states?: Record<string, YamlState>;
  transitions?: YamlTransition[];
  graphics?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface YamlTransition {
  to: string;
  guard?: string;
  action?: string;
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
  states?: Record<string, YamlState>;
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

export function convertToYaml(
  nodes: Node<StateData>[],
  edges: Edge[],
  rootHistory: boolean,
  includeGraphics: boolean,
  machineProperties?: MachineProperties
): string {
  const pathMap = buildNodePathMap(nodes);

  // Group edges by source node
  const edgesBySource = new Map<string, Edge[]>();
  edges.forEach(edge => {
    const list = edgesBySource.get(edge.source) || [];
    list.push(edge);
    edgesBySource.set(edge.source, list);
  });

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
    }

    // Add child states
    const children = nodes.filter(n => n.parentId === node.id);
    if (children.length > 0) {
      const states: Record<string, YamlState> = {};
      children.forEach(child => {
        states[child.data.label] = buildStateObj(child);
      });
      stateObj.states = states;
    }

    // Add transitions
    const nodeEdges = edgesBySource.get(node.id) || [];
    if (nodeEdges.length > 0) {
      stateObj.transitions = nodeEdges.map(edge => {
        const targetPath = pathMap.get(edge.target);
        const transition: YamlTransition = {
          to: targetPath || edge.target,
        };
        // Include edge data if present (for future guard/action support)
        if ((edge.data as { guard?: string })?.guard) {
          transition.guard = (edge.data as { guard: string }).guard;
        }
        if ((edge.data as { action?: string })?.action) {
          transition.action = (edge.data as { action: string }).action;
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
  }

  // 8. Get top-level states (no parent)
  const topLevelNodes = nodes.filter(n => !n.parentId);
  if (topLevelNodes.length > 0) {
    const states: Record<string, YamlState> = {};
    topLevelNodes.forEach(node => {
      states[node.data.label] = buildStateObj(node);
    });
    doc.states = states;
  }

  return yaml.dump(doc, { lineWidth: -1, noRefs: true });
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

  // Auto-layout settings
  const defaultWidth = 150;
  const defaultHeight = 50;
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
      },
      style: { width, height },
    };

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

  // Process transitions after all nodes are created
  function processTransitions(
    stateData: YamlState | null | undefined,
    sourcePath: string
  ) {
    if (!stateData) return;

    const sourceId = pathToIdMap.get(sourcePath);

    if (stateData.transitions && sourceId) {
      stateData.transitions.forEach(transition => {
        let targetPath = transition.to;

        // Skip transitions with null/undefined target (e.g., to: null)
        if (!targetPath) return;

        // Handle relative paths (state name only) vs absolute paths
        if (!targetPath.includes('/')) {
          // It might be a sibling or absolute top-level state
          // First try to find as absolute path
          let resolvedId = pathToIdMap.get(targetPath);

          // If not found, try as sibling (same parent)
          if (!resolvedId) {
            const lastSlashIdx = sourcePath.lastIndexOf('/');
            if (lastSlashIdx >= 0) {
              const parentPath = sourcePath.substring(0, lastSlashIdx);
              const siblingPath = `${parentPath}/${targetPath}`;
              resolvedId = pathToIdMap.get(siblingPath);
              if (resolvedId) {
                targetPath = siblingPath;
              }
            }
          }
        }

        const targetId = pathToIdMap.get(targetPath);

        if (sourceId && targetId) {
          const edge: Edge = {
            id: `e${sourceId}-${targetId}`,
            source: sourceId,
            target: targetId,
            type: 'spline',
            data: {
              controlPoints: [],
              label: '',
              guard: transition.guard || '',
              action: transition.action || '',
            },
            markerEnd: { type: MarkerType.ArrowClosed },
          };

          edges.push(edge);
        }
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
  };

  return {
    nodes,
    edges,
    rootHistory: doc.history || false,
    machineProperties,
  };
}
