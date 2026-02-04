# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SM-GUI is a hierarchical state machine graphical editor built with Electron and React. It provides a visual canvas for designing state machines with nested states, transitions, and state properties (entry/exit/do code).

## Build Commands

```bash
npm start          # Start Electron app in dev mode
npm run lint       # Lint TypeScript/TSX files
npm run package    # Package the application
npm run make       # Create distributable packages
```

No test framework is configured yet.

## Tech Stack

- **Electron 40** - Desktop application framework
- **React 19** - UI framework with TypeScript
- **ReactFlow 11** - Node-based graph editor library
- **Vite 5** - Build tool with Electron Forge integration
- **Zustand 5** - State management (installed, not yet used)

## Architecture

### Electron Multi-Process Model

```
Main Process (src/main.ts)
└── Creates BrowserWindow, manages app lifecycle

Preload Script (src/preload.ts)
└── Security bridge (currently minimal)

Renderer Process (src/renderer.tsx)
├── React application with ReactFlow canvas
├── StateTree sidebar component
└── PropertiesPanel component
```

### Key Files

- `src/renderer.tsx` - Main React app component, contains all state management and event handlers
- `src/StateNode.tsx` - Custom ReactFlow node component for state boxes
- `src/StateTree.tsx` - Recursive tree view of hierarchical states
- `src/PropertiesPanel.tsx` - Form for editing node properties
- `docs/sm-builder-manual.pdf` - Authoritative spec for state machine format

### Data Model

Nodes represent states:
```typescript
{
  id: string,
  type: 'stateNode',
  position: { x, y },
  parentId?: string,           // For nesting hierarchy
  extent?: 'parent',           // Constrains to parent bounds
  data: {
    label: string,             // State name (unique among siblings)
    history: boolean,
    entry: string,             // Entry action code
    exit: string,              // Exit action code
    do: string,                // Activity code
    initial?: string,          // ID of initial child state
    initialMarkerPos?: {x,y},  // Position of initial marker circle (relative to parent)
  },
  style: { width, height },
}
```

#### Edges
Edges represent transitions with source/target node IDs and arrow markers.
Edges connect states.
Cases when the connection is between an ancestor and descendant. 
  For the ancestor, the edge connect to the inside edge of the state with a few pixles offset (to the inside). 
  In case the ancestor is a target, the arrow head is on the inside pointing toward the border.
  For all other cases of connections, the transition edge engage on the outside with the same few pixels offset.
   

### Key Patterns

1. **State Hierarchy** - Unlimited nesting supported. `parentId` links children to parents, `extent: 'parent'` constrains movement.

2. **Sibling Uniqueness** - State names must be unique among siblings. Validation prevents duplicates and empty strings.

3. **Copy/Paste/Duplicate** - Complex logic preserves hierarchies, remaps IDs, handles external parent selection, auto-generates unique names.

4. **Local Form State** - Properties panel uses temporary state for inputs before committing changes to nodes.

### Keyboard Shortcuts

- `n` - Enter "add node" mode (click to place new state)
- `t` - Start transition from selected node (click target to complete), or recompute handles if a transition is selected
- `i` - Set initial state: select a child state, press I, then click in the parent to place the initial marker (small filled circle with arrow to the initial state)
- `z` - Zoom to fit selected state, or fit all states if nothing selected
- `g` - Group: make all states visually inside the selected state into its children
- `Shift+G` - Ungroup mode: move selected node out of its parent, then click additional nodes to move them out. Cursor changes to up-arrow.
- `Escape` - Exit current mode (add node, transition, ungroup, initial) or navigate up one level in semantic zoom
- `Ctrl/Cmd + c` - Copy selected nodes and descendants
- `Ctrl/Cmd + v` - Paste copied nodes
- `Ctrl/Cmd + d` - Duplicate selected nodes
- `Ctrl/Cmd + s` - Save
- `Ctrl/Cmd + Shift + s` - Export
- `Ctrl/Cmd + o` - Open

## Build Configuration

Electron Forge uses three separate Vite configs:
- `vite.main.config.ts` - Main process
- `vite.preload.config.ts` - Preload script
- `vite.renderer.config.ts` - Renderer process

DevTools open automatically in dev mode (controlled in `main.ts` line 30).
