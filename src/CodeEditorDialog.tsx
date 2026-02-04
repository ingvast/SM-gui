import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const codeFieldStyle = {
  fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
  fontSize: '0.9rem',
};

const codeFieldInputProps = {
  style: {
    whiteSpace: 'pre',
    overflowX: 'auto',
    overflowWrap: 'normal',
    wordBreak: 'keep-all',
  },
};

interface CodeEditorDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
  value: string;
  title: string;
  onOpenExternal?: (value: string) => Promise<string | null>;
  tabWidth?: number;
}

export const CodeEditorDialog: React.FC<CodeEditorDialogProps> = ({
  open,
  onClose,
  onSave,
  value,
  title,
  onOpenExternal,
  tabWidth = 4,
}) => {
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    if (open) {
      setTempValue(value);
    }
  }, [open, value]);

  const handleSave = () => {
    onSave(tempValue);
    onClose();
  };

  const handleOpenExternal = async () => {
    if (onOpenExternal) {
      const result = await onOpenExternal(tempValue);
      if (result !== null) {
        setTempValue(result);
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      // Find the start of the current line to calculate column position
      const textBeforeCursor = tempValue.substring(0, start);
      const lastNewlineIndex = textBeforeCursor.lastIndexOf('\n');
      const currentColumn = start - (lastNewlineIndex + 1);

      // Calculate spaces needed to reach next tab stop
      const spacesToAdd = tabWidth - (currentColumn % tabWidth);
      const spaces = ' '.repeat(spacesToAdd);

      const newValue = tempValue.substring(0, start) + spaces + tempValue.substring(end);
      setTempValue(newValue);
      // Set cursor position after the inserted spaces
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + spacesToAdd;
      }, 0);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minWidth: '800px' },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          rows={20}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter code..."
          slotProps={{
            input: {
              sx: {
                ...codeFieldStyle,
                minWidth: '720px',
              },
            },
            htmlInput: codeFieldInputProps,
          }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-start' }}>
          {onOpenExternal && (
            <Button
              onClick={handleOpenExternal}
              startIcon={<OpenInNewIcon />}
              size="small"
            >
              Open in External Editor
            </Button>
          )}
        </Box>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CodeEditorDialog;
