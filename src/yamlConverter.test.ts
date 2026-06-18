import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
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
  sigilizePseudoRef,
  stripPseudoSigil,
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

function decisionNode(id: string, label: string, parentId?: string): Node {
  return {
    id,
    type: 'decisionNode',
    position: { x: 10, y: 10 },
    data: { label, history: false, orthogonal: false, entry: '', exit: '', do: '' },
    style: { width: 15, height: 15 },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  };
}

function andNode(id: string, label: string, parentId?: string): Node {
  return {
    id,
    type: 'decisionNode',
    position: { x: 10, y: 10 },
    data: { label, isAnd: true, history: false, orthogonal: false, entry: '', exit: '', do: '' },
    style: { width: 15, height: 15 },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseYaml(y: string): any {
  return yaml.load(y);
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

// ---------------------------------------------------------------------------
// Sigil helpers
// ---------------------------------------------------------------------------

describe('sigilizePseudoRef / stripPseudoSigil', () => {
  const cases: [string, string][] = [
    ['D1', '@D1'],
    ['./Child/D2', './Child/@D2'],
    ['../Sib/A3', '../Sib/@A3'],
    ['/Top/Sub/D4', '/Top/Sub/@D4'],
    ['/D4', '/@D4'],
  ];

  it.each(cases)('sigilizes %s -> %s', (rel, ref) => {
    expect(sigilizePseudoRef(rel)).toBe(ref);
  });

  it.each(cases)('strips %s back from its ref', (rel, ref) => {
    expect(stripPseudoSigil(ref)).toBe(rel);
  });

  it('strip(sigilize(x)) round-trips for every form', () => {
    cases.forEach(([rel]) => {
      expect(stripPseudoSigil(sigilizePseudoRef(rel))).toBe(rel);
    });
  });

  it('returns undefined for a non-sigilled final segment', () => {
    expect(stripPseudoSigil('./Child/D2')).toBeUndefined();
    expect(stripPseudoSigil('D1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Hierarchical pseudo-state references (0.6.0)
// ---------------------------------------------------------------------------

describe('hierarchical pseudo-state references (0.6.0)', () => {
  // --- Export: the emitted `to` ref string ---

  it('same-container decision emits a bare @D1', () => {
    const nodes = [stateNode('a', 'A'), decisionNode('d1', 'D1')];
    const y = convertToYaml(nodes, [edge('e', 'a', 'd1')], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    expect(doc.states.A.transitions[0].to).toBe('@D1');
  });

  it('descendant decision emits ./Child/@D2', () => {
    const nodes = [
      stateNode('p', 'P'),
      stateNode('c', 'Child', 'p'),
      decisionNode('d2', 'D2', 'c'),
    ];
    const y = convertToYaml(nodes, [edge('e', 'p', 'd2')], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    expect(doc.states.P.transitions[0].to).toBe('./Child/@D2');
  });

  it('sibling-subtree decision emits ../Sib/@D3 (sigil on final segment)', () => {
    const nodes = [
      stateNode('top', 'Top'),
      stateNode('src', 'Src', 'top'),
      stateNode('sib', 'Sib', 'top'),
      decisionNode('d3', 'D3', 'sib'),
    ];
    const y = convertToYaml(nodes, [edge('e', 'src', 'd3')], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    expect(doc.states.Top.states.Src.transitions[0].to).toBe('../Sib/@D3');
  });

  it('cross-subtree decision emits an absolute /Top/Sub/@D4', () => {
    const nodes = [
      stateNode('ta', 'TopA'),
      stateNode('sa', 'Sub', 'ta'),
      stateNode('tb', 'TopB'),
      stateNode('sb', 'SubB', 'tb'),
      decisionNode('d4', 'D4', 'sb'),
    ];
    const y = convertToYaml(nodes, [edge('e', 'sa', 'd4')], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    expect(doc.states.TopA.states.Sub.transitions[0].to).toBe('/TopB/SubB/@D4');
  });

  it('root-level decision from a deep state emits single-segment /@D5', () => {
    const nodes = [
      stateNode('ta', 'TopA'),
      stateNode('sa', 'Sub', 'ta'),
      decisionNode('d5', 'D5'),
    ];
    const y = convertToYaml(nodes, [edge('e', 'sa', 'd5')], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    expect(doc.states.TopA.states.Sub.transitions[0].to).toBe('/@D5');
  });

  // --- Round-trip ---

  it('modern round-trip reconnects a descendant-decision edge to the right node', () => {
    const nodes = [
      stateNode('p', 'P'),
      stateNode('c', 'Child', 'p'),
      decisionNode('d2', 'D2', 'c'),
    ];
    const y = convertToYaml(nodes, [edge('e', 'p', 'd2')], false, false, defaultMachineProperties);
    // Export tags 0.6.0, so import uses the hierarchical resolver.
    expect(detectSmbVersion(y)).toBe(SMB_FORMAT_VERSION);
    const { nodes: out, edges: outEdges } = convertFromYaml(y);
    const p = out.find(n => n.data.label === 'P')!;
    const d2 = out.find(n => n.type === 'decisionNode' && n.data.label === 'D2')!;
    expect(outEdges.some(e => e.source === p.id && e.target === d2.id)).toBe(true);
  });

  it('two containers with the same local decision name resolve independently', () => {
    // P and Q each hold a child decision named "D1"; each is fed by its own local
    // source and points to its own local target. Under the old flat global map the
    // two D1s collided; the hierarchical resolver keeps them distinct.
    const nodes = [
      stateNode('p', 'P'),
      stateNode('ps', 'Sp', 'p'),
      stateNode('pt', 'Tp', 'p'),
      decisionNode('pd', 'D1', 'p'),
      stateNode('q', 'Q'),
      stateNode('qs', 'Sq', 'q'),
      stateNode('qt', 'Tq', 'q'),
      decisionNode('qd', 'D1', 'q'),
    ];
    const edges = [
      edge('e1', 'ps', 'pd'), // Sp -> P/D1
      edge('e2', 'pd', 'pt'), // P/D1 -> Tp
      edge('e3', 'qs', 'qd'), // Sq -> Q/D1
      edge('e4', 'qd', 'qt'), // Q/D1 -> Tq
    ];
    const y = convertToYaml(nodes, edges, false, false, defaultMachineProperties);
    const { nodes: out, edges: outEdges } = convertFromYaml(y);

    const pNode = out.find(n => n.data.label === 'P')!;
    const qNode = out.find(n => n.data.label === 'Q')!;
    const pD1 = out.find(n => n.type === 'decisionNode' && n.data.label === 'D1' && n.parentId === pNode.id)!;
    const qD1 = out.find(n => n.type === 'decisionNode' && n.data.label === 'D1' && n.parentId === qNode.id)!;
    expect(pD1.id).not.toBe(qD1.id);

    const sp = out.find(n => n.data.label === 'Sp')!;
    const tp = out.find(n => n.data.label === 'Tp')!;
    const sq = out.find(n => n.data.label === 'Sq')!;
    const tq = out.find(n => n.data.label === 'Tq')!;

    // Incoming: each source feeds the decision in its OWN container.
    expect(outEdges.some(e => e.source === sp.id && e.target === pD1.id)).toBe(true);
    expect(outEdges.some(e => e.source === sq.id && e.target === qD1.id)).toBe(true);
    // Outgoing (own-id lookup): each decision points to its OWN container's target.
    expect(outEdges.some(e => e.source === pD1.id && e.target === tp.id)).toBe(true);
    expect(outEdges.some(e => e.source === qD1.id && e.target === tq.id)).toBe(true);
  });

  // --- Legacy back-compat ---

  it('legacy (< 0.6.0) file resolves a flat global @D1', () => {
    const legacy = [
      'SM-builder-version: "0.5.6"',
      'states:',
      '  A:',
      '    transitions:',
      '      - to: "@D1"',
      'decisions:',
      '  D1:',
      '    - to: A',
      '',
    ].join('\n');
    const { nodes, edges } = convertFromYaml(legacy);
    const a = nodes.find(n => n.data.label === 'A')!;
    const d1 = nodes.find(n => n.type === 'decisionNode' && n.data.label === 'D1')!;
    expect(edges.some(e => e.source === a.id && e.target === d1.id)).toBe(true);
  });

  it('decision-to-decision across containers emits/round-trips a cross-subtree ref', () => {
    // A decision in container P targets a decision in container Q. The ref is emitted
    // relative to the SOURCE decision's scope (P/Dp) and must reconnect on import.
    const nodes = [
      stateNode('p', 'P'),
      decisionNode('dp', 'Dp', 'p'),
      stateNode('q', 'Q'),
      decisionNode('dq', 'Dq', 'q'),
    ];
    const y = convertToYaml(nodes, [edge('e', 'dp', 'dq')], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    // From P/Dp to Q/Dq: cross-subtree -> absolute, sigil on final segment.
    expect(doc.states.P.decisions.Dp[0].to).toBe('/Q/@Dq');

    const { nodes: out, edges: outEdges } = convertFromYaml(y);
    const dp = out.find(n => n.type === 'decisionNode' && n.data.label === 'Dp')!;
    const dq = out.find(n => n.type === 'decisionNode' && n.data.label === 'Dq')!;
    expect(outEdges.some(e => e.source === dp.id && e.target === dq.id)).toBe(true);
  });

  it('a 0.5.x file keeps flat refs and is not path-rewritten', () => {
    // 0.5.6 >= 0.4.0 so no legacy transition rewrite; 0.5.6 < 0.6.0 so flat @ refs.
    // "../Sibling" from A/B must stay a Unix-style sibling-of-A (modern path semantics),
    // and "@D1" must resolve via the flat global table.
    const v056 = [
      'SM-builder-version: "0.5.6"',
      'states:',
      '  A:',
      '    states:',
      '      B:',
      '        transitions:',
      '          - to: "@D1"',
      '          - to: ../Sibling',
      '  Sibling: {}',
      'decisions:',
      '  D1: []',
      '',
    ].join('\n');
    const { nodes, edges } = convertFromYaml(v056);
    const b = nodes.find(n => n.data.label === 'B')!;
    const d1 = nodes.find(n => n.type === 'decisionNode' && n.data.label === 'D1')!;
    const sibling = nodes.find(n => n.data.label === 'Sibling')!;
    // Flat @D1 resolves (global table), not the hierarchical "A/D1" which doesn't exist.
    expect(edges.some(e => e.source === b.id && e.target === d1.id)).toBe(true);
    // "../Sibling" is NOT rewritten: under modern semantics it means A/Sibling (absent),
    // so the edge is dropped — i.e. it does not reach the top-level Sibling.
    expect(edges.some(e => e.source === b.id && e.target === sibling.id)).toBe(false);
  });

  it('missing-version policy selects flat vs hierarchical @-resolution', () => {
    // One decision D1 exists, in container P. A source Q/Sq references "@D1".
    //  - legacy/flat: "@D1" is a global name -> resolves to P/D1 (cross-container).
    //  - modern/hierarchical: "@D1" means D1 in Sq's own container Q -> none -> dropped.
    const noVersion = [
      'states:',
      '  P:',
      '    decisions:',
      '      D1: []',
      '  Q:',
      '    states:',
      '      Sq:',
      '        transitions:',
      '          - to: "@D1"',
      '',
    ].join('\n');

    const legacy = convertFromYaml(noVersion, 'legacy');
    const sqL = legacy.nodes.find(n => n.data.label === 'Sq')!;
    const d1L = legacy.nodes.find(n => n.type === 'decisionNode' && n.data.label === 'D1')!;
    expect(legacy.edges.some(e => e.source === sqL.id && e.target === d1L.id)).toBe(true);

    const modern = convertFromYaml(noVersion, 'modern');
    const sqM = modern.nodes.find(n => n.data.label === 'Sq')!;
    expect(modern.edges.some(e => e.source === sqM.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AND nodes (ands: block)
// ---------------------------------------------------------------------------

describe('AND nodes (ands: block)', () => {
  it('exports a child AND under ands: (not decisions:)', () => {
    const nodes = [stateNode('p', 'P'), andNode('a1', 'A1', 'p')];
    const y = convertToYaml(nodes, [], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    expect(doc.states.P.ands).toBeDefined();
    expect(doc.states.P.ands.A1).toBeDefined();
    expect(doc.states.P.decisions).toBeUndefined();
  });

  it('exports a root-level AND under doc.ands', () => {
    const nodes = [andNode('a1', 'A1')];
    const y = convertToYaml(nodes, [], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    expect(doc.ands).toBeDefined();
    expect(doc.ands.A1).toBeDefined();
    expect(doc.decisions).toBeUndefined();
  });

  it('emits hierarchical @A1 refs for AND targets (same/descendant/absolute)', () => {
    // same container
    let nodes: Node[] = [stateNode('s', 'S'), andNode('a1', 'A1')];
    let y = convertToYaml(nodes, [edge('e', 's', 'a1')], false, false, defaultMachineProperties);
    expect(parseYaml(y).states.S.transitions[0].to).toBe('@A1');

    // descendant
    nodes = [stateNode('p', 'P'), stateNode('c', 'Child', 'p'), andNode('a1', 'A1', 'c')];
    y = convertToYaml(nodes, [edge('e', 'p', 'a1')], false, false, defaultMachineProperties);
    expect(parseYaml(y).states.P.transitions[0].to).toBe('./Child/@A1');

    // absolute (cross-subtree)
    nodes = [
      stateNode('ta', 'TopA'), stateNode('sa', 'Sub', 'ta'),
      stateNode('tb', 'TopB'), stateNode('sb', 'SubB', 'tb'), andNode('a1', 'A1', 'sb'),
    ];
    y = convertToYaml(nodes, [edge('e', 'sa', 'a1')], false, false, defaultMachineProperties);
    expect(parseYaml(y).states.TopA.states.Sub.transitions[0].to).toBe('/TopB/SubB/@A1');
  });

  it('round-trips an AND node (type decisionNode + isAnd) with its incoming edge', () => {
    const nodes = [stateNode('p', 'P'), stateNode('c', 'Child', 'p'), andNode('a1', 'A1', 'c')];
    const y = convertToYaml(nodes, [edge('e', 'p', 'a1')], false, false, defaultMachineProperties);
    const { nodes: out, edges: outEdges } = convertFromYaml(y);
    const a1 = out.find(n => n.type === 'decisionNode' && n.data.label === 'A1')!;
    expect(a1.data.isAnd).toBe(true);
    const p = out.find(n => n.data.label === 'P')!;
    expect(outEdges.some(e => e.source === p.id && e.target === a1.id)).toBe(true);
  });

  it('round-trips andGraphics position/size', () => {
    const a1 = andNode('a1', 'A1');
    a1.position = { x: 222, y: 333 };
    a1.style = { width: 18, height: 18 };
    const y = convertToYaml([a1], [], false, true, defaultMachineProperties);
    expect(parseYaml(y).andGraphics.A1).toMatchObject({ x: 222, y: 333, size: 18 });
    const { nodes: out } = convertFromYaml(y);
    const outA1 = out.find(n => n.type === 'decisionNode' && n.data.label === 'A1')!;
    expect(outA1.position).toEqual({ x: 222, y: 333 });
    expect(outA1.style?.width).toBe(18);
  });

  it('handles a decision and an AND in the same container, both resolving to distinct nodes', () => {
    const nodes = [
      stateNode('p', 'P'),
      stateNode('s', 'S', 'p'),
      decisionNode('d1', 'D1', 'p'),
      andNode('a1', 'A1', 'p'),
    ];
    // S -> D1 and S -> A1
    const y = convertToYaml(nodes, [edge('e1', 's', 'd1'), edge('e2', 's', 'a1')], false, false, defaultMachineProperties);
    const doc = parseYaml(y);
    expect(doc.states.P.decisions.D1).toBeDefined();
    expect(doc.states.P.ands.A1).toBeDefined();
    const tos = doc.states.P.states.S.transitions.map((t: { to: string }) => t.to).sort();
    expect(tos).toEqual(['@A1', '@D1']);

    const { nodes: out, edges: outEdges } = convertFromYaml(y);
    const s = out.find(n => n.data.label === 'S')!;
    const d1 = out.find(n => n.type === 'decisionNode' && n.data.label === 'D1')!;
    const a1 = out.find(n => n.type === 'decisionNode' && n.data.label === 'A1')!;
    expect(d1.id).not.toBe(a1.id);
    expect(a1.data.isAnd).toBe(true);
    expect(d1.data.isAnd).toBeFalsy();
    expect(outEdges.some(e => e.source === s.id && e.target === d1.id)).toBe(true);
    expect(outEdges.some(e => e.source === s.id && e.target === a1.id)).toBe(true);
  });

  it('round-trips an AND branch transition (outgoing) to a state', () => {
    const nodes = [stateNode('p', 'P'), stateNode('t', 'T', 'p'), andNode('a1', 'A1', 'p')];
    const y = convertToYaml(nodes, [edge('e', 'a1', 't', 'g')], false, false, defaultMachineProperties);
    expect(parseYaml(y).states.P.ands.A1[0].to).toBe('T');
    const { nodes: out, edges: outEdges } = convertFromYaml(y);
    const a1 = out.find(n => n.type === 'decisionNode' && n.data.label === 'A1')!;
    const t = out.find(n => n.data.label === 'T')!;
    expect(outEdges.some(e => e.source === a1.id && e.target === t.id)).toBe(true);
  });
});
