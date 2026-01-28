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
  },
  style: { width, height },
}
```

Edges represent transitions with source/target node IDs and arrow markers.

### Key Patterns

1. **State Hierarchy** - Unlimited nesting supported. `parentId` links children to parents, `extent: 'parent'` constrains movement.

2. **Sibling Uniqueness** - State names must be unique among siblings. Validation prevents duplicates and empty strings.

3. **Copy/Paste/Duplicate** - Complex logic preserves hierarchies, remaps IDs, handles external parent selection, auto-generates unique names.

4. **Local Form State** - Properties panel uses temporary state for inputs before committing changes to nodes.

### Keyboard Shortcuts

- `n` - Enter "add node" mode
- `Ctrl/Cmd + c` - Copy selected nodes and descendants
- `Ctrl/Cmd + v` - Paste copied nodes
- `Ctrl/Cmd + d` - Duplicate selected nodes

## Build Configuration

Electron Forge uses three separate Vite configs:
- `vite.main.config.ts` - Main process
- `vite.preload.config.ts` - Preload script
- `vite.renderer.config.ts` - Renderer process

DevTools open automatically in dev mode (controlled in `main.ts` line 30).
