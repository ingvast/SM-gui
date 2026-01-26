import React, { useState, useEffect } from 'react'; // Import useState and useEffect

const PropertiesPanel = ({ selectedNode, onPropertyChange }) => {
  // Hooks must be called unconditionally at the top level
  const [tempName, setTempName] = useState(''); // Initialize with empty string or sensible default

  // Update tempName when selectedNode changes
  useEffect(() => {
    if (selectedNode && selectedNode.data) {
      setTempName(selectedNode.data.label || '');
    } else {
      setTempName(''); // Clear if no node selected
    }
  }, [selectedNode]); // Dependency on selectedNode

  if (!selectedNode || !selectedNode.data) {
    return (
      <div className="properties-panel-content">
        <p>Select a state to view its properties.</p>
      </div>
    );
  }


  const handleNameChangeLocal = (event) => {
    setTempName(event.target.value);
  };

  const handleNameBlur = () => {
    // Only update if the name has actually changed
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
    </div>
  );
};

export default PropertiesPanel;
