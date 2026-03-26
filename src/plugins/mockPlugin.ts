/**
 * Mock plugin for testing View Mode.
 *
 * Cycles through a predefined sequence of active-state paths every 2 seconds
 * so the renderer can be verified without a real state machine running.
 */

import type { ViewPlugin, PluginCallbacks, PluginConfigField } from '../viewPlugin';

/** Sequence of active-state snapshots to cycle through. */
const MOCK_SEQUENCE: string[][] = [
  ['Top'],
  ['Top/Idle'],
  ['Top/Running'],
  ['Top/Running/Fast'],
  ['Top/Running/Slow'],
  ['Top/Idle'],
];

const TICK_MS = 2000;

let timer: ReturnType<typeof setInterval> | null = null;

const mockConfigFields: PluginConfigField[] = [];

const mockPlugin: ViewPlugin = {
  name: 'Mock',
  configFields: mockConfigFields,

  async start(callbacks: PluginCallbacks, _config: Record<string, unknown>) {
    let idx = 0;
    // Send first update immediately
    callbacks.onStateUpdate(MOCK_SEQUENCE[idx]);

    timer = setInterval(() => {
      idx = (idx + 1) % MOCK_SEQUENCE.length;
      callbacks.onStateUpdate(MOCK_SEQUENCE[idx]);
    }, TICK_MS);
  },

  async stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  },
};

export default mockPlugin;
