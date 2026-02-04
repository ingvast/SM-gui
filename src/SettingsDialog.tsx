import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  Box,
} from '@mui/material';

export interface Settings {
  editorPreference: 'system' | 'builtin' | 'custom';
  customEditorCommand: string;
  tabWidth: number;
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
  settings,
  onSave,
}) => {
  const [tempSettings, setTempSettings] = useState<Settings>(settings);

  useEffect(() => {
    if (open) {
      setTempSettings(settings);
    }
  }, [open, settings]);

  const handleSave = () => {
    onSave(tempSettings);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Code Editor</FormLabel>
            <RadioGroup
              value={tempSettings.editorPreference}
              onChange={(e) =>
                setTempSettings({
                  ...tempSettings,
                  editorPreference: e.target.value as Settings['editorPreference'],
                })
              }
            >
              <FormControlLabel
                value="builtin"
                control={<Radio size="small" />}
                label="Built-in editor (dialog)"
              />
              <FormControlLabel
                value="system"
                control={<Radio size="small" />}
                label="System default application"
              />
              <FormControlLabel
                value="custom"
                control={<Radio size="small" />}
                label="Custom command"
              />
            </RadioGroup>
          </FormControl>

          {tempSettings.editorPreference === 'custom' && (
            <Box>
              <TextField
                label="Custom Editor Command"
                fullWidth
                size="small"
                value={tempSettings.customEditorCommand}
                onChange={(e) =>
                  setTempSettings({
                    ...tempSettings,
                    customEditorCommand: e.target.value,
                  })
                }
                placeholder="code -w {file}"
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Use <code>{'{file}'}</code> as placeholder for the temporary file path.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Examples:
              </Typography>
              <Typography variant="caption" color="text.secondary" component="ul" sx={{ m: 0, pl: 2 }}>
                <li><code>code -w {'{file}'}</code> - VS Code (wait for close)</li>
                <li><code>subl -w {'{file}'}</code> - Sublime Text (wait for close)</li>
                <li><code>vim {'{file}'}</code> - Vim in terminal</li>
                <li><code>nano {'{file}'}</code> - Nano in terminal</li>
                <li><code>open -a "TextEdit" -W {'{file}'}</code> - macOS TextEdit</li>
              </Typography>
            </Box>
          )}

          {tempSettings.editorPreference === 'system' && (
            <Typography variant="caption" color="text.secondary">
              Opens the file with your system's default application for the file type.
              A dialog will appear asking you to confirm when done editing.
            </Typography>
          )}

          <TextField
            label="Tab Width"
            type="number"
            size="small"
            value={tempSettings.tabWidth}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (value >= 1 && value <= 16) {
                setTempSettings({ ...tempSettings, tabWidth: value });
              }
            }}
            slotProps={{
              htmlInput: { min: 1, max: 16 },
            }}
            sx={{ width: 120 }}
            helperText="Spaces per tab (1-16)"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SettingsDialog;
