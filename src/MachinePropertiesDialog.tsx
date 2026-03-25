import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  FormControlLabel,
  InputLabel,
  IconButton,
  RadioGroup,
  Radio,
  TextField,
  Tabs,
  Tab,
} from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { CodeEditorDialog } from './CodeEditorDialog';
import { MachineProperties } from './yamlConverter';
import type { PluginInfo } from './preload';
import CodeEditor from './CodeEditor';

type ExpandableField = 'entry' | 'exit' | 'do' | 'hookEntry' | 'hookExit' | 'hookDo' | 'hookTransition' | 'includes' | 'context' | 'context_init' | null;

// Moved outside MachinePropertiesDialog to prevent recreation on each render
const CodeFieldWithExpand: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  expandField: ExpandableField;
  onExpand: (field: ExpandableField) => void;
  language: string;
}> = ({ label, value, onChange, expandField, onExpand, language }) => (
  <Box sx={{ position: 'relative' }}>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>{label}</Typography>
    <CodeEditor
      value={value}
      onChange={onChange}
      language={language}
    />
    <IconButton
      size="small"
      onClick={() => onExpand(expandField)}
      sx={{
        position: 'absolute',
        right: 4,
        top: 4,
        padding: '2px',
        opacity: 0.6,
        '&:hover': { opacity: 1 },
      }}
      title="Expand editor"
    >
      <OpenInFullIcon sx={{ fontSize: 16 }} />
    </IconButton>
  </Box>
);

const languages = [
  { value: '', label: 'None' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'typescript', label: 'TypeScript' },
];

interface MachinePropertiesDialogProps {
  open: boolean;
  onClose: () => void;
  machineProperties: MachineProperties;
  onSave: (properties: MachineProperties) => void;
  tabWidth?: number;
  availablePlugins: PluginInfo[];
}

const MachinePropertiesDialog: React.FC<MachinePropertiesDialogProps> = ({
  open,
  onClose,
  machineProperties,
  onSave,
  availablePlugins,
}) => {
  const [tempProps, setTempProps] = useState<MachineProperties>(machineProperties);
  const [expandedField, setExpandedField] = useState<ExpandableField>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (open) {
      setTempProps(machineProperties);
    }
  }, [open, machineProperties]);

  const handleSave = () => {
    onSave(tempProps);
    onClose();
  };

  const handleFieldChange = (field: keyof MachineProperties, value: string) => {
    setTempProps(prev => ({ ...prev, [field]: value }));
  };

  const handleHookChange = (hookField: keyof MachineProperties['hooks'], value: string) => {
    setTempProps(prev => ({
      ...prev,
      hooks: { ...prev.hooks, [hookField]: value },
    }));
  };

  const getExpandedValue = (): string => {
    switch (expandedField) {
      case 'entry': return tempProps.entry;
      case 'exit': return tempProps.exit;
      case 'do': return tempProps.do;
      case 'hookEntry': return tempProps.hooks.entry;
      case 'hookExit': return tempProps.hooks.exit;
      case 'hookDo': return tempProps.hooks.do;
      case 'hookTransition': return tempProps.hooks.transition;
      case 'includes': return tempProps.includes;
      case 'context': return tempProps.context;
      case 'context_init': return tempProps.context_init;
      default: return '';
    }
  };

  const getExpandedTitle = (): string => {
    switch (expandedField) {
      case 'entry': return 'Root Entry Code';
      case 'exit': return 'Root Exit Code';
      case 'do': return 'Root Activity Code';
      case 'hookEntry': return 'Entry Hook Code';
      case 'hookExit': return 'Exit Hook Code';
      case 'hookDo': return 'Do Hook Code';
      case 'hookTransition': return 'Transition Hook Code';
      case 'includes': return 'Includes';
      case 'context': return 'Context';
      case 'context_init': return 'Context Initialization';
      default: return '';
    }
  };

  const handleExpandedSave = (value: string) => {
    switch (expandedField) {
      case 'entry':
      case 'exit':
      case 'do':
      case 'includes':
      case 'context':
      case 'context_init':
        handleFieldChange(expandedField, value);
        break;
      case 'hookEntry':
        handleHookChange('entry', value);
        break;
      case 'hookExit':
        handleHookChange('exit', value);
        break;
      case 'hookDo':
        handleHookChange('do', value);
        break;
      case 'hookTransition':
        handleHookChange('transition', value);
        break;
    }
  };

  return (
    <>
      <Dialog
        open={open && expandedField === null}
        onClose={onClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Machine Properties</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Code Language</InputLabel>
              <Select
                value={tempProps.language}
                label="Code Language"
                onChange={(e) => handleFieldChange('language', e.target.value)}
              >
                {languages.map((lang) => (
                  <MenuItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none' } }}
            >
              <Tab label="Root Actions" />
              <Tab label="Hooks" />
              <Tab label="Includes" />
              <Tab label="Context" />
              <Tab label="View Plugin" />
            </Tabs>

            {activeTab === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <CodeFieldWithExpand
                  label="Entry"
                  value={tempProps.entry}
                  onChange={(v) => handleFieldChange('entry', v)}
                  expandField="entry"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
                <CodeFieldWithExpand
                  label="Exit"
                  value={tempProps.exit}
                  onChange={(v) => handleFieldChange('exit', v)}
                  expandField="exit"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
                <CodeFieldWithExpand
                  label="Do"
                  value={tempProps.do}
                  onChange={(v) => handleFieldChange('do', v)}
                  expandField="do"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
              </Box>
            )}

            {activeTab === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <CodeFieldWithExpand
                  label="Entry Hook"
                  value={tempProps.hooks.entry}
                  onChange={(v) => handleHookChange('entry', v)}
                  expandField="hookEntry"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
                <CodeFieldWithExpand
                  label="Exit Hook"
                  value={tempProps.hooks.exit}
                  onChange={(v) => handleHookChange('exit', v)}
                  expandField="hookExit"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
                <CodeFieldWithExpand
                  label="Do Hook"
                  value={tempProps.hooks.do}
                  onChange={(v) => handleHookChange('do', v)}
                  expandField="hookDo"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
                <CodeFieldWithExpand
                  label="Transition Hook"
                  value={tempProps.hooks.transition}
                  onChange={(v) => handleHookChange('transition', v)}
                  expandField="hookTransition"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
              </Box>
            )}

            {activeTab === 2 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <CodeFieldWithExpand
                  label="Includes"
                  value={tempProps.includes}
                  onChange={(v) => handleFieldChange('includes', v)}
                  expandField="includes"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
              </Box>
            )}

            {activeTab === 3 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <CodeFieldWithExpand
                  label="Context"
                  value={tempProps.context}
                  onChange={(v) => handleFieldChange('context', v)}
                  expandField="context"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
                <CodeFieldWithExpand
                  label="Context Init"
                  value={tempProps.context_init}
                  onChange={(v) => handleFieldChange('context_init', v)}
                  expandField="context_init"
                  onExpand={setExpandedField}
                  language={tempProps.language}
                />
              </Box>
            )}

            {activeTab === 4 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl component="fieldset" fullWidth>
                  <RadioGroup
                    value={tempProps.viewPlugin?.name || ''}
                    onChange={(e) => {
                      const name = e.target.value;
                      const plugin = availablePlugins.find((p) => p.name === name);
                      if (!plugin) return;
                      const config: Record<string, string> = {};
                      for (const field of plugin.configFields) {
                        if (tempProps.viewPlugin?.name === name && tempProps.viewPlugin.config[field.key] !== undefined) {
                          config[field.key] = tempProps.viewPlugin.config[field.key];
                        } else if (field.default !== undefined) {
                          config[field.key] = String(field.default);
                        } else {
                          config[field.key] = '';
                        }
                      }
                      setTempProps((prev) => ({ ...prev, viewPlugin: { name, config } }));
                    }}
                  >
                    {availablePlugins.map((plugin) => (
                      <Box key={plugin.name} sx={{ mb: 0.5 }}>
                        <FormControlLabel
                          value={plugin.name}
                          control={<Radio size="small" />}
                          label={plugin.name}
                        />
                        {tempProps.viewPlugin?.name === plugin.name && plugin.configFields.length > 0 && (
                          <Box sx={{ pl: 4, pb: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {plugin.configFields.map((field) => (
                              <TextField
                                key={field.key}
                                label={field.label}
                                size="small"
                                type={field.type === 'number' ? 'number' : 'text'}
                                placeholder={field.placeholder}
                                value={tempProps.viewPlugin?.config[field.key] ?? (field.default !== undefined ? String(field.default) : '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTempProps((prev) => ({
                                    ...prev,
                                    viewPlugin: prev.viewPlugin ? { ...prev.viewPlugin, config: { ...prev.viewPlugin.config, [field.key]: val } } : prev.viewPlugin,
                                  }));
                                }}
                                fullWidth
                              />
                            ))}
                          </Box>
                        )}
                      </Box>
                    ))}
                  </RadioGroup>
                </FormControl>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">
            OK
          </Button>
        </DialogActions>
      </Dialog>

      <CodeEditorDialog
        open={expandedField !== null}
        onClose={() => setExpandedField(null)}
        onSave={handleExpandedSave}
        value={getExpandedValue()}
        title={getExpandedTitle()}
        language={tempProps.language}
      />
    </>
  );
};

export default MachinePropertiesDialog;
