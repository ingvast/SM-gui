import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CodeEditor from './CodeEditor';

interface CodeEditorDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
  value: string;
  title: string;
  language?: string;
  onOpenExternal?: (value: string) => Promise<string | null>;
  tabWidth?: number;
}

export const CodeEditorDialog: React.FC<CodeEditorDialogProps> = ({
  open,
  onClose,
  onSave,
  value,
  title,
  language = '',
  onOpenExternal,
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
        <Box sx={{ mt: 1, minWidth: '720px' }}>
          <CodeEditor
            value={tempValue}
            onChange={setTempValue}
            language={language}
            minLines={20}
            placeholder="Enter code..."
          />
        </Box>
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
