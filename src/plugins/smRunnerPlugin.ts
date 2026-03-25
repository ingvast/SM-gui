/**
 * SM Runner plugin for View Mode.
 *
 * Compiles the current .smb file to TypeScript via sm-compiler,
 * transpiles to JavaScript via esbuild, imports the generated
 * StateMachine class, and runs a tick loop pushing state updates.
 */

import type { ViewPlugin, PluginCallbacks, PluginConfigField } from '../viewPlugin';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let timer: ReturnType<typeof setInterval> | null = null;
let startTime = 0;

/**
 * Parse the output of `getStateStr()` into an array of simple
 * slash-separated paths (no leading `/`).
 *
 * Examples:
 *   "/Parent/Child"                     → ["Parent/Child"]
 *   "/P/[A/x,B/y]"                     → ["P/A/x", "P/B/y"]
 */
export function parseStateStr(stateStr: string): string[] {
  // Strip leading /
  const s = stateStr.startsWith('/') ? stateStr.substring(1) : stateStr;
  if (!s) return [];

  const bracketIdx = s.indexOf('[');
  if (bracketIdx === -1) {
    return [s];
  }

  // prefix before bracket (e.g. "P/" from "P/[A/x,B/y]")
  const prefix = s.substring(0, bracketIdx);

  // Content inside outermost brackets
  const closeBracket = s.lastIndexOf(']');
  const inner = s.substring(bracketIdx + 1, closeBracket);

  // Split on top-level commas (not inside nested brackets)
  const regions: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '[') depth++;
    else if (inner[i] === ']') depth--;
    else if (inner[i] === ',' && depth === 0) {
      regions.push(inner.substring(start, i).trim());
      start = i + 1;
    }
  }
  regions.push(inner.substring(start).trim());

  // Recursively parse each region (handles nested orthogonal)
  const result: string[] = [];
  for (const region of regions) {
    const subPaths = parseStateStr('/' + region);
    for (const sp of subPaths) {
      result.push(prefix + sp);
    }
  }
  return result;
}

export function findEsbuild(): string {
  const candidates = [
    path.join(process.cwd(), 'node_modules', '.bin', 'esbuild'),
    path.join(__dirname, '..', '..', 'node_modules', '.bin', 'esbuild'),
    path.join(__dirname, '..', 'node_modules', '.bin', 'esbuild'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'esbuild';
}

function cleanup(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

export interface StateMachineInstance {
  tick(): void;
  isRunning(): boolean;
  getStateStr(): string;
  ctx: { now: number; [key: string]: unknown };
}

/**
 * Compile an .smb file → TypeScript → JavaScript, then dynamically import
 * and return the StateMachine constructor.
 * The caller is responsible for cleanup of the returned tmpDir.
 */
export async function compileAndLoad(filePath: string): Promise<{
  StateMachine: new () => StateMachineInstance;
  tmpDir: string;
}> {
  const tmpDir = path.join(os.tmpdir(), 'sm-gui-runner-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const outBase = path.join(tmpDir, 'statemachine');

  // 1. Compile .smb → .ts
  try {
    const result = execSync(`sm-compiler -o ${q(outBase)} --lang typescript ${q(filePath)}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
    const output = result?.toString() || '';
    if (output.trim()) {
      console.log('sm-compiler:', output.trim());
    }
  } catch (err) {
    cleanup(tmpDir);
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() || '';
    const stdout = (err as { stdout?: Buffer }).stdout?.toString() || '';
    const detail = stderr || stdout || (err as Error).message;
    throw new Error(`sm-compiler failed:\n${detail}`);
  }

  const tsFile = outBase + '.ts';
  if (!fs.existsSync(tsFile)) {
    cleanup(tmpDir);
    throw new Error('sm-compiler did not produce a .ts file');
  }

  // 2. Transpile .ts → .js (CJS) using esbuild CLI
  const jsFile = outBase + '.cjs';
  const esbuildBin = findEsbuild();

  try {
    execSync(`${q(esbuildBin)} ${q(tsFile)} --outfile=${q(jsFile)} --format=cjs --target=es2020`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
  } catch (err) {
    cleanup(tmpDir);
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() || '';
    const detail = stderr || (err as Error).message;
    throw new Error(`Code has syntax errors:\n${detail}`);
  }

  // 3. Load the CJS module via Function constructor
  try {
    const jsCode = fs.readFileSync(jsFile, 'utf-8');
    const moduleExports: Record<string, unknown> = {};
    const moduleObj = { exports: moduleExports };
    const loader = new Function('module', 'exports', 'require', 'console', jsCode);
    loader(moduleObj, moduleExports, () => undefined, console);
    return { StateMachine: moduleObj.exports.StateMachine as new () => StateMachineInstance, tmpDir };
  } catch (err) {
    cleanup(tmpDir);
    throw new Error(`Failed to load generated module: ${(err as Error).message}`);
  }
}

const smRunnerConfigFields: PluginConfigField[] = [
  { key: 'tickInterval', label: 'Tick interval (ms)', type: 'number', default: 100 },
];

const smRunnerPlugin: ViewPlugin = {
  name: 'SM Runner',
  configFields: smRunnerConfigFields,

  async start(callbacks: PluginCallbacks, config: Record<string, unknown>) {
    const filePath = config.filePath as string;
    const tickInterval = (config.tickInterval as number) || 100;

    if (!filePath) {
      throw new Error('SM Runner requires a saved .smb file path');
    }

    const { StateMachine } = await compileAndLoad(filePath);

    // Create state machine instance and run tick loop
    const sm = new StateMachine();
    startTime = Date.now();
    let lastStateStr = '';

    // Send initial state immediately
    const stateStr = sm.getStateStr();
    lastStateStr = stateStr;
    callbacks.onStateUpdate(parseStateStr(stateStr));

    timer = setInterval(() => {
      if (!sm.isRunning()) {
        callbacks.onStateUpdate([]);
        if (timer !== null) {
          clearInterval(timer);
          timer = null;
        }
        return;
      }

      // Update logical time (seconds elapsed)
      sm.ctx.now = (Date.now() - startTime) / 1000;
      sm.tick();

      const currentStr = sm.getStateStr();
      if (currentStr !== lastStateStr) {
        lastStateStr = currentStr;
        callbacks.onStateUpdate(parseStateStr(currentStr));
      }
    }, tickInterval);
  },

  async stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  },
};

export default smRunnerPlugin;
