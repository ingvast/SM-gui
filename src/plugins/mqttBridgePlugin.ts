/**
 * MQTT Bridge plugin for View Mode.
 *
 * Connects to an MQTT broker, subscribes to a topic that carries the
 * full state string (output of `getStateStr()`), and pushes active-state
 * updates to the renderer.
 */

import type { ViewPlugin, PluginCallbacks, PluginConfigField } from '../viewPlugin';
import mqtt from 'mqtt';
import { parseStateStr } from './smRunnerPlugin';

let client: mqtt.MqttClient | null = null;

const mqttConfigFields: PluginConfigField[] = [
  { key: 'host', label: 'Broker host', type: 'string', default: 'localhost', placeholder: 'localhost' },
  { key: 'port', label: 'Broker port', type: 'number', default: 1883 },
  { key: 'topic', label: 'State topic', type: 'string', placeholder: 'sm/state' },
];

const mqttBridgePlugin: ViewPlugin = {
  name: 'MQTT Bridge',
  configFields: mqttConfigFields,

  async start(callbacks: PluginCallbacks, config: Record<string, unknown>) {
    const host = (config.host as string) || 'localhost';
    const port = (config.port as number) || 1883;
    const topic = config.topic as string;

    if (!topic) {
      throw new Error('MQTT Bridge requires a topic');
    }

    const brokerUrl = `mqtt://${host}:${port}`;

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (client) {
          client.end(true);
          client = null;
        }
        reject(new Error(`Connection to ${brokerUrl} timed out`));
      }, 10000);

      client = mqtt.connect(brokerUrl, {
        connectTimeout: 10000,
        reconnectPeriod: 5000,
      });

      client.on('connect', () => {
        clearTimeout(timeoutId);
        client!.subscribe(topic, (err) => {
          if (err) {
            client!.end(true);
            client = null;
            reject(new Error(`Failed to subscribe to "${topic}": ${err.message}`));
          } else {
            resolve();
          }
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeoutId);
        if (client) {
          client.end(true);
          client = null;
        }
        reject(new Error(`MQTT error: ${err.message}`));
      });

      client.on('message', (_topic, message) => {
        const payload = message.toString().trim();
        if (!payload) {
          callbacks.onStateUpdate([]);
          return;
        }
        try {
          const paths = parseStateStr(payload);
          callbacks.onStateUpdate(paths);
        } catch (err) {
          console.warn('MQTT Bridge: failed to parse state string:', payload, err);
        }
      });
    });
  },

  async stop() {
    if (client) {
      client.end(true);
      client = null;
    }
  },
};

export default mqttBridgePlugin;
