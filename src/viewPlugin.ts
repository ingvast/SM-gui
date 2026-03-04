/**
 * Plugin interface for View Mode.
 *
 * A ViewPlugin runs inside the Electron main process and pushes
 * active-state updates to the renderer via PluginCallbacks.
 */

export interface PluginCallbacks {
  /** Called whenever the set of active states changes.
   *  Each entry is a slash-separated path, e.g. "Parent/Child".
   *  Orthogonal regions use bracket notation:
   *    "Parent/[RegionA/ChildA,RegionB/ChildB]"
   */
  onStateUpdate(activeStates: string[]): void;
}

export interface ViewPlugin {
  /** Human-readable name shown in the UI. */
  name: string;

  /** Start the plugin. `config` carries plugin-specific options (e.g. filePath).
   *  `callbacks` is used to push state updates back to the renderer. */
  start(callbacks: PluginCallbacks, config: Record<string, unknown>): Promise<void>;

  /** Stop the plugin and release resources. */
  stop(): Promise<void>;
}
