import React, { useRef, useEffect, useCallback } from 'react';
import {
  Paper,
  TextField,
  IconButton,
  Typography,
  FormControlLabel,
  Checkbox,
  Box,
  Tooltip,
} from '@mui/material';
import {
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { SearchOptions } from './hooks/useSearchReplace';

interface SearchReplacePanelProps {
  isOpen: boolean;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  replaceTerm: string;
  setReplaceTerm: (v: string) => void;
  options: SearchOptions;
  setOptions: (v: SearchOptions) => void;
  matchCount: number;
  currentMatchIndex: number;
  scopeLabel: string;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
}

const SearchReplacePanel: React.FC<SearchReplacePanelProps> = ({
  isOpen,
  searchTerm,
  setSearchTerm,
  replaceTerm,
  setReplaceTerm,
  options,
  setOptions,
  matchCount,
  currentMatchIndex,
  scopeLabel,
  onClose,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Stop propagation on all key events to prevent canvas shortcuts
  const stopPropagation = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();

    // Handle Enter/Shift+Enter for next/prev
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onNext();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      onPrev();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onNext, onPrev, onClose]);

  if (!isOpen) return null;

  const matchDisplay = matchCount > 0
    ? `${currentMatchIndex + 1} of ${matchCount}`
    : searchTerm ? 'No matches' : '';

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        p: 1.5,
        minWidth: 360,
        maxWidth: 440,
      }}
      onKeyDown={stopPropagation}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
    >
      {/* Header with scope + close */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Scope: {scopeLabel}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ ml: 1 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Search row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <TextField
          inputRef={searchInputRef}
          size="small"
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ flex: 1 }}
          inputProps={{ style: { fontSize: '0.85rem', padding: '4px 8px' } }}
        />
        <Tooltip title="Previous (Shift+Enter)">
          <IconButton size="small" onClick={onPrev} disabled={matchCount === 0}>
            <PrevIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Next (Enter)">
          <IconButton size="small" onClick={onNext} disabled={matchCount === 0}>
            <NextIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" sx={{ minWidth: 60, textAlign: 'right' }}>
          {matchDisplay}
        </Typography>
      </Box>

      {/* Replace row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <TextField
          size="small"
          placeholder="Replace"
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          sx={{ flex: 1 }}
          inputProps={{ style: { fontSize: '0.85rem', padding: '4px 8px' } }}
        />
        <Tooltip title="Replace current">
          <span>
            <IconButton size="small" onClick={onReplace} disabled={matchCount === 0}
              sx={{ fontSize: '0.7rem', fontWeight: 'bold', width: 32, height: 32 }}>
              Repl
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Replace all">
          <span>
            <IconButton size="small" onClick={onReplaceAll} disabled={matchCount === 0}
              sx={{ fontSize: '0.7rem', fontWeight: 'bold', width: 32, height: 32 }}>
              All
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Options row */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={options.caseSensitive}
              onChange={(e) => setOptions({ ...options, caseSensitive: e.target.checked })}
            />
          }
          label={<Typography variant="caption">Case sensitive</Typography>}
          sx={{ mr: 0 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={options.wholeWord}
              onChange={(e) => setOptions({ ...options, wholeWord: e.target.checked })}
            />
          }
          label={<Typography variant="caption">Whole word</Typography>}
        />
      </Box>
    </Paper>
  );
};

export default SearchReplacePanel;
