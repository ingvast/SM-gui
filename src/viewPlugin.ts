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

/** Describes a single configuration field for a plugin. */
export interface PluginConfigField {
  key: string;
  label: string;
  type: 'string' | 'number';
  default?: string | number;
  placeholder?: string;
}

/** Serializable plugin info sent to the renderer for the picker dialog. */
export interface PluginInfo {
  name: string;
  configFields: PluginConfigField[];
}

export interface ViewPlugin {
  /** Human-readable name shown in the UI. */
  name: string;

  /** Describes the config fields this plugin accepts (for the picker UI). */
  configFields?: PluginConfigField[];

  /** Start the plugin. `config` carries plugin-specific options (e.g. filePath).
   *  `callbacks` is used to push state updates back to the renderer. */
  start(callbacks: PluginCallbacks, config: Record<string, unknown>): Promise<void>;

  /** Stop the plugin and release resources. */
  stop(): Promise<void>;
}
