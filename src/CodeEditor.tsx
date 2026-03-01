import React, { useEffect, useRef, useMemo, useImperativeHandle } from 'react';
import { EditorView, minimalSetup } from 'codemirror';
import { EditorState, Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxTree } from '@codemirror/language';
import { linter, lintGutter, Diagnostic } from '@codemirror/lint';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';

export interface CodeEditorHandle {
  focus: () => void;
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the current editor value when the editor loses focus */
  onBlur?: (currentValue: string) => void;
  language?: string;
  placeholder?: string;
  minLines?: number;
  disabled?: boolean;
}

function getLanguageExtension(language: string): Extension[] {
  switch (language.toLowerCase()) {
    case 'python':
      return [python()];
    case 'c':
    case 'cpp':
      return [cpp()];
    case 'rust':
      return [rust()];
    default:
      return [];
  }
}

const syntaxErrorLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  syntaxTree(view.state).cursor().iterate((node) => {
    if (node.type.isError && node.to > node.from) {
      diagnostics.push({
        from: node.from,
        to: node.to,
        severity: 'warning',
        message: 'Syntax error',
      });
    }
  });
  return diagnostics;
});

const muiTheme = EditorView.theme({
  '&': {
    fontSize: '0.85rem',
    fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
    border: '1px solid rgba(0,0,0,0.23)',
    borderRadius: '4px',
    backgroundColor: '#fff',
  },
  '&.cm-focused': {
    outline: 'none',
    border: '2px solid #1976d2',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    overflowX: 'auto',
  },
  '.cm-content': {
    padding: '6px 4px',
    whiteSpace: 'pre',
    minHeight: '3.5em',
  },
  '.cm-gutters': {
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRight: '1px solid rgba(0,0,0,0.12)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
});

const CodeEditor = React.forwardRef<CodeEditorHandle, CodeEditorProps>(
  ({ value, onChange, onBlur, language = '', placeholder, minLines, disabled = false }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    // Use refs for callbacks to avoid recreating extensions on every render
    const valueRef = useRef(value);
    valueRef.current = value;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onBlurRef = useRef(onBlur);
    onBlurRef.current = onBlur;

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
    }));

    const languageExtensions = useMemo(
      () => getLanguageExtension(language),
      [language]
    );

    // Stable extensions: callbacks go through refs, so we don't include them in deps
    const extensions = useMemo((): Extension[] => {
      const exts: Extension[] = [
        minimalSetup,
        indentOnInput(),
        bracketMatching(),
        keymap.of([indentWithTab]),
        muiTheme,
        lintGutter(),
        syntaxErrorLinter,
        ...languageExtensions,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            if (newValue !== valueRef.current) {
              valueRef.current = newValue;
              onChangeRef.current(newValue);
            }
          }
        }),
        EditorView.domEventHandlers({
          blur: (_event, view) => {
            onBlurRef.current?.(view.state.doc.toString());
            return false;
          },
          // Stop keyboard events from reaching ReactFlow (which would intercept
          // Space for panning, Delete for node removal, etc.)
          keydown: (event) => { event.stopPropagation(); return false; },
          keyup:   (event) => { event.stopPropagation(); return false; },
        }),
      ];

      if (disabled) {
        exts.push(EditorState.readOnly.of(true));
      }

      if (placeholder) {
        exts.push(
          EditorView.contentAttributes.of({ 'data-placeholder': placeholder }),
          EditorView.theme({
            '.cm-content:empty::before': {
              content: 'attr(data-placeholder)',
              color: 'rgba(0,0,0,0.38)',
              pointerEvents: 'none',
              display: 'block',
              fontStyle: 'italic',
            },
          })
        );
      }

      return exts;
    }, [languageExtensions, disabled, placeholder]); // onChange/onBlur accessed via refs — intentionally omitted

    // Initialize editor on mount
    useEffect(() => {
      if (!containerRef.current) return;

      const view = new EditorView({
        state: EditorState.create({ doc: valueRef.current, extensions }),
        parent: containerRef.current,
      });
      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []); // mount only; extension changes handled by the reconfigure effect below

    // Reconfigure when language, disabled, or placeholder changes
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const currentDoc = view.state.doc.toString();
      view.setState(EditorState.create({ doc: currentDoc, extensions }));
      valueRef.current = currentDoc;
    }, [extensions]);

    // Sync external value changes (search/replace, node selection change)
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== value) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: value },
        });
        valueRef.current = value;
      }
    }, [value]);

    return (
      <div
        ref={containerRef}
        style={{
          minHeight: minLines ? `${minLines * 1.5}em` : undefined,
          width: '100%',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    );
  }
);

CodeEditor.displayName = 'CodeEditor';

export default CodeEditor;
