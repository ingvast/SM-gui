import { describe, it, expect } from 'vitest';
import { parseStateStr, findEsbuild } from './smRunnerPlugin';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// parseStateStr unit tests
// ---------------------------------------------------------------------------
describe('parseStateStr', () => {
  it('parses simple path with leading /', () => {
    expect(parseStateStr('/S1')).toEqual(['S1']);
  });

  it('parses nested path with leading /', () => {
    expect(parseStateStr('/Parent/Child/Grandchild')).toEqual(['Parent/Child/Grandchild']);
  });

  it('strips leading / and returns path', () => {
    expect(parseStateStr('/A/B')).toEqual(['A/B']);
  });

  it('handles path without leading /', () => {
    expect(parseStateStr('A/B')).toEqual(['A/B']);
  });

  it('returns empty array for empty string', () => {
    expect(parseStateStr('')).toEqual([]);
  });

  it('returns empty array for just /', () => {
    expect(parseStateStr('/')).toEqual([]);
  });

  it('parses orthogonal bracket notation', () => {
    expect(parseStateStr('/P/[A/x,B/y]')).toEqual(['P/A/x', 'P/B/y']);
  });

  it('parses orthogonal with three regions', () => {
    expect(parseStateStr('/P/[A/x,B/y,C/z]')).toEqual(['P/A/x', 'P/B/y', 'P/C/z']);
  });

  it('parses nested orthogonal', () => {
    expect(parseStateStr('/P/[A/[C/1,D/2],B/y]')).toEqual(['P/A/C/1', 'P/A/D/2', 'P/B/y']);
  });
});

// ---------------------------------------------------------------------------
// Integration test: compile blink.smb, transpile, load via eval, and tick
// ---------------------------------------------------------------------------
describe('SM Runner integration', () => {
  const blinkContent = `language: typescript
initial: S1
states:
  S1:
    transitions:
      - to: S2
        guard: time > 0.3
  S2:
    transitions:
      - to: S1
        guard: time > 0.2
`;

  it('compiles blink.smb and runs the state machine', () => {
    const tmpDir = path.join(os.tmpdir(), 'sm-runner-test-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    const smbFile = path.join(tmpDir, 'blink.smb');
    fs.writeFileSync(smbFile, blinkContent, 'utf-8');

    const outBase = path.join(tmpDir, 'statemachine');
    const q = (s: string) => `"${s}"`;

    try {
      // 1. Compile .smb → .ts
      execSync(`sm-compiler -o ${q(outBase)} --lang typescript ${q(smbFile)}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
      });
      expect(fs.existsSync(outBase + '.ts')).toBe(true);

      // 2. Transpile .ts → .js (CJS format for eval)
      const esbuildBin = findEsbuild();
      const jsFile = outBase + '.cjs';
      execSync(`${q(esbuildBin)} ${q(outBase + '.ts')} --outfile=${q(jsFile)} --format=cjs --target=es2020`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
      });
      expect(fs.existsSync(jsFile)).toBe(true);

      // 3. Load the CJS module via require-like eval
      const jsCode = fs.readFileSync(jsFile, 'utf-8');
      const moduleExports: Record<string, unknown> = {};
      const moduleObj = { exports: moduleExports };
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('module', 'exports', 'require', jsCode);
      fn(moduleObj, moduleExports, () => { /* no requires needed */ });

      const StateMachine = moduleObj.exports.StateMachine as new () => {
        tick(): void;
        isRunning(): boolean;
        getStateStr(): string;
        ctx: { now: number };
      };
      expect(StateMachine).toBeDefined();

      // 4. Create instance and verify initial state
      const sm = new StateMachine();
      expect(sm.isRunning()).toBe(true);
      expect(parseStateStr(sm.getStateStr())).toEqual(['S1']);

      // 5. Advance time past 0.3s → should transition to S2
      sm.ctx.now = 0.4;
      sm.tick();
      expect(parseStateStr(sm.getStateStr())).toEqual(['S2']);

      // 6. Advance time past 0.2s more → should go back to S1
      sm.ctx.now = 0.7;
      sm.tick();
      expect(parseStateStr(sm.getStateStr())).toEqual(['S1']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);
});
