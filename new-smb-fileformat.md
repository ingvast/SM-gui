# SMB file-format changes (for the compiler)

This documents the changes to the `.smb` YAML format introduced after **0.5.6**.
Two related changes:

1. A new **`ands:`** pseudo-state block (AND / join nodes).
2. **Unified, hierarchical referencing** for pseudo-states (decisions *and* ands),
   replacing the old flat global decision namespace.

Both are gated on `SM-builder-version` so old files keep working.

---

## 1. Version gating

The format already carries a top-level `SM-builder-version` field (string, semver).
There is precedent: transition-path semantics changed at **0.4.0**, and files below
that are rewritten on load (`MODERN_TRANSITION_MIN_VERSION` in `yamlConverter.ts`).

These changes introduce a new threshold — call it **`PSEUDOSTATE_REF_MIN_VERSION`**
(target: **0.6.0**, to match the version bump that ships it).

Interpretation by version:

| `SM-builder-version`        | `@...` references resolve as | `ands:` block |
|-----------------------------|------------------------------|---------------|
| `< 0.6.0` (or absent→legacy)| flat global name lookup      | not present   |
| `>= 0.6.0`                  | hierarchical relative path   | supported     |

The compiler should branch on this single field, exactly as the editor already
does for the 0.4.0 transition-path change.

---

## 2. The `ands:` block (AND / join nodes)

### Structure — identical to `decisions:`

An `and` is a pseudo-state, stored in an `ands:` map at **any state level and at
root**, alongside `states:` and `decisions:`. Each entry is a list of outgoing
branch transitions — the *same shape* as a decision:

```yaml
ands:
  A1:
    - to: "SomeState"        # relative path (or @-pseudo-state ref)
      guard: "optional"
      action: "optional"
    - to: "Other"            # multiple branches allowed (decision-like)
      guard: "optional"
```

Optional graphics map mirrors `decisionGraphics`:

```yaml
andGraphics:
  A1: { x: 120, y: 80, size: 15 }
```

### Where the inputs live

Just like decisions, the **incoming** edges are *not* listed inside the block.
A source state that feeds the AND simply targets it in its own `transitions:`:

```yaml
states:
  RegionA:
    states:
      X:
        transitions:
          - to: "@A1"        # X feeds into AND A1
  RegionB:
    states:
      Y:
        transitions:
          - to: "@A1"        # Y feeds into AND A1
```

So both the incoming sources and the outgoing branches are expressed exactly as
they are for decisions. The block name (`decisions:` vs `ands:`) is the *only*
structural difference.

### Semantics (this is the compiler's job)

The editor does **not** interpret AND semantics; it only carries the structure.
The intended meaning, for the compiler:

- **Decision** (`decisions:`): reached when **any** incoming transition fires
  (disjunction of inputs); then the outgoing branch guards are evaluated in order.
- **AND** (`ands:`): active only when **all** incoming conditions hold
  (conjunction of inputs — e.g. all source states simultaneously active, plus any
  per-incoming-edge guard); then the outgoing branch guards are evaluated in order.

The **outgoing / branch side is identical** for both. The *only* difference is how
multiple **incoming** edges combine: OR for decisions, AND for ands.

Primary use cases:
- **Join across orthogonal regions** — leave an orthogonal state when several
  regions have each reached a specific substate.
- **General guard conjunction** — replaces the old pattern of *chaining decisions*
  to AND several guards together; can be used in any compound state, not just
  orthogonal ones.

---

## 3. Unified hierarchical pseudo-state referencing

### The change

Previously a decision was always referenced by a **flat global** name: `to: "@D1"`,
resolved against one global table. `D1` therefore had to be globally unique, and a
reference gave no hint where the target actually lived.

Now pseudo-states (decisions and ands) are **path-addressed and locally scoped,
just like states** — but keep the `@` sigil so they never collide with real states.

- A pseudo-state name only needs to be unique **within its container**.
- References use the **same relative-path grammar as state transitions**
  (Unix-style: bare sibling name, `.`, `./child`, `..`, `../sibling`, `/absolute`),
  with the **sigil on the final (pseudo-state) segment**:

| Reference            | Meaning                                                    |
|----------------------|------------------------------------------------------------|
| `@D1`                | decision `D1` in the *same container* as the source        |
| `@A1`                | and `A1` in the same container                             |
| `./Child/@D2`        | decision `D2` inside descendant `Child`                    |
| `../Sibling/@A3`     | and `A3` inside a sibling state                            |
| `/Top/Sub/@D4`       | absolute path to decision `D4`                             |

### Sigil and naming convention

- `@` marks a reference as a **pseudo-state** (not a real state) — this is what
  prevents name clashes with sibling states.
- By naming convention the editor names decisions `D<n>` and ands `A<n>`, so
  references read `@D1`, `@A1`. The **leading letter is convention, not the
  authority**: the block a pseudo-state is *defined* in (`decisions:` vs `ands:`)
  determines its kind. The compiler should resolve by path + block membership, not
  by parsing the `D`/`A` letter.

---

## Notes / decisions to be aware of

- **Local uniqueness across both kinds.** Within one container, pseudo-state names
  must be unique across `decisions:` *and* `ands:` together, because both are
  referenced through the shared `@` sigil (`@X1` must be unambiguous).

- **No collision with real states.** Because of the `@` sigil, a decision/and and a
  sibling state may share a bare name without ambiguity; the sigil disambiguates.

- **Backward compatibility.** Files `< 0.6.0`: `@name` is a flat global lookup and
  there is no `ands:` block. The compiler must keep the old resolver for those,
  selected purely by `SM-builder-version`. There is *no in-place rewrite* of the
  flat→hierarchical change (unlike the 0.4.0 path rewrite) because a flat name
  cannot always be mechanically relocated to a path without the full node graph —
  resolve-by-version instead.

- **The old half-and-half behavior is gone.** Previously a decision-as-*source* was
  already scoped hierarchically (`container_path + name`) while a decision-as-
  *target* was flat `@name`. Under 0.6.0 both directions use the hierarchical
  scheme consistently.

- **Cross-branch references are now expressible.** A transition can target a
  decision/and in another part of the tree explicitly (`../Other/@D2`) — previously
  only the flat global name was possible.

- **Self-loops.** Decisions cannot be their own source; the same restriction applies
  to ands.

- **Phoenix export is unaffected.** That format is a restricted one-level pseudo-
  hierarchy; it already skips decisions and will likewise skip ands. Nothing to do.

- **`andGraphics` is editor metadata.** Like `decisionGraphics`, it is layout-only
  and can be ignored by the compiler.

---

## Open / to confirm

- Exact placement of the sigil in multi-segment paths is proposed as
  **`<relative-state-path>/@<Name>`** (sigil on the final segment). Confirm this
  grammar when implementing the compiler's reference parser so editor and compiler
  agree.
- Final version number for `PSEUDOSTATE_REF_MIN_VERSION` (assumed `0.6.0`).
