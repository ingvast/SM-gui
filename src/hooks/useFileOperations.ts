import { useCallback, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { convertToYaml, convertFromYaml, convertToPhoenixYaml, MachineProperties, defaultMachineProperties } from '../yamlConverter';
import { resetIdCounter, resetStateNameCounter } from '../utils/idCounters';

export function useFileOperations(
  nodes: Node[],
  edges: Edge[],
  rootHistory: boolean,
  machineProperties: MachineProperties,
  currentFilePath: string | null,
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void,
  setRootHistory: (v: boolean) => void,
  setMachineProperties: (v: MachineProperties) => void,
  setSelectedTreeItem: (id: string | null) => void,
  setCurrentFilePath: (path: string | null) => void,
  clearUndoRedo: () => void,
) {
  const handleSave = useCallback(async () => {
    const yamlContent = convertToYaml(nodes as Node<{ label: string; history: boolean; entry: string; exit: string; do: string }>[], edges, rootHistory, true, machineProperties);
    let result;
    if (currentFilePath) {
      result = await window.fileAPI.saveFileDirect(yamlContent, currentFilePath);
    } else {
      result = await window.fileAPI.saveFile(yamlContent, 'statemachine.smb');
    }
    if (result.success && result.filePath) {
      setCurrentFilePath(result.filePath);
    } else if (result.error) {
      alert('Error saving file: ' + result.error);
    }
  }, [nodes, edges, rootHistory, machineProperties, currentFilePath, setCurrentFilePath]);

  const handleOpen = useCallback(async () => {
    const result = await window.fileAPI.openFile();
    if (result.success && result.content) {
      try {
        const { nodes: loadedNodes, edges: loadedEdges, rootHistory: loadedRootHistory, machineProperties: loadedMachineProperties } = convertFromYaml(result.content);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        setRootHistory(loadedRootHistory);
        setMachineProperties(loadedMachineProperties);
        setSelectedTreeItem(null);
        // Update idCounter to avoid conflicts
        const maxId = loadedNodes.reduce((max, node) => {
          const match = node.id.match(/node_(\d+)/);
          if (match) {
            return Math.max(max, parseInt(match[1], 10));
          }
          return max;
        }, 0);
        resetIdCounter(maxId + 1);
        // Update stateNameCounter based on existing S# names
        const maxStateNum = loadedNodes.reduce((max, node) => {
          const match = node.data.label.match(/^S(\d+)$/);
          if (match) {
            return Math.max(max, parseInt(match[1], 10));
          }
          return max;
        }, 0);
        resetStateNameCounter(maxStateNum + 1);
        setCurrentFilePath(result.filePath || null);
        clearUndoRedo();
      } catch (error) {
        alert('Error parsing YAML file: ' + (error as Error).message);
      }
    } else if (result.error) {
      alert('Error opening file: ' + result.error);
    }
  }, [setNodes, setEdges, setRootHistory, setMachineProperties, setSelectedTreeItem, setCurrentFilePath, clearUndoRedo]);

  const handleNew = useCallback(() => {
    if (nodes.length > 0) {
      const confirmed = window.confirm('Are you sure you want to create a new state machine? Unsaved changes will be lost.');
      if (!confirmed) {
        return;
      }
    }
    setNodes([]);
    setEdges([]);
    setRootHistory(false);
    setMachineProperties(defaultMachineProperties);
    setSelectedTreeItem(null);
    setCurrentFilePath(null);
    resetIdCounter(1);
    resetStateNameCounter(1);
    clearUndoRedo();
  }, [nodes, setNodes, setEdges, setRootHistory, setMachineProperties, setSelectedTreeItem, setCurrentFilePath, clearUndoRedo]);

  const handleSaveAs = useCallback(async () => {
    const yamlContent = convertToYaml(nodes as Node<{ label: string; history: boolean; entry: string; exit: string; do: string }>[], edges, rootHistory, true, machineProperties);
    const defaultName = currentFilePath
      ? currentFilePath.replace(/^.*[\\/]/, '')
      : 'statemachine.smb';
    const result = await window.fileAPI.saveFile(yamlContent, defaultName);
    if (result.success && result.filePath) {
      setCurrentFilePath(result.filePath);
    } else if (result.error) {
      alert('Error saving file: ' + result.error);
    }
  }, [nodes, edges, rootHistory, machineProperties, currentFilePath, setCurrentFilePath]);

  const handleExportPhoenix = useCallback(async () => {
    const { yaml: phoenixYaml, warnings } = convertToPhoenixYaml(
      nodes as Node<{ label: string; history: boolean; orthogonal: boolean; entry: string; exit: string; do: string }>[],
      edges,
    );

    let defaultName = 'statemachine-phoenix.yaml';
    if (currentFilePath) {
      const baseName = currentFilePath.replace(/\.(smb|yaml|yml)$/i, '');
      defaultName = baseName + '-phoenix.yaml';
    }

    const result = await window.fileAPI.saveFile(phoenixYaml, defaultName);
    if (result.success) {
      if (warnings.length > 0) {
        alert('Export to Phoenix completed with warnings:\n\n' + warnings.join('\n'));
      }
    } else if (result.error) {
      alert('Error exporting file: ' + result.error);
    }
  }, [nodes, edges, currentFilePath]);

  useEffect(() => {
    const cleanup = window.fileAPI.onExportPhoenix(handleExportPhoenix);
    return cleanup;
  }, [handleExportPhoenix]);

  useEffect(() => {
    const cleanup = window.fileAPI.onSaveAs(handleSaveAs);
    return cleanup;
  }, [handleSaveAs]);

  return { handleSave, handleOpen, handleNew, handleExportPhoenix, handleSaveAs };
}
