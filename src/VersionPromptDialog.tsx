import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from '@mui/material';
import type { MissingVersionPolicy } from './yamlConverter';

interface VersionPromptDialogProps {
  open: boolean;
  filePath: string | null;
  onChoice: (choice: MissingVersionPolicy | null) => void;
}

export const VersionPromptDialog: React.FC<VersionPromptDialogProps> = ({
  open,
  filePath,
  onChoice,
}) => {
  const fileName = filePath ? filePath.replace(/^.*[\\/]/, '') : 'this file';
  return (
    <Dialog open={open} onClose={() => onChoice(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Transition format for {fileName}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
          <Typography variant="body2">
            This file has no <code>SM-builder-version</code> key, so the meaning of{' '}
            <code>../</code> in transition targets is ambiguous.
          </Typography>
          <Typography variant="body2">
            <b>Legacy (before 0.4.0):</b> <code>../x</code> meant an uncle
            (one level above the sibling scope). Choose this for files saved by
            an older version of SM-builder — paths will be rewritten to keep
            their meaning.
          </Typography>
          <Typography variant="body2">
            <b>Modern (0.4.0+):</b> <code>../x</code> means a sibling
            (standard Unix path from the source). Choose this for files written
            by hand against the new/<code>sm-compiler</code> convention.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onChoice(null)}>Cancel</Button>
        <Button onClick={() => onChoice('modern')}>Modern (0.4.0+)</Button>
        <Button
          onClick={() => onChoice('legacy')}
          variant="contained"
          autoFocus
        >
          Legacy &mdash; convert
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VersionPromptDialog;
