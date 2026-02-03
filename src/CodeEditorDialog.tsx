import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';

const codeFieldStyle = {
  fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
  fontSize: '0.9rem',
};

interface CodeEditorDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
  value: string;
  title: string;
}

export const CodeEditorDialog: React.FC<CodeEditorDialogProps> = ({
  open,
  onClose,
  onSave,
  value,
  title,
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = tempValue.substring(0, start) + '  ' + tempValue.substring(end);
      setTempValue(newValue);
      // Set cursor position after the inserted spaces
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
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
          }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CodeEditorDialog;
