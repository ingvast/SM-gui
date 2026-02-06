import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tabs,
  Tab,
} from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { CodeEditorDialog } from './CodeEditorDialog';

const codeFieldStyle = {
  fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
  fontSize: '0.85rem',
};

const codeFieldInputProps = {
  style: {
    whiteSpace: 'pre',
    overflowX: 'auto',
    overflowWrap: 'normal',
    wordBreak: 'keep-all',
  },
};

// Helper to handle Tab key in code fields - inserts spaces to align to next tab stop
const handleCodeFieldTab = (
  event: React.KeyboardEvent,
  value: string,
  setValue: (v: string) => void,
  tabWidth: number
) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const target = event.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;

    // Find the start of the current line to calculate column position
    const textBeforeCursor = value.substring(0, start);
    const lastNewlineIndex = textBeforeCursor.lastIndexOf('\n');
    const currentColumn = start - (lastNewlineIndex + 1);

    // Calculate spaces needed to reach next tab stop
    const spacesToAdd = tabWidth - (currentColumn % tabWidth);
    const spaces = ' '.repeat(spacesToAdd);

    const newValue = value.substring(0, start) + spaces + value.substring(end);
    setValue(newValue);
    setTimeout(() => {
      target.selectionStart = target.selectionEnd = start + spacesToAdd;
    }, 0);
  }
};

interface Edge {
  id: string;
  source: string;
  target: string;
  data?: {
    guard?: string;
    action?: string;
  };
}

interface Node {
  id: string;
  data: {
    label: string;
    [key: string]: unknown;
  };
}

interface Settings {
  editorPreference: 'system' | 'builtin' | 'custom';
  customEditorCommand: string;
  tabWidth: number;
}

interface PropertiesPanelProps {
  selectedNode: Node | null;
  selectedCanvasEdge: Edge | null;
  nodes: Node[];
  edges: Edge[];
  onPropertyChange: (nodeId: string, property: string, value: unknown) => void;
  onEdgePropertyChange: (edgeId: string, property: string, value: unknown) => void;
  settings: Settings;
  language: string;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedNode,
  selectedCanvasEdge,
  nodes,
  edges,
  onPropertyChange,
  onEdgePropertyChange,
  settings,
  language,
}) => {
  const [tempName, setTempName] = useState('');
  const [tempEntry, setTempEntry] = useState('');
  const [tempExit, setTempExit] = useState('');
  const [tempDo, setTempDo] = useState('');
  const [expandedField, setExpandedField] = useState<'entry' | 'exit' | 'do' | 'guard' | 'action' | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [tempGuard, setTempGuard] = useState('');
  const [tempAction, setTempAction] = useState('');
  const [activeTab, setActiveTab] = useState(0);

  // Get node label by id
  const getNodeLabel = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data?.label || nodeId;
  };

  // Compute outgoing and incoming transitions
  const outgoingTransitions = useMemo(() => {
    if (!selectedNode || selectedNode.id === '/') return [];
    return edges.filter(e => e.source === selectedNode.id);
  }, [edges, selectedNode]);

  const incomingTransitions = useMemo(() => {
    if (!selectedNode || selectedNode.id === '/') return [];
    return edges.filter(e => e.target === selectedNode.id);
  }, [edges, selectedNode]);

  // Get currently selected edge (from list or from canvas)
  const selectedEdge = useMemo(() => {
    if (selectedCanvasEdge) return selectedCanvasEdge;
    if (!selectedEdgeId) return null;
    return edges.find(e => e.id === selectedEdgeId) || null;
  }, [edges, selectedEdgeId, selectedCanvasEdge]);

  // Track previous node ID to only sync when selection actually changes
  const prevNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only sync temp values when the selected node ID changes, not on every object reference change
    if (selectedNode?.id !== prevNodeIdRef.current) {
      prevNodeIdRef.current = selectedNode?.id || null;
      if (selectedNode && selectedNode.data) {
        setTempName(selectedNode.data.label || '');
        setTempEntry((selectedNode.data.entry as string) || '');
        setTempExit((selectedNode.data.exit as string) || '');
        setTempDo((selectedNode.data.do as string) || '');
      } else {
        setTempName('');
        setTempEntry('');
        setTempExit('');
        setTempDo('');
      }
      // Clear selected edge when node changes
      setSelectedEdgeId(null);
    }
  }, [selectedNode]);

  // Sync edge properties when selected edge changes
  useEffect(() => {
    if (selectedEdge) {
      setTempGuard(selectedEdge.data?.guard || '');
      setTempAction(selectedEdge.data?.action || '');
    } else {
      setTempGuard('');
      setTempAction('');
    }
  }, [selectedEdge]);

  const handleNameChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempName(event.target.value);
  };

  const handleNameBlur = () => {
    if (selectedNode && tempName !== selectedNode.data.label) {
      onPropertyChange(selectedNode.id, 'label', tempName);
    }
  };

  const handleNameKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      (event.target as HTMLInputElement).blur();
    }
  };

  const handleOrthogonalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedNode) {
      onPropertyChange(selectedNode.id, 'orthogonal', event.target.checked);
    }
  };

  const handleEntryChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempEntry(event.target.value);
  const handleEntryBlur = () => {
    if (selectedNode && tempEntry !== (selectedNode.data.entry as string)) {
      onPropertyChange(selectedNode.id, 'entry', tempEntry);
    }
  };
  const handleEntryKeyDown = (event: React.KeyboardEvent) => {
    handleCodeFieldTab(event, tempEntry, setTempEntry, settings.tabWidth);
  };

  const handleExitChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempExit(event.target.value);
  const handleExitBlur = () => {
    if (selectedNode && tempExit !== (selectedNode.data.exit as string)) {
      onPropertyChange(selectedNode.id, 'exit', tempExit);
    }
  };
  const handleExitKeyDown = (event: React.KeyboardEvent) => {
    handleCodeFieldTab(event, tempExit, setTempExit, settings.tabWidth);
  };

  const handleDoChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempDo(event.target.value);
  const handleDoBlur = () => {
    if (selectedNode && tempDo !== (selectedNode.data.do as string)) {
      onPropertyChange(selectedNode.id, 'do', tempDo);
    }
  };
  const handleDoKeyDown = (event: React.KeyboardEvent) => {
    handleCodeFieldTab(event, tempDo, setTempDo, settings.tabWidth);
  };

  // Edge property handlers
  const handleGuardChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempGuard(event.target.value);
  const handleGuardBlur = () => {
    const edgeId = selectedCanvasEdge?.id || selectedEdgeId;
    if (edgeId && tempGuard !== (selectedEdge?.data?.guard || '')) {
      onEdgePropertyChange(edgeId, 'guard', tempGuard);
    }
  };
  const handleGuardKeyDown = (event: React.KeyboardEvent) => {
    handleCodeFieldTab(event, tempGuard, setTempGuard, settings.tabWidth);
  };

  const handleActionChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempAction(event.target.value);
  const handleActionBlur = () => {
    const edgeId = selectedCanvasEdge?.id || selectedEdgeId;
    if (edgeId && tempAction !== (selectedEdge?.data?.action || '')) {
      onEdgePropertyChange(edgeId, 'action', tempAction);
    }
  };
  const handleActionKeyDown = (event: React.KeyboardEvent) => {
    handleCodeFieldTab(event, tempAction, setTempAction, settings.tabWidth);
  };

  // Handle expand button click - either open external editor or built-in dialog
  const handleExpandClick = async (field: 'entry' | 'exit' | 'do' | 'guard' | 'action') => {
    if (settings.editorPreference === 'builtin') {
      // Use built-in dialog
      setExpandedField(field);
      return;
    }

    // Get current value for this field
    let currentValue = '';
    if (field === 'entry') currentValue = tempEntry;
    else if (field === 'exit') currentValue = tempExit;
    else if (field === 'do') currentValue = tempDo;
    else if (field === 'guard') currentValue = tempGuard;
    else if (field === 'action') currentValue = tempAction;

    try {
      const result = await window.editorAPI.editExternal(currentValue, language);

      if (result.success && result.content !== undefined) {
        // Apply the changes
        if (field === 'entry' && selectedNode) {
          setTempEntry(result.content);
          onPropertyChange(selectedNode.id, 'entry', result.content);
        } else if (field === 'exit' && selectedNode) {
          setTempExit(result.content);
          onPropertyChange(selectedNode.id, 'exit', result.content);
        } else if (field === 'do' && selectedNode) {
          setTempDo(result.content);
          onPropertyChange(selectedNode.id, 'do', result.content);
        } else if (field === 'guard' && (selectedCanvasEdge || selectedEdgeId)) {
          const edgeId = selectedCanvasEdge?.id || selectedEdgeId!;
          setTempGuard(result.content);
          onEdgePropertyChange(edgeId, 'guard', result.content);
        } else if (field === 'action' && (selectedCanvasEdge || selectedEdgeId)) {
          const edgeId = selectedCanvasEdge?.id || selectedEdgeId!;
          setTempAction(result.content);
          onEdgePropertyChange(edgeId, 'action', result.content);
        }
      } else if (result.fallbackToBuiltin || result.useBuiltin) {
        // Fall back to built-in dialog
        setExpandedField(field);
      }
      // If canceled, do nothing
    } catch (error) {
      console.error('Error with external editor:', error);
      // Fall back to built-in dialog
      setExpandedField(field);
    }
  };

  const handleDialogSave = (value: string) => {
    if (expandedField === 'entry' && selectedNode) {
      setTempEntry(value);
      onPropertyChange(selectedNode.id, 'entry', value);
    } else if (expandedField === 'exit' && selectedNode) {
      setTempExit(value);
      onPropertyChange(selectedNode.id, 'exit', value);
    } else if (expandedField === 'do' && selectedNode) {
      setTempDo(value);
      onPropertyChange(selectedNode.id, 'do', value);
    } else if (expandedField === 'guard' && (selectedCanvasEdge || selectedEdgeId)) {
      const edgeId = selectedCanvasEdge?.id || selectedEdgeId!;
      setTempGuard(value);
      onEdgePropertyChange(edgeId, 'guard', value);
    } else if (expandedField === 'action' && (selectedCanvasEdge || selectedEdgeId)) {
      const edgeId = selectedCanvasEdge?.id || selectedEdgeId!;
      setTempAction(value);
      onEdgePropertyChange(edgeId, 'action', value);
    }
  };

  const getDialogValue = () => {
    if (expandedField === 'entry') return tempEntry;
    if (expandedField === 'exit') return tempExit;
    if (expandedField === 'do') return tempDo;
    if (expandedField === 'guard') return tempGuard;
    if (expandedField === 'action') return tempAction;
    return '';
  };

  const getDialogTitle = () => {
    if (expandedField === 'entry') return 'Entry Action Code';
    if (expandedField === 'exit') return 'Exit Action Code';
    if (expandedField === 'do') return 'Activity Code';
    if (expandedField === 'guard') return 'Guard Condition';
    if (expandedField === 'action') return 'Transition Action';
    return '';
  };

  // Handler for opening in external editor from the built-in dialog
  const handleOpenExternalFromDialog = async (currentValue: string): Promise<string | null> => {
    if (settings.editorPreference === 'builtin') {
      // If editor preference is builtin, this button shouldn't be shown
      // but handle gracefully anyway
      return null;
    }

    try {
      const result = await window.editorAPI.editExternal(currentValue, language);
      if (result.success && result.content !== undefined) {
        return result.content;
      }
      // If canceled or error, return null to indicate no change
      return null;
    } catch (error) {
      console.error('Error with external editor:', error);
      return null;
    }
  };

  // Show transition editing when only an edge is selected on canvas
  if ((!selectedNode || !selectedNode.data) && selectedCanvasEdge) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Transition
        </Typography>
        <Box sx={{ p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {getNodeLabel(selectedCanvasEdge.source)} → {getNodeLabel(selectedCanvasEdge.target)}
          </Typography>

          <Box sx={{ position: 'relative', mb: 1 }}>
            <TextField
              label="Guard"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={tempGuard}
              onChange={handleGuardChangeLocal}
              onBlur={handleGuardBlur}
              onKeyDown={handleGuardKeyDown}
              placeholder="Guard condition..."
              slotProps={{ input: { sx: codeFieldStyle }, htmlInput: codeFieldInputProps }}
            />
            <IconButton
              size="small"
              onClick={() => handleExpandClick('guard')}
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

          <Box sx={{ position: 'relative' }}>
            <TextField
              label="Action"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={tempAction}
              onChange={handleActionChangeLocal}
              onBlur={handleActionBlur}
              onKeyDown={handleActionKeyDown}
              placeholder="Transition action..."
              slotProps={{ input: { sx: codeFieldStyle }, htmlInput: codeFieldInputProps }}
            />
            <IconButton
              size="small"
              onClick={() => handleExpandClick('action')}
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
        </Box>

        <CodeEditorDialog
          open={expandedField !== null}
          onClose={() => setExpandedField(null)}
          onSave={handleDialogSave}
          value={getDialogValue()}
          title={getDialogTitle()}
          onOpenExternal={settings.editorPreference !== 'builtin' ? handleOpenExternalFromDialog : undefined}
          tabWidth={settings.tabWidth}
        />
      </Box>
    );
  }

  if (!selectedNode || !selectedNode.data) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select a state to view its properties.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Properties
      </Typography>

      <TextField
        label="Name"
        size="small"
        fullWidth
        value={tempName}
        onChange={handleNameChangeLocal}
        onBlur={handleNameBlur}
        onKeyDown={handleNameKeyDown}
        disabled={selectedNode.id === '/'}
        sx={{ mb: 1 }}
      />

      <Tabs
        value={activeTab}
        onChange={(_, newValue) => setActiveTab(newValue)}
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
      >
        <Tab label="State" sx={{ minHeight: 36, py: 0 }} />
        <Tab label="Transitions" sx={{ minHeight: 36, py: 0 }} disabled={selectedNode.id === '/'} />
      </Tabs>

      {/* State Tab */}
      {activeTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>

          <FormControlLabel
            control={
              <Checkbox
                checked={(selectedNode.data.orthogonal as boolean) || false}
                onChange={handleOrthogonalChange}
                size="small"
                disabled={selectedNode.id === '/'}
              />
            }
            label="Orthogonal (parallel)"
          />

          <Box sx={{ position: 'relative' }}>
            <TextField
              label="Entry"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={tempEntry}
              onChange={handleEntryChangeLocal}
              onBlur={handleEntryBlur}
              onKeyDown={handleEntryKeyDown}
              placeholder="Entry action code..."
              slotProps={{ input: { sx: codeFieldStyle }, htmlInput: codeFieldInputProps }}
            />
            <IconButton
              size="small"
              onClick={() => handleExpandClick('entry')}
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

          <Box sx={{ position: 'relative' }}>
            <TextField
              label="Exit"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={tempExit}
              onChange={handleExitChangeLocal}
              onBlur={handleExitBlur}
              onKeyDown={handleExitKeyDown}
              placeholder="Exit action code..."
              slotProps={{ input: { sx: codeFieldStyle }, htmlInput: codeFieldInputProps }}
            />
            <IconButton
              size="small"
              onClick={() => handleExpandClick('exit')}
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

          <Box sx={{ position: 'relative' }}>
            <TextField
              label="Do"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={tempDo}
              onChange={handleDoChangeLocal}
              onBlur={handleDoBlur}
              onKeyDown={handleDoKeyDown}
              placeholder="Activity code..."
              slotProps={{ input: { sx: codeFieldStyle }, htmlInput: codeFieldInputProps }}
            />
            <IconButton
              size="small"
              onClick={() => handleExpandClick('do')}
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
        </Box>
      )}

      {/* Transitions Tab */}
      {activeTab === 1 && selectedNode.id !== '/' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {outgoingTransitions.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary">
                Outgoing (to):
              </Typography>
              <List dense disablePadding sx={{ bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #ddd' }}>
                {outgoingTransitions.map((edge) => (
                  <ListItemButton
                    key={edge.id}
                    selected={selectedEdgeId === edge.id}
                    onClick={() => setSelectedEdgeId(edge.id)}
                    sx={{ py: 0.5 }}
                  >
                    <ListItemText
                      primary={getNodeLabel(edge.target)}
                      secondary={edge.data?.guard ? `[${edge.data.guard}]` : undefined}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { fontFamily: 'monospace' } }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </>
          )}

          {incomingTransitions.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary">
                Incoming (from):
              </Typography>
              <List dense disablePadding sx={{ bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #ddd' }}>
                {incomingTransitions.map((edge) => (
                  <ListItemButton
                    key={edge.id}
                    selected={selectedEdgeId === edge.id}
                    onClick={() => setSelectedEdgeId(edge.id)}
                    sx={{ py: 0.5 }}
                  >
                    <ListItemText
                      primary={getNodeLabel(edge.source)}
                      secondary={edge.data?.guard ? `[${edge.data.guard}]` : undefined}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { fontFamily: 'monospace' } }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </>
          )}

          {outgoingTransitions.length === 0 && incomingTransitions.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No transitions for this state.
            </Typography>
          )}

          {/* Selected transition properties */}
          {selectedEdge && (
            <Box sx={{ mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Transition: {getNodeLabel(selectedEdge.source)} → {getNodeLabel(selectedEdge.target)}
              </Typography>

              <Box sx={{ position: 'relative', mb: 1 }}>
                <TextField
                  label="Guard"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={tempGuard}
                  onChange={handleGuardChangeLocal}
                  onBlur={handleGuardBlur}
                  onKeyDown={handleGuardKeyDown}
                  placeholder="Guard condition..."
                  slotProps={{ input: { sx: codeFieldStyle }, htmlInput: codeFieldInputProps }}
                />
                <IconButton
                  size="small"
                  onClick={() => handleExpandClick('guard')}
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

              <Box sx={{ position: 'relative' }}>
                <TextField
                  label="Action"
                  size="small"
                  fullWidth
                  multiline
                  rows={2}
                  value={tempAction}
                  onChange={handleActionChangeLocal}
                  onBlur={handleActionBlur}
                  onKeyDown={handleActionKeyDown}
                  placeholder="Transition action..."
                  slotProps={{ input: { sx: codeFieldStyle }, htmlInput: codeFieldInputProps }}
                />
                <IconButton
                  size="small"
                  onClick={() => handleExpandClick('action')}
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
            </Box>
          )}
        </Box>
      )}

      <CodeEditorDialog
        open={expandedField !== null}
        onClose={() => setExpandedField(null)}
        onSave={handleDialogSave}
        value={getDialogValue()}
        title={getDialogTitle()}
        onOpenExternal={settings.editorPreference !== 'builtin' ? handleOpenExternalFromDialog : undefined}
        tabWidth={settings.tabWidth}
      />
    </Box>
  );
};

export default PropertiesPanel;
