import React, { useState, useEffect, useMemo } from 'react';
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

// Helper to handle Tab key in code fields - inserts 2 spaces
const handleCodeFieldTab = (
  event: React.KeyboardEvent,
  value: string,
  setValue: (v: string) => void
) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const target = event.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const newValue = value.substring(0, start) + '  ' + value.substring(end);
    setValue(newValue);
    setTimeout(() => {
      target.selectionStart = target.selectionEnd = start + 2;
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

interface PropertiesPanelProps {
  selectedNode: Node | null;
  selectedCanvasEdge: Edge | null;
  nodes: Node[];
  edges: Edge[];
  onPropertyChange: (nodeId: string, property: string, value: unknown) => void;
  onEdgePropertyChange: (edgeId: string, property: string, value: unknown) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedNode,
  selectedCanvasEdge,
  nodes,
  edges,
  onPropertyChange,
  onEdgePropertyChange,
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

  useEffect(() => {
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

  const handleHistoryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedNode) {
      onPropertyChange(selectedNode.id, 'history', event.target.checked);
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
    if (event.key === 'Enter' && !event.shiftKey) {
      (event.target as HTMLInputElement).blur();
    }
    handleCodeFieldTab(event, tempEntry, setTempEntry);
  };

  const handleExitChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempExit(event.target.value);
  const handleExitBlur = () => {
    if (selectedNode && tempExit !== (selectedNode.data.exit as string)) {
      onPropertyChange(selectedNode.id, 'exit', tempExit);
    }
  };
  const handleExitKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      (event.target as HTMLInputElement).blur();
    }
    handleCodeFieldTab(event, tempExit, setTempExit);
  };

  const handleDoChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempDo(event.target.value);
  const handleDoBlur = () => {
    if (selectedNode && tempDo !== (selectedNode.data.do as string)) {
      onPropertyChange(selectedNode.id, 'do', tempDo);
    }
  };
  const handleDoKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      (event.target as HTMLInputElement).blur();
    }
    handleCodeFieldTab(event, tempDo, setTempDo);
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
    if (event.key === 'Enter' && !event.shiftKey) {
      (event.target as HTMLInputElement).blur();
    }
    handleCodeFieldTab(event, tempGuard, setTempGuard);
  };

  const handleActionChangeLocal = (event: React.ChangeEvent<HTMLInputElement>) => setTempAction(event.target.value);
  const handleActionBlur = () => {
    const edgeId = selectedCanvasEdge?.id || selectedEdgeId;
    if (edgeId && tempAction !== (selectedEdge?.data?.action || '')) {
      onEdgePropertyChange(edgeId, 'action', tempAction);
    }
  };
  const handleActionKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      (event.target as HTMLInputElement).blur();
    }
    handleCodeFieldTab(event, tempAction, setTempAction);
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
              slotProps={{ input: { sx: codeFieldStyle } }}
            />
            <IconButton
              size="small"
              onClick={() => setExpandedField('guard')}
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
              slotProps={{ input: { sx: codeFieldStyle } }}
            />
            <IconButton
              size="small"
              onClick={() => setExpandedField('action')}
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
          <TextField
            label="Name"
            size="small"
            fullWidth
            value={tempName}
            onChange={handleNameChangeLocal}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            disabled={selectedNode.id === '/'}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={(selectedNode.data.history as boolean) || false}
                onChange={handleHistoryChange}
                size="small"
              />
            }
            label="History"
          />

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
              slotProps={{ input: { sx: codeFieldStyle } }}
            />
            <IconButton
              size="small"
              onClick={() => setExpandedField('entry')}
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
              slotProps={{ input: { sx: codeFieldStyle } }}
            />
            <IconButton
              size="small"
              onClick={() => setExpandedField('exit')}
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
              slotProps={{ input: { sx: codeFieldStyle } }}
            />
            <IconButton
              size="small"
              onClick={() => setExpandedField('do')}
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
                  slotProps={{ input: { sx: codeFieldStyle } }}
                />
                <IconButton
                  size="small"
                  onClick={() => setExpandedField('guard')}
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
                  slotProps={{ input: { sx: codeFieldStyle } }}
                />
                <IconButton
                  size="small"
                  onClick={() => setExpandedField('action')}
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
      />
    </Box>
  );
};

export default PropertiesPanel;
