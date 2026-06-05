import { createContext } from 'react';

// True while the Alt key is held — consumed by StateNode to lock aspect ratio during resize
export const AltKeyContext = createContext(false);
