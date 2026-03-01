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
  InputLabel,
  IconButton,
  Divider,
} from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { CodeEditorDialog } from './CodeEditorDialog';
import { MachineProperties } from './yamlConverter';
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
];

interface MachinePropertiesDialogProps {
  open: boolean;
  onClose: () => void;
  machineProperties: MachineProperties;
  onSave: (properties: MachineProperties) => void;
  tabWidth?: number;
}

const MachinePropertiesDialog: React.FC<MachinePropertiesDialogProps> = ({
  open,
  onClose,
  machineProperties,
  onSave,
}) => {
  const [tempProps, setTempProps] = useState<MachineProperties>(machineProperties);
  const [expandedField, setExpandedField] = useState<ExpandableField>(null);

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

            <Divider />
            <Typography variant="subtitle2" color="text.secondary">
              Root State Actions
            </Typography>

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

            <Divider />
            <Typography variant="subtitle2" color="text.secondary">
              Hooks
            </Typography>

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

            <Divider />
            <Typography variant="subtitle2" color="text.secondary">
              Includes
            </Typography>

            <CodeFieldWithExpand
              label="Includes"
              value={tempProps.includes}
              onChange={(v) => handleFieldChange('includes', v)}
              expandField="includes"
              onExpand={setExpandedField}
              language={tempProps.language}
            />

            <Divider />
            <Typography variant="subtitle2" color="text.secondary">
              Context
            </Typography>

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
