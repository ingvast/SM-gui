import React, { useState, useEffect } from 'react';

const PropertiesPanel = ({ selectedNode, onPropertyChange }) => {
  // All Hooks must be called unconditionally at the top level
  const [tempName, setTempName] = useState('');
  const [tempEntry, setTempEntry] = useState('');
  const [tempExit, setTempExit] = useState('');
  const [tempDo, setTempDo] = useState('');

  // Effect to update local states when selectedNode changes
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

  // All event handlers must be defined here, before the conditional return,
  // to ensure they are available in the JSX.
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
      event.target.blur(); // Trigger onBlur to save the change
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
    if (event.key === 'Enter' && !event.shiftKey) { // Allow Shift+Enter for new lines
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
      <div className="properties-panel-content">
        <p>Select a state to view its properties.</p>
      </div>
    );
  }

  return (
    <div className="properties-panel-content">
      <h4>Properties for: {selectedNode.data.label}</h4>
      <div>
        <label>
          Name:
          <input
            type="text"
            value={tempName} // Use local state
            onChange={handleNameChangeLocal} // Update local state on change
            onBlur={handleNameBlur} // Update global state on blur
            onKeyDown={handleNameKeyDown} // Trigger blur on Enter
            disabled={selectedNode.id === '/'} // Disable if root node
          />
        </label>
      </div>
      <div>
        <label>
          History:
          <input
            type="checkbox"
            checked={selectedNode.data.history || false}
            onChange={handleHistoryChange}
          />
        </label>
      </div>

      <div>
        <label>
          Entry:
          <textarea
            rows={4}
            value={tempEntry}
            onChange={handleEntryChangeLocal}
            onBlur={handleEntryBlur}
            onKeyDown={handleEntryKeyDown}
          />
        </label>
      </div>

      <div>
        <label>
          Exit:
          <textarea
            rows={4}
            value={tempExit}
            onChange={handleExitChangeLocal}
            onBlur={handleExitBlur}
            onKeyDown={handleExitKeyDown}
          />
        </label>
      </div>

      <div>
        <label>
          Do:
          <textarea
            rows={4}
            value={tempDo}
            onChange={handleDoChangeLocal}
            onBlur={handleDoBlur}
            onKeyDown={handleDoKeyDown}
          />
        </label>
      </div>
    </div>
  );
};

export default PropertiesPanel;