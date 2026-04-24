import { describe, it, expect } from 'vitest';
import { Node, Edge } from 'reactflow';
import {
  convertToYaml,
  convertFromYaml,
  computeRelativePath,
  defaultMachineProperties,
  rewriteLegacyTarget,
  applyLegacyTransitionRewrite,
  detectSmbVersion,
  SMB_FORMAT_VERSION,
} from './yamlConverter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateNode(id: string, label: string, parentId?: string, w = 150, h = 50): Node {
  return {
    id,
    type: 'stateNode',
    position: { x: 10, y: 10 },
    data: { label, history: false, orthogonal: false, entry: '', exit: '', do: '', annotation: '' },
    style: { width: w, height: h },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  };
}

function edge(id: string, source: string, target: string, guard = ''): Edge {
  return {
    id,
    source,
    target,
    data: { guard, action: '', event: '' },
  };
}

// ---------------------------------------------------------------------------
// computeRelativePath
// ---------------------------------------------------------------------------

describe('computeRelativePath', () => {
  it('self returns "."', () => {
    expect(computeRelativePath('A', 'A')).toBe('.');
  });

  it('sibling returns just the target name', () => {
    expect(computeRelativePath('A', 'B')).toBe('B');
  });

  it('nested sibling (same parent)', () => {
    expect(computeRelativePath('Parent/A', 'Parent/B')).toBe('B');
  });

  it('descendant uses "./" prefix', () => {
    expect(computeRelativePath('Parent', 'Parent/Child')).toBe('./Child');
    expect(computeRelativePath('A', 'A/B/C')).toBe('./B/C');
  });

  it('ancestor uses ".." notation', () => {
    expect(computeRelativePath('A/B', 'A')).toBe('..');
    expect(computeRelativePath('A/B/C', 'A')).toBe('../..');
  });

  it('cross-subtree uses absolute "/" path', () => {
    expect(computeRelativePath('A/X', 'B/Y')).toBe('/B/Y');
  });

  it('sibling-of-source is emitted as bare name', () => {
    // Source = A/Child, Target = A/Sibling (same immediate parent)
    expect(computeRelativePath('A/Child', 'A/Sibling')).toBe('Sibling');
  });

  it('uncle (parent\'s sibling) emits "../../name" under Unix-style', () => {
    // Source = A/B/C, Target = A/Uncle — uncle is 2 levels up from C
    expect(computeRelativePath('A/B/C', 'A/Uncle')).toBe('../../Uncle');
  });

  it('sibling\'s descendant emits "../X/Y" under Unix-style', () => {
    // Source = A/B, Target = A/X/Y
    expect(computeRelativePath('A/B', 'A/X/Y')).toBe('../X/Y');
  });
});

// ---------------------------------------------------------------------------
// Legacy target rewrite (< 0.4.0 → 0.4.0)
// ---------------------------------------------------------------------------

describe('rewriteLegacyTarget', () => {
  it('leaves bare names untouched', () => {
    expect(rewriteLegacyTarget('X')).toBe('X');
    expect(rewriteLegacyTarget('X/Y')).toBe('X/Y');
  });

  it('leaves absolute, self, and descendant paths untouched', () => {
    expect(rewriteLegacyTarget('/Top/Child')).toBe('/Top/Child');
    expect(rewriteLegacyTarget('.')).toBe('.');
    expect(rewriteLegacyTarget('./Child')).toBe('./Child');
  });

  it('leaves @decision refs untouched', () => {
    expect(rewriteLegacyTarget('@D1')).toBe('@D1');
  });

  it('leaves pure ancestor chains untouched', () => {
    expect(rewriteLegacyTarget('..')).toBe('..');
    expect(rewriteLegacyTarget('../..')).toBe('../..');
    expect(rewriteLegacyTarget('../../..')).toBe('../../..');
  });

  it('prepends one ".." when ".." is followed by a name', () => {
    expect(rewriteLegacyTarget('../x')).toBe('../../x');
    expect(rewriteLegacyTarget('../../x')).toBe('../../../x');
    expect(rewriteLegacyTarget('../x/y')).toBe('../../x/y');
  });
});

describe('applyLegacyTransitionRewrite', () => {
  it('rewrites nested state + decision transition targets', () => {
    const doc = {
      states: {
        Top: {
          states: {
            A: {
              transitions: [{ to: '../x' }, { to: 'sib' }, { to: '.' }],
              decisions: {
                D1: [{ to: '../../y' }, { to: '@Other' }],
              },
            },
          },
        },
      },
    };
    applyLegacyTransitionRewrite(doc as unknown as Parameters<typeof applyLegacyTransitionRewrite>[0]);
    // @ts-expect-error: traversing for assertion
    expect(doc.states.Top.states.A.transitions[0].to).toBe('../../x');
    // @ts-expect-error
    expect(doc.states.Top.states.A.transitions[1].to).toBe('sib');
    // @ts-expect-error
    expect(doc.states.Top.states.A.transitions[2].to).toBe('.');
    // @ts-expect-error
    expect(doc.states.Top.states.A.decisions.D1[0].to).toBe('../../../y');
    // @ts-expect-error
    expect(doc.states.Top.states.A.decisions.D1[1].to).toBe('@Other');
  });
});

describe('detectSmbVersion', () => {
  it('returns undefined for missing key', () => {
    expect(detectSmbVersion('states:\n  A: {}\n')).toBeUndefined();
  });

  it('reads the version from the document', () => {
    expect(detectSmbVersion('SM-builder-version: "0.4.0"\nstates: {}\n')).toBe('0.4.0');
  });

  it('reads the version from a document saved by convertToYaml', () => {
    const y = convertToYaml([], [], false, false, defaultMachineProperties);
    expect(detectSmbVersion(y)).toBe(SMB_FORMAT_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Legacy file interpretation (round-trip via transform)
// ---------------------------------------------------------------------------

describe('legacy file transition interpretation', () => {
  // A legacy (pre-0.4.0) file where A/B has a transition to "../Sibling"
  // meant "uncle" (sibling of A), i.e. top-level state Sibling.
  const legacyYaml = [
    'states:',
    '  A:',
    '    states:',
    '      B:',
    '        transitions:',
    '          - to: ../Sibling',
    '  Sibling: {}',
    '',
  ].join('\n');

  it('treating missing version as legacy resolves "../Sibling" from A/B to top-level Sibling', () => {
    const { nodes, edges } = convertFromYaml(legacyYaml, 'legacy');
    const b = nodes.find(n => n.data.label === 'B')!;
    const sibling = nodes.find(n => n.data.label === 'Sibling')!;
    expect(sibling.parentId).toBeUndefined(); // top-level
    const e = edges.find(e => e.source === b.id)!;
    expect(e.target).toBe(sibling.id);
  });

  it('treating missing version as modern resolves "../Sibling" from A/B to a sibling under A', () => {
    // Under modern semantics, "../Sibling" from A/B is A/Sibling — which doesn't exist here,
    // so the edge is dropped.
    const { nodes, edges } = convertFromYaml(legacyYaml, 'modern');
    const b = nodes.find(n => n.data.label === 'B')!;
    const hasEdgeFromB = edges.some(e => e.source === b.id);
    expect(hasEdgeFromB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// convertToYaml / convertFromYaml — round-trip tests
// ---------------------------------------------------------------------------

describe('YAML round-trip', () => {
  it('single flat state preserves label', () => {
    const nodes = [stateNode('n1', 'Idle')];
    const yaml = convertToYaml(nodes, [], false, false, defaultMachineProperties);
    const { nodes: out } = convertFromYaml(yaml);
    expect(out.some(n => n.data.label === 'Idle')).toBe(true);
  });

  it('two sibling states both survive the round-trip', () => {
    const nodes = [stateNode('n1', 'Idle'), stateNode('n2', 'Running')];
    const yaml = convertToYaml(nodes, [], false, false, defaultMachineProperties);
    const { nodes: out } = convertFromYaml(yaml);
    const labels = out.map(n => n.data.label).sort();
    expect(labels).toContain('Idle');
    expect(labels).toContain('Running');
  });

  it('nested state preserves parent→child hierarchy', () => {
    const parent = stateNode('p', 'Parent');
    const child = stateNode('c', 'Child', 'p');
    const yaml = convertToYaml([parent, child], [], false, false, defaultMachineProperties);
    const { nodes: out } = convertFromYaml(yaml);

    const parentOut = out.find(n => n.data.label === 'Parent');
    const childOut = out.find(n => n.data.label === 'Child');
    expect(parentOut).toBeDefined();
    expect(childOut).toBeDefined();
    expect(childOut!.parentId).toBe(parentOut!.id);
  });

  it('transition between siblings round-trips', () => {
    const nodes = [stateNode('n1', 'Idle'), stateNode('n2', 'Running')];
    const edges = [edge('e1', 'n1', 'n2', 'start')];
    const yaml = convertToYaml(nodes, edges, false, false, defaultMachineProperties);
    const { edges: outEdges } = convertFromYaml(yaml);

    expect(outEdges.length).toBe(1);
    expect(outEdges[0].data?.guard).toBe('start');
  });

  it('state entry/exit/do actions are preserved', () => {
    const n = stateNode('n1', 'Active');
    n.data.entry = 'enter_action()';
    n.data.exit = 'exit_action()';
    n.data.do = 'do_action()';
    const yaml = convertToYaml([n], [], false, false, defaultMachineProperties);
    const { nodes: out } = convertFromYaml(yaml);
    const active = out.find(n => n.data.label === 'Active')!;
    expect(active.data.entry).toBe('enter_action()');
    expect(active.data.exit).toBe('exit_action()');
    expect(active.data.do).toBe('do_action()');
  });

  it('machine properties context survives round-trip', () => {
    const mp = { ...defaultMachineProperties, context: 'int count = 0;' };
    const yaml = convertToYaml([stateNode('n1', 'S')], [], false, false, mp);
    const { machineProperties: out } = convertFromYaml(yaml);
    expect(out.context).toBe('int count = 0;');
  });

  it('rootHistory flag is preserved', () => {
    const yaml = convertToYaml([stateNode('n1', 'S')], [], true, false, defaultMachineProperties);
    const { rootHistory } = convertFromYaml(yaml);
    expect(rootHistory).toBe(true);
  });

  it('3-level nesting preserves all labels and parentage', () => {
    const root = stateNode('r', 'Root');
    const child = stateNode('c', 'Child', 'r');
    const grandchild = stateNode('g', 'Grandchild', 'c');
    const yaml = convertToYaml([root, child, grandchild], [], false, false, defaultMachineProperties);
    const { nodes: out } = convertFromYaml(yaml);

    const rootOut = out.find(n => n.data.label === 'Root')!;
    const childOut = out.find(n => n.data.label === 'Child')!;
    const gcOut = out.find(n => n.data.label === 'Grandchild')!;

    expect(rootOut.parentId).toBeUndefined();
    expect(childOut.parentId).toBe(rootOut.id);
    expect(gcOut.parentId).toBe(childOut.id);
  });
});
