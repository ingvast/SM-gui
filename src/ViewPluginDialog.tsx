import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Box,
  Typography,
} from '@mui/material';
import type { PluginInfo } from './preload';

interface ViewPluginDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (pluginName: string, config: Record<string, unknown>) => void;
  /** Current .smb file path, used to auto-fill plugin config fields. */
  currentFilePath: string | null;
}

const ViewPluginDialog: React.FC<ViewPluginDialogProps> = ({
  open,
  onClose,
  onStart,
  currentFilePath,
}) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<string>('');
  const [configValues, setConfigValues] = useState<Record<string, Record<string, string>>>({});

  // Load plugin list and saved config when dialog opens
  useEffect(() => {
    if (!open) return;
    Promise.all([
      window.viewAPI.listPlugins(),
      window.viewAPI.getConfig(),
    ]).then(([list, saved]) => {
      setPlugins(list);

      // Build config values: start from defaults, then overlay saved values
      const initial: Record<string, Record<string, string>> = {};
      for (const plugin of list) {
        const values: Record<string, string> = {};
        const savedValues = saved.pluginConfigs[plugin.name] || {};
        for (const field of plugin.configFields) {
          if (savedValues[field.key] !== undefined) {
            values[field.key] = savedValues[field.key];
          } else if (field.default !== undefined) {
            values[field.key] = String(field.default);
          } else {
            values[field.key] = '';
          }
        }
        initial[plugin.name] = values;
      }
      setConfigValues(initial);

      // Restore last selected plugin, or fall back to defaults
      if (saved.lastPlugin && list.some((p) => p.name === saved.lastPlugin)) {
        setSelectedPlugin(saved.lastPlugin);
      } else if (list.length > 0) {
        const hasSmRunner = list.some((p) => p.name === 'SM Runner');
        if (currentFilePath && hasSmRunner) {
          setSelectedPlugin('SM Runner');
        } else {
          setSelectedPlugin(list[0].name);
        }
      }
    });
  }, [open, currentFilePath]);

  const selectedPluginInfo = plugins.find((p) => p.name === selectedPlugin);

  const handleFieldChange = (pluginName: string, key: string, value: string) => {
    setConfigValues((prev) => ({
      ...prev,
      [pluginName]: { ...prev[pluginName], [key]: value },
    }));
  };

  const handleStart = () => {
    if (!selectedPluginInfo) return;
    const raw = configValues[selectedPlugin] || {};
    const config: Record<string, unknown> = {};
    for (const field of selectedPluginInfo.configFields) {
      const val = raw[field.key] ?? '';
      if (field.type === 'number') {
        config[field.key] = val ? Number(val) : undefined;
      } else {
        config[field.key] = val || undefined;
      }
    }

    // Persist selection and config values for next session
    window.viewAPI.saveConfig({
      lastPlugin: selectedPlugin,
      pluginConfigs: configValues,
    });

    onStart(selectedPlugin, config);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start View Mode</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose a plugin to provide live state updates.
        </Typography>

        <FormControl component="fieldset" fullWidth>
          <RadioGroup
            value={selectedPlugin}
            onChange={(e) => setSelectedPlugin(e.target.value)}
          >
            {plugins.map((plugin) => (
              <Box key={plugin.name} sx={{ mb: 1 }}>
                <FormControlLabel
                  value={plugin.name}
                  control={<Radio size="small" />}
                  label={plugin.name}
                />
                {/* Show config fields when this plugin is selected */}
                {selectedPlugin === plugin.name && plugin.configFields.length > 0 && (
                  <Box sx={{ pl: 4, pb: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {plugin.configFields.map((field) => (
                      <TextField
                        key={field.key}
                        label={field.label}
                        size="small"
                        type={field.type === 'number' ? 'number' : 'text'}
                        placeholder={field.placeholder}
                        value={configValues[plugin.name]?.[field.key] ?? ''}
                        onChange={(e) => handleFieldChange(plugin.name, field.key, e.target.value)}
                        fullWidth
                      />
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </RadioGroup>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleStart} disabled={!selectedPlugin}>
          Start
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ViewPluginDialog;
