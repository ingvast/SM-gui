import { createContext, useContext } from 'react';
import { Edge } from 'reactflow';

type SetEdges = React.Dispatch<React.SetStateAction<Edge[]>>;

// Context to provide the correct setEdges from useEdgesState (not useReactFlow).
// useReactFlow().setEdges reads from the store which only contains transformedEdges
// (the filtered/visible subset), causing a 'reset' that silently deletes hidden edges.
const EdgesContext = createContext<SetEdges | null>(null);

export const EdgesProvider = EdgesContext.Provider;

export function useSetEdges(): SetEdges {
  const setEdges = useContext(EdgesContext);
  if (!setEdges) {
    throw new Error('useSetEdges must be used within an EdgesProvider');
  }
  return setEdges;
}
