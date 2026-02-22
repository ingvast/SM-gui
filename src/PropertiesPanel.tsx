import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { computeRelativePath } from './yamlConverter';
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
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
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
  type?: string;
  parentId?: string;
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
  onPropertyChange: (nodeId: string, property: string, value: unknown) => boolean;
  onEdgePropertyChange: (edgeId: string, property: string, value: unknown) => void;
  onReorderEdge: (edgeId: string, direction: 'up' | 'down') => void;
  settings: Settings;
  language: string;
  focusGuard?: boolean;
  onGuardFocused?: () => void;
  focusName?: boolean;
  onNameFocused?: () => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedNode,
  selectedCanvasEdge,
  nodes,
  edges,
  onPropertyChange,
  onEdgePropertyChange,
  onReorderEdge,
  settings,
  language,
  focusGuard,
  onGuardFocused,
  focusName,
  onNameFocused,
}) => {
  const [tempName, setTempName] = useState('');
  const [tempEntry, setTempEntry] = useState('');
  const [tempExit, setTempExit] = useState('');
  const [tempDo, setTempDo] = useState('');
  const [tempAnnotation, setTempAnnotation] = useState('');
  const [tempShowAnnotation, setTempShowAnnotation] = useState(false);
  const [tempShowEntry, setTempShowEntry] = useState(false);
  const [tempShowExit, setTempShowExit] = useState(false);
  const [tempShowDo, setTempShowDo] = useState(false);
  const [expandedField, setExpandedField] = useState<'entry' | 'exit' | 'do' | 'annotation' | 'guard' | 'action' | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [tempGuard, setTempGuard] = useState('');
  const [tempAction, setTempAction] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const guardFieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const nameFieldRef = useRef<HTMLInputElement | null>(null);

  // Get node label by id (plain name, used for source display and non-transition contexts)
  const getNodeLabel = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data?.label || nodeId;
  };

  // Compute the absolute path of a node by walking the parentId chain
  const computeNodePathLocal = useCallback((nodeId: string): string => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return nodeId;
    const parts: string[] = [node.data.label];
    let current: Node = node;
    while (current.parentId) {
      const parent = nodes.find(n => n.id === current.parentId);
      if (!parent) break;
      parts.unshift(parent.data.label);
      current = parent;
    }
    return parts.join('/');
  }, [nodes]);

  // Get transition target display label using relative path rules (same as YAML export).
  // For proxy targets, resolves to the proxy's real target path before computing.
  const getTransitionTargetLabel = useCallback((sourceId: string, targetId: string): string => {
    const targetNode = nodes.find(n => n.id === targetId);
    if (!targetNode) return targetId;

    // Resolve through proxy to get the effective target path
    let effectiveTargetPath: string;
    if (targetNode.type === 'proxyNode') {
      effectiveTargetPath = (targetNode.data.targetPath as string) || targetNode.data.label;
    } else {
      effectiveTargetPath = computeNodePathLocal(targetId);
    }

    const sourcePath = computeNodePathLocal(sourceId);
    return computeRelativePath(sourcePath, effectiveTargetPath);
  }, [nodes, computeNodePathLocal]);

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
        setTempAnnotation((selectedNode.data.annotation as string) || '');
        setTempShowAnnotation((selectedNode.data.showAnnotation as boolean) || false);
        setTempShowEntry((selectedNode.data.showEntry as boolean) || false);
        setTempShowExit((selectedNode.data.showExit as boolean) || false);
        setTempShowDo((selectedNode.data.showDo as boolean) || false);
      } else {
        setTempName('');
        setTempEntry('');
        setTempExit('');
        setTempDo('');
        setTempAnnotation('');
        setTempShowAnnotation(false);
        setTempShowEntry(false);
        setTempShowExit(false);
        setTempShowDo(false);
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

  // Focus guard field when requested (e.g. after creating a new transition)
  useEffect(() => {
    if (focusGuard) {
      setTimeout(() => {
        guardFieldRef.current?.focus();
        onGuardFocused?.();
      }, 50);
    }
  }, [focusGuard, onGuardFocused]);

  // Focus and select-all the name field when requested (e.g. after creating a new state)
  useEffect(() => {
    if (focusName) {
      setTimeout(() => {
        const el = nameFieldRef.current;
        if (el) {
          el.focus();
          el.select();
        }
        onNameFocused?.();
      }, 50);
    }
  }, [focusName, onNameFocused]);

  const handleNameChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempName(event.target.value);
  };

  const handleNameBlur = () => {
    if (selectedNode && tempName !== selectedNode.data.label) {
      const accepted = onPropertyChange(selectedNode.id, 'label', tempName);
      if (!accepted) {
        // Validation rejected the change, reset to original label
        setTempName(selectedNode.data.label);
      }
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

  const handleAnnotationChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempAnnotation(event.target.value);
  const handleAnnotationBlur = () => {
    if (selectedNode && tempAnnotation !== (selectedNode.data.annotation as string)) {
      onPropertyChange(selectedNode.id, 'annotation', tempAnnotation);
    }
  };
  const handleShowAnnotationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setTempShowAnnotation(checked);
    if (selectedNode) {
      onPropertyChange(selectedNode.id, 'showAnnotation', checked);
    }
  };
  const handleShowEntryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setTempShowEntry(checked);
    if (selectedNode) {
      onPropertyChange(selectedNode.id, 'showEntry', checked);
    }
  };
  const handleShowExitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setTempShowExit(checked);
    if (selectedNode) {
      onPropertyChange(selectedNode.id, 'showExit', checked);
    }
  };
  const handleShowDoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setTempShowDo(checked);
    if (selectedNode) {
      onPropertyChange(selectedNode.id, 'showDo', checked);
    }
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
    else if (field === 'annotation') currentValue = tempAnnotation;
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
        } else if (field === 'annotation' && selectedNode) {
          setTempAnnotation(result.content);
          onPropertyChange(selectedNode.id, 'annotation', result.content);
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
    } else if (expandedField === 'annotation' && selectedNode) {
      setTempAnnotation(value);
      onPropertyChange(selectedNode.id, 'annotation', value);
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
    if (expandedField === 'annotation') return tempAnnotation;
    if (expandedField === 'guard') return tempGuard;
    if (expandedField === 'action') return tempAction;
    return '';
  };

  const getDialogTitle = () => {
    if (expandedField === 'entry') return 'Entry Action Code';
    if (expandedField === 'exit') return 'Exit Action Code';
    if (expandedField === 'do') return 'Activity Code';
    if (expandedField === 'annotation') return 'Annotation';
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
            {getNodeLabel(selectedCanvasEdge.source)} → {getTransitionTargetLabel(selectedCanvasEdge.source, selectedCanvasEdge.target)}
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
              inputRef={guardFieldRef}
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

  const isDecision = selectedNode.type === 'decisionNode';
  const isProxy = selectedNode.type === 'proxyNode';

  if (isProxy) {
    const targetPath = (selectedNode.data as { targetPath?: string }).targetPath || selectedNode.data.label;
    const broken = (selectedNode.data as { broken?: boolean }).broken;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Proxy
        </Typography>
        <Typography variant="body2" color={broken ? 'error' : 'text.primary'}>
          {broken ? '⚠ Target missing:' : 'Target:'} {targetPath}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        {isDecision ? 'Decision' : 'Properties'}
      </Typography>

      {!isDecision && (
        <TextField
          label="Name"
          size="small"
          fullWidth
          value={tempName}
          onChange={handleNameChangeLocal}
          onBlur={handleNameBlur}
          onKeyDown={handleNameKeyDown}
          disabled={selectedNode.id === '/'}
          inputRef={nameFieldRef}
          sx={{ mb: 1 }}
        />
      )}

      {!isDecision && (
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
        >
          <Tab label="State" sx={{ minHeight: 36, py: 0 }} />
          <Tab label="Transitions" sx={{ minHeight: 36, py: 0 }} disabled={selectedNode.id === '/'} />
        </Tabs>
      )}

      {/* State Tab */}
      {!isDecision && activeTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={(selectedNode.data.orthogonal as boolean) || false}
                  onChange={handleOrthogonalChange}
                  size="small"
                  disabled={selectedNode.id === '/'}
                  sx={{ p: 0.25 }}
                />
              }
              label={<Typography variant="caption">Orthogonal</Typography>}
              sx={{ ml: 0 }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Show:
              </Typography>
              <FormControlLabel
                control={<Checkbox checked={tempShowEntry} onChange={handleShowEntryChange} size="small" disabled={selectedNode.id === '/'} sx={{ p: 0.25 }} />}
                label={<Typography variant="caption">Entry</Typography>}
                sx={{ mr: 1, ml: 0 }}
              />
              <FormControlLabel
                control={<Checkbox checked={tempShowExit} onChange={handleShowExitChange} size="small" disabled={selectedNode.id === '/'} sx={{ p: 0.25 }} />}
                label={<Typography variant="caption">Exit</Typography>}
                sx={{ mr: 1, ml: 0 }}
              />
              <FormControlLabel
                control={<Checkbox checked={tempShowDo} onChange={handleShowDoChange} size="small" disabled={selectedNode.id === '/'} sx={{ p: 0.25 }} />}
                label={<Typography variant="caption">Do</Typography>}
                sx={{ mr: 1, ml: 0 }}
              />
              <FormControlLabel
                control={<Checkbox checked={tempShowAnnotation} onChange={handleShowAnnotationChange} size="small" disabled={selectedNode.id === '/'} sx={{ p: 0.25 }} />}
                label={<Typography variant="caption">Note</Typography>}
                sx={{ ml: 0 }}
              />
            </Box>
          </Box>

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

          <Box sx={{ position: 'relative' }}>
            <TextField
              label="Annotation"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={tempAnnotation}
              onChange={handleAnnotationChangeLocal}
              onBlur={handleAnnotationBlur}
              placeholder="Annotation text..."
              disabled={selectedNode.id === '/'}
            />
            <IconButton
              size="small"
              onClick={() => handleExpandClick('annotation')}
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
      {(isDecision || (activeTab === 1 && selectedNode.id !== '/')) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {outgoingTransitions.length > 0 && (() => {
            // Compute warning flags: transitions after a guardless one are unreachable
            const warningFlags: boolean[] = [];
            let seenGuardless = false;
            for (const edge of outgoingTransitions) {
              if (seenGuardless) {
                warningFlags.push(true);
              } else {
                warningFlags.push(false);
                if (!edge.data?.guard) {
                  seenGuardless = true;
                }
              }
            }
            return (
              <>
                <Typography variant="caption" color="text.secondary">
                  Outgoing (to):
                </Typography>
                <List dense disablePadding sx={{ bgcolor: 'background.paper', borderRadius: 1, border: '1px solid #ddd' }}>
                  {outgoingTransitions.map((edge, index) => (
                    <ListItemButton
                      key={edge.id}
                      selected={selectedEdgeId === edge.id}
                      onClick={() => setSelectedEdgeId(edge.id)}
                      sx={{
                        py: 0.5,
                        ...(warningFlags[index] ? { bgcolor: '#fff3e0' } : {}),
                      }}
                    >
                      <ListItemText
                        primary={getTransitionTargetLabel(edge.source, edge.target)}
                        secondary={edge.data?.guard ? `[${edge.data.guard}]` : undefined}
                        primaryTypographyProps={{
                          variant: 'body2',
                          ...(warningFlags[index] ? { sx: { color: '#e65100' } } : {}),
                        }}
                        secondaryTypographyProps={{
                          variant: 'caption',
                          sx: {
                            fontFamily: 'monospace',
                            ...(warningFlags[index] ? { color: '#e65100' } : {}),
                          },
                        }}
                      />
                      <IconButton
                        size="small"
                        disabled={index === 0}
                        onClick={(e) => { e.stopPropagation(); onReorderEdge(edge.id, 'up'); }}
                        sx={{ p: 0.25 }}
                        title="Move up"
                      >
                        <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={index === outgoingTransitions.length - 1}
                        onClick={(e) => { e.stopPropagation(); onReorderEdge(edge.id, 'down'); }}
                        sx={{ p: 0.25 }}
                        title="Move down"
                      >
                        <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </ListItemButton>
                  ))}
                </List>
              </>
            );
          })()}

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
                Transition: {getNodeLabel(selectedEdge.source)} → {getTransitionTargetLabel(selectedEdge.source, selectedEdge.target)}
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
                  inputRef={guardFieldRef}
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
