import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Paper,
  Popover,
  TextField,
  IconButton,
  Typography,
  FormControlLabel,
  Checkbox,
  Box,
  Tooltip,
  Divider,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableContainer,
} from '@mui/material';
import {
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Close as CloseIcon,
  HelpOutline as HelpIcon,
  FilterList as FilterListIcon,
} from '@mui/icons-material';
import { SearchOptions, SearchMatchDisplay } from './hooks/useSearchReplace';

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
  matchDisplays: SearchMatchDisplay[];
  regexError: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onNavigateToMatch: (index: number) => void;
}

// All searchable field names, grouped for the filter UI
const FILTERABLE_FIELDS = [
  { name: 'label',            group: 'State' },
  { name: 'entry',            group: 'State / Machine' },
  { name: 'exit',             group: 'State / Machine' },
  { name: 'do',               group: 'State / Machine' },
  { name: 'annotation',       group: 'State' },
  { name: 'guard',            group: 'Transition' },
  { name: 'action',           group: 'Transition' },
  { name: 'includes',         group: 'Machine' },
  { name: 'context',          group: 'Machine' },
  { name: 'context_init',     group: 'Machine' },
  { name: 'hooks.entry',      group: 'Machine' },
  { name: 'hooks.exit',       group: 'Machine' },
  { name: 'hooks.do',         group: 'Machine' },
  { name: 'hooks.transition', group: 'Machine' },
] as const;

const ALL_FIELD_NAMES = FILTERABLE_FIELDS.map(f => f.name);

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
  matchDisplays,
  regexError,
  onClose,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  onNavigateToMatch,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLTableRowElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLElement | null>(null);
  const [fieldFilterAnchorEl, setFieldFilterAnchorEl] = useState<HTMLElement | null>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Auto-scroll the active row into view
  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentMatchIndex]);

  // Native wheel listener on the table container so scrolling works without
  // leaking events to the ReactFlow canvas underneath.
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 34;        // line mode
      else if (e.deltaMode === 2) delta *= el.clientHeight; // page mode
      el.scrollTop += delta;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isOpen]);

  // Stop propagation on all key events to prevent canvas shortcuts
  const stopPropagation = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
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

  // Stop wheel events from reaching the ReactFlow canvas underneath the panel
  const stopWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
  }, []);

  const sharedKeyHandlers = {
    onKeyDown: stopPropagation,
    onKeyUp: (e: React.KeyboardEvent) => e.stopPropagation(),
    onKeyPress: (e: React.KeyboardEvent) => e.stopPropagation(),
    onWheel: stopWheel,
  };

  if (!isOpen) return null;

  const matchDisplay = matchCount > 0
    ? `${currentMatchIndex + 1} of ${matchCount}`
    : searchTerm ? (regexError ? 'Invalid regex' : 'No matches') : '';

  // --- Field filter helpers ---
  const isFieldChecked = (fieldName: string) =>
    !options.fieldFilter || options.fieldFilter.includes(fieldName);

  const toggleField = (fieldName: string) => {
    const current = options.fieldFilter ?? ALL_FIELD_NAMES;
    const next = current.includes(fieldName)
      ? current.filter(f => f !== fieldName)
      : [...current, fieldName];
    // If all fields checked → canonical null (no filter)
    setOptions({ ...options, fieldFilter: next.length === ALL_FIELD_NAMES.length ? null : next });
  };

  const fieldFilterActive = !!options.fieldFilter && options.fieldFilter.length < ALL_FIELD_NAMES.length;

  // Group fields for the popover UI
  const fieldGroups: Record<string, typeof FILTERABLE_FIELDS[number][]> = {};
  for (const f of FILTERABLE_FIELDS) {
    if (!fieldGroups[f.group]) fieldGroups[f.group] = [];
    fieldGroups[f.group].push(f);
  }

  // --- Option checkboxes (Case / Word / Regex) ---
  const optionCheckboxes = (
    <>
      <FormControlLabel
        control={
          <Checkbox size="small" checked={options.caseSensitive}
            onChange={(e) => setOptions({ ...options, caseSensitive: e.target.checked })} />
        }
        label={<Typography variant="caption">Case</Typography>}
        sx={{ mr: 0 }}
      />
      <FormControlLabel
        control={
          <Checkbox size="small" checked={options.wholeWord}
            onChange={(e) => setOptions({ ...options, wholeWord: e.target.checked })} />
        }
        label={<Typography variant="caption">Word</Typography>}
        sx={{ mr: 0 }}
      />
      <FormControlLabel
        control={
          <Checkbox size="small" checked={options.isRegex ?? false}
            onChange={(e) => setOptions({ ...options, isRegex: e.target.checked })} />
        }
        label={<Typography variant="caption">Regex</Typography>}
        sx={{ mr: 0 }}
      />
      <Tooltip title="Regex help">
        <IconButton size="small" onClick={(e) => setHelpAnchorEl(e.currentTarget)}>
          <HelpIcon sx={{ fontSize: '1rem' }} />
        </IconButton>
      </Tooltip>
    </>
  );

  // --- Regex help popover ---
  const regexHelpPopover = (
    <Popover
      open={Boolean(helpAnchorEl)}
      anchorEl={helpAnchorEl}
      onClose={() => setHelpAnchorEl(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Box sx={{ p: 2, maxWidth: 420, fontFamily: 'monospace' }}>
        <Typography variant="subtitle2" gutterBottom sx={{ fontFamily: 'inherit' }}>
          JavaScript RegExp &mdash; ECMAScript dialect
        </Typography>

        <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', mb: 1.5 }}>
          <tbody>
            {([
              ['.', 'any character except newline'],
              ['\\d  \\w  \\s', 'digit · word char · whitespace'],
              ['\\D  \\W  \\S', 'negated versions of the above'],
              ['[abc]', 'character set (a, b, or c)'],
              ['[^abc]', 'negated set (anything but a, b, c)'],
              ['[a-z]', 'range (a through z)'],
              ['^  $', 'start / end of string'],
              ['\\b', 'word boundary'],
              ['*  +  ?', '0+, 1+, 0-or-1  (greedy)'],
              ['*?  +?  ??', 'lazy (non-greedy) variants'],
              ['{n}  {n,m}', 'exact / range quantifier'],
              ['(x)', 'capture group → $1, $2 … in replace'],
              ['(?:x)', 'non-capturing group'],
              ['a|b', 'alternation (a or b)'],
              ['(?=x)  (?!x)', 'lookahead (positive / negative)'],
            ] as [string, string][]).map(([pat, desc]) => (
              <Box component="tr" key={pat}>
                <Box component="td" sx={{ pr: 2, py: 0.15, whiteSpace: 'nowrap', fontSize: '0.78rem', color: 'primary.main' }}>
                  {pat}
                </Box>
                <Box component="td" sx={{ py: 0.15, fontSize: '0.78rem', color: 'text.secondary' }}>
                  {desc}
                </Box>
              </Box>
            ))}
          </tbody>
        </Box>

        <Divider sx={{ my: 1 }} />

        <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
          <strong>Must escape in search:</strong>{' '}
          <Box component="span" sx={{ fontFamily: 'monospace', color: 'warning.main' }}>
            . * + ? ^ $ {'{'} {'}'} ( ) | [ ] \
          </Box>
        </Typography>

        <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
          <strong>Replace references:</strong>{' '}
          <Box component="span" sx={{ fontFamily: 'monospace' }}>$1 $2</Box>
          {' '}or{' '}
          <Box component="span" sx={{ fontFamily: 'monospace' }}>\1 \2</Box>
          {' '}for capture groups &middot;{' '}
          <Box component="span" sx={{ fontFamily: 'monospace' }}>$&</Box>
          {' '}for whole match
        </Typography>

        <Divider sx={{ my: 1 }} />

        <Typography variant="caption" color="text.secondary">
          Search <em>&ldquo;MDN Regular Expressions&rdquo;</em> or <em>&ldquo;ECMAScript regex syntax&rdquo;</em> for full reference.
        </Typography>
      </Box>
    </Popover>
  );

  // --- Field filter popover ---
  const fieldFilterPopover = (
    <Popover
      open={Boolean(fieldFilterAnchorEl)}
      anchorEl={fieldFilterAnchorEl}
      onClose={() => setFieldFilterAnchorEl(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <Box sx={{ p: 1.5, minWidth: 200 }}>
        <Typography variant="subtitle2" gutterBottom>Filter by field</Typography>
        {Object.entries(fieldGroups).map(([group, fields]) => (
          <Box key={group} sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', display: 'block', mb: 0.25 }}>
              {group}
            </Typography>
            {fields.map(f => (
              <FormControlLabel
                key={f.name}
                control={
                  <Checkbox
                    size="small"
                    checked={isFieldChecked(f.name)}
                    onChange={() => toggleField(f.name)}
                  />
                }
                label={<Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{f.name}</Typography>}
                sx={{ display: 'block', ml: 0.5, mr: 0, my: 0 }}
              />
            ))}
          </Box>
        ))}
        <Divider sx={{ my: 0.5 }} />
        <Box sx={{ display: 'flex', gap: 1, pt: 0.5 }}>
          <Typography
            variant="caption"
            sx={{ cursor: 'pointer', color: 'primary.main' }}
            onClick={() => setOptions({ ...options, fieldFilter: null })}
          >
            All
          </Typography>
          <Typography
            variant="caption"
            sx={{ cursor: 'pointer', color: 'primary.main' }}
            onClick={() => setOptions({ ...options, fieldFilter: [] })}
          >
            None
          </Typography>
        </Box>
      </Box>
    </Popover>
  );

  // --- Match table ---
  const matchTable = (
    <TableContainer ref={tableContainerRef} sx={{ maxHeight: 200 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5 }}>Owner</TableCell>
            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                Field
                <Tooltip title={fieldFilterActive ? 'Field filter active — click to edit' : 'Filter fields'}>
                  <IconButton
                    size="small"
                    sx={{ p: 0.25, color: fieldFilterActive ? 'primary.main' : 'text.secondary' }}
                    onClick={(e) => setFieldFilterAnchorEl(e.currentTarget)}
                  >
                    <FilterListIcon sx={{ fontSize: '0.9rem' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.5 }}>Context</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {matchDisplays.map((display, i) => (
            <TableRow
              key={i}
              ref={i === currentMatchIndex ? activeRowRef : null}
              onClick={() => onNavigateToMatch(i)}
              selected={i === currentMatchIndex}
              hover
              sx={{ cursor: 'pointer' }}
            >
              <TableCell sx={{
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', fontSize: '0.8rem', py: 0.5,
              }}>
                {display.ownerLabel}
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem', py: 0.5, color: 'text.secondary' }}>
                {display.fieldLabel}
              </TableCell>
              <TableCell sx={{ py: 0.5 }}>
                <Box sx={{ fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  <span style={{ opacity: 0.55 }}>{display.contextBefore}</span>
                  <span style={{
                    fontWeight: 'bold',
                    background: 'rgba(25, 118, 210, 0.18)',
                    borderRadius: 2,
                    padding: '0 2px',
                  }}>
                    {display.matchText}
                  </span>
                  <span style={{ opacity: 0.55 }}>{display.contextAfter}</span>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Paper
      elevation={6}
      sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, borderRadius: '4px 4px 0 0' }}
      {...sharedKeyHandlers}
    >
      {/* Compact horizontal control bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {scopeLabel}
        </Typography>

        <Divider orientation="vertical" flexItem />

        {/* Search */}
        <TextField
          inputRef={searchInputRef}
          size="small"
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          error={regexError}
          sx={{ width: 180 }}
          inputProps={{ style: { fontSize: '0.85rem', padding: '4px 8px' } }}
        />
        <Tooltip title="Previous (Shift+Enter)">
          <span>
            <IconButton size="small" onClick={onPrev} disabled={matchCount === 0}>
              <PrevIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="caption" sx={{
          minWidth: 64, textAlign: 'center',
          color: regexError ? 'error.main' : 'text.primary',
        }}>
          {matchDisplay}
        </Typography>
        <Tooltip title="Next (Enter)">
          <span>
            <IconButton size="small" onClick={onNext} disabled={matchCount === 0}>
              <NextIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Replace */}
        <TextField
          size="small"
          placeholder="Replace"
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          sx={{ width: 160 }}
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

        <Divider orientation="vertical" flexItem />

        {optionCheckboxes}

        <Box sx={{ flex: 1 }} />

        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      {matchTable}
      {regexHelpPopover}
      {fieldFilterPopover}
    </Paper>
  );
};

export default SearchReplacePanel;
