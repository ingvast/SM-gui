import { useEffect } from 'react';
import { Edge, Node } from 'reactflow';
import { calculateBestHandles } from '../utils/handleUtils';

interface KeyboardShortcutsParams {
  // Handlers
  handleCopy: () => Promise<void>;
  handlePaste: () => Promise<void>;
  handleDuplicate: () => void;
  handleDuplicateWithExternalEdges: () => void;
  handleSave: () => void;
  handleOpen: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleSemanticZoomToSelected: () => void;
  handleNavigateUp: () => void;
  handleGroupStates: () => void;
  handleUngroupState: (nodeId: string) => boolean;
  saveSnapshot: () => void;
  handleCopyImage: () => Promise<void>;
  handleExportPdf: () => Promise<void>;

  // State
  nodes: Node[];
  edges: Edge[];
  isAddingDecision: boolean;
  isAddingTransition: boolean;
  isUngroupingMode: boolean;
  isSettingInitial: boolean;
  isSettingHistory: boolean;
  isAddingProxy: boolean;
  selectedMarkerId: string | null;

  // Setters
  setIsAddingNode: (v: boolean) => void;
  setIsAddingDecision: (v: boolean) => void;
  setIsAddingTransition: (v: boolean) => void;
  setTransitionSourceId: (id: string | null) => void;
  setIsUngroupingMode: (v: boolean) => void;
  setIsSettingInitial: (v: boolean) => void;
  setInitialTargetId: (id: string | null) => void;
  setIsSettingHistory: (v: boolean) => void;
  setIsAddingProxy: (v: boolean) => void;
  setProxyTargetId: (id: string | null) => void;
  setSelectedMarkerId: (id: string | null) => void;
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void;
  setNodes: (updater: (nds: Node[]) => Node[]) => void;
  setRootHistory: (v: boolean) => void;
  setMachineProperties: (updater: (prev: unknown) => unknown) => void;
}

export function useKeyboardShortcuts(params: KeyboardShortcutsParams) {
  const {
    handleCopy, handlePaste, handleDuplicate, handleDuplicateWithExternalEdges, handleSave, handleOpen,
    handleUndo, handleRedo, handleSemanticZoomToSelected, handleNavigateUp,
    handleGroupStates, handleUngroupState, saveSnapshot,
    handleCopyImage, handleExportPdf,
    nodes, edges,
    isAddingDecision, isAddingTransition, isUngroupingMode, isSettingInitial, isSettingHistory, isAddingProxy,
    selectedMarkerId,
    setIsAddingNode, setIsAddingDecision, setIsAddingTransition, setTransitionSourceId,
    setIsUngroupingMode, setIsSettingInitial, setInitialTargetId, setIsSettingHistory,
    setIsAddingProxy, setProxyTargetId,
    setSelectedMarkerId, setEdges, setNodes, setRootHistory, setMachineProperties,
  } = params;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInTextInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).isContentEditable
      );

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isModifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (isInTextInput && event.key !== 'Escape') {
        return;
      }

      // Delete selected history marker
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedMarkerId?.startsWith('history-marker-')) {
        event.preventDefault();
        saveSnapshot();
        if (selectedMarkerId === 'history-marker-root') {
          setRootHistory(false);
          setMachineProperties(prev => {
            const updated = { ...(prev as Record<string, unknown>) };
            delete updated.historyMarkerPos;
            delete updated.historyMarkerSize;
            return updated;
          });
        } else {
          const stateId = selectedMarkerId.replace('history-marker-', '');
          setNodes(nds => nds.map(n => {
            if (n.id === stateId) {
              const newData = { ...n.data, history: false };
              delete (newData as Record<string, unknown>).historyMarkerPos;
              delete (newData as Record<string, unknown>).historyMarkerSize;
              return { ...n, data: newData };
            }
            return n;
          }));
        }
        setSelectedMarkerId(null);
      } else if (event.key === 'n' && !isModifierPressed) {
        event.preventDefault();
        setIsAddingNode(true);
      } else if (event.key === 'd' && !isModifierPressed) {
        event.preventDefault();
        setIsAddingDecision(true);
      } else if (event.key === 't' && !isModifierPressed) {
        event.preventDefault();
        const selectedEdge = edges.find(e => e.selected);
        if (selectedEdge) {
          saveSnapshot();
          const { sourceHandle, targetHandle } = calculateBestHandles(selectedEdge.source, selectedEdge.target, nodes);
          setEdges((eds) =>
            eds.map((edge) => {
              if (edge.id === selectedEdge.id) {
                return {
                  ...edge,
                  sourceHandle,
                  targetHandle,
                };
              }
              return edge;
            })
          );
        } else {
          const selectedNode = nodes.find(n => n.selected);
          if (selectedNode) {
            setIsAddingTransition(true);
            setTransitionSourceId(selectedNode.id);
          }
        }
      } else if (event.key === 'Escape' && isAddingDecision) {
        event.preventDefault();
        setIsAddingDecision(false);
      } else if (event.key === 'Escape' && isAddingTransition) {
        event.preventDefault();
        setIsAddingTransition(false);
        setTransitionSourceId(null);
      } else if (event.key === 'z' && !isModifierPressed) {
        event.preventDefault();
        handleSemanticZoomToSelected();
      } else if (event.key === 'g' && !isModifierPressed && !event.shiftKey) {
        event.preventDefault();
        handleGroupStates();
      } else if (event.key === 'G' && event.shiftKey && !isModifierPressed) {
        event.preventDefault();
        const selectedNode = nodes.find(n => n.selected);
        if (selectedNode && selectedNode.parentId) {
          handleUngroupState(selectedNode.id);
        }
        setIsUngroupingMode(true);
        console.log('Entered ungroup mode');
      } else if (event.key === 'i' && !isModifierPressed) {
        event.preventDefault();
        const selectedNode = nodes.find(n => n.selected);
        if (selectedNode) {
          setIsSettingInitial(true);
          setInitialTargetId(selectedNode.id);
          if (selectedNode.parentId) {
            console.log('Click on parent to place initial marker for:', selectedNode.data.label);
          } else {
            console.log('Click on canvas to place root initial marker for:', selectedNode.data.label);
          }
        }
      } else if (event.key === 'p' && !isModifierPressed) {
        event.preventDefault();
        const selectedNode = nodes.find(n => n.selected);
        if (selectedNode && selectedNode.type === 'stateNode') {
          setIsAddingProxy(true);
          setProxyTargetId(selectedNode.id);
          console.log('Click to place proxy for:', selectedNode.data.label);
        }
      } else if (event.key === 'Escape' && isAddingProxy) {
        event.preventDefault();
        setIsAddingProxy(false);
        setProxyTargetId(null);
      } else if (event.key === 'h' && !isModifierPressed) {
        event.preventDefault();
        setIsSettingHistory(true);
        console.log('Click on a state to place history marker');
      } else if (event.key === 'Escape' && isSettingHistory) {
        event.preventDefault();
        setIsSettingHistory(false);
      } else if (event.key === 'Escape' && isSettingInitial) {
        event.preventDefault();
        setIsSettingInitial(false);
        setInitialTargetId(null);
      } else if (event.key === 'Escape' && isUngroupingMode) {
        event.preventDefault();
        setIsUngroupingMode(false);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handleNavigateUp();
      } else if (isModifierPressed) {
        if (event.key === 'z' || event.key === 'Z') {
          event.preventDefault();
          if (event.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else {
          switch (event.key) {
            case 'c':
              event.preventDefault();
              if (event.shiftKey) {
                handleCopyImage();
              } else {
                handleCopy();
              }
              break;
            case 'p':
              event.preventDefault();
              handleExportPdf();
              break;
            case 'v':
              event.preventDefault();
              handlePaste();
              break;
            case 'd':
            case 'D':
              event.preventDefault();
              if (event.shiftKey) {
                handleDuplicateWithExternalEdges();
              } else {
                handleDuplicate();
              }
              break;
            case 's':
              event.preventDefault();
              if (!event.shiftKey) {
                handleSave();
              }
              // Ctrl+Shift+S (Save As) handled by Electron menu accelerator
              break;
            case 'o':
              event.preventDefault();
              handleOpen();
              break;
            default:
              break;
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    handleCopy, handlePaste, handleDuplicate, handleDuplicateWithExternalEdges, handleSave, handleOpen,
    handleSemanticZoomToSelected, handleNavigateUp, handleGroupStates, handleUngroupState,
    handleUndo, handleRedo, saveSnapshot, handleCopyImage, handleExportPdf,
    setIsAddingNode, setIsAddingDecision, isAddingDecision,
    nodes, edges, isAddingTransition, isUngroupingMode, isSettingInitial, isSettingHistory, isAddingProxy,
    selectedMarkerId, setEdges, setRootHistory, setMachineProperties, setNodes,
    setIsAddingTransition, setTransitionSourceId, setIsUngroupingMode,
    setIsSettingInitial, setInitialTargetId, setIsSettingHistory, setSelectedMarkerId,
    setIsAddingProxy, setProxyTargetId,
  ]);
}
