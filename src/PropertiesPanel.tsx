import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
} from '@mui/material';

const PropertiesPanel = ({ selectedNode, onPropertyChange }) => {
  const [tempName, setTempName] = useState('');
  const [tempEntry, setTempEntry] = useState('');
  const [tempExit, setTempExit] = useState('');
  const [tempDo, setTempDo] = useState('');

  useEffect(() => {
    if (selectedNode && selectedNode.data) {
      setTempName(selectedNode.data.label || '');
      setTempEntry(selectedNode.data.entry || '');
      setTempExit(selectedNode.data.exit || '');
      setTempDo(selectedNode.data.do || '');
    } else {
      setTempName('');
      setTempEntry('');
      setTempExit('');
      setTempDo('');
    }
  }, [selectedNode]);

  const handleNameChangeLocal = (event) => {
    setTempName(event.target.value);
  };

  const handleNameBlur = () => {
    if (tempName !== selectedNode.data.label) {
      onPropertyChange(selectedNode.id, 'label', tempName);
    }
  };

  const handleNameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.target.blur();
    }
  };

  const handleHistoryChange = (event) => {
    onPropertyChange(selectedNode.id, 'history', event.target.checked);
  };

  const handleEntryChangeLocal = (event) => setTempEntry(event.target.value);
  const handleEntryBlur = () => {
    if (tempEntry !== selectedNode.data.entry) {
      onPropertyChange(selectedNode.id, 'entry', tempEntry);
    }
  };
  const handleEntryKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.target.blur();
    }
  };

  const handleExitChangeLocal = (event) => setTempExit(event.target.value);
  const handleExitBlur = () => {
    if (tempExit !== selectedNode.data.exit) {
      onPropertyChange(selectedNode.id, 'exit', tempExit);
    }
  };
  const handleExitKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.target.blur();
    }
  };

  const handleDoChangeLocal = (event) => setTempDo(event.target.value);
  const handleDoBlur = () => {
    if (tempDo !== selectedNode.data.do) {
      onPropertyChange(selectedNode.id, 'do', tempDo);
    }
  };
  const handleDoKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.target.blur();
    }
  };

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            checked={selectedNode.data.history || false}
            onChange={handleHistoryChange}
            size="small"
          />
        }
        label="History"
      />

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
      />

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
      />

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
      />
    </Box>
  );
};

export default PropertiesPanel;
