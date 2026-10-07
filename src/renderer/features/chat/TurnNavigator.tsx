import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../../domain/models';
import { IconButton, Tip } from '../../shared/ui';
import {
  chatTurnSummaries,
  filterChatTurns,
  isAcceptedUserTurn,
  turnAtRow,
  turnPreview,
} from './turn-navigation';
import '../../styles/turn-navigation.css';

const pageSize = 80;

export function TurnNavigator({
  messages,
  disabled,
  currentRow,
  onJump,
}: {
  messages: ChatMessage[];
  disabled: boolean;
  currentRow: () => string | null;
  onJump: (messageId: string) => boolean;
}) {
  const { t } = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const available = useMemo(() => messages.some(isAcceptedUserTurn), [messages]);
  if ((disabled || !available) && open) setOpen(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (value) setRowId(currentRow());
        setOpen(value);
      }}
    >
      <Tip label={t('chatJumpTitle')}>
        <Dialog.Trigger
          ref={trigger}
          className="icon-button"
          aria-label={t('chatJumpTitle')}
          disabled={disabled || !available}
        >
          <Search size={14} aria-hidden="true" />
        </Dialog.Trigger>
      </Tip>
      {open && (
        <TurnNavigationDialog
          messages={messages}
          rowId={rowId}
          onJump={onJump}
          close={() => {
            setOpen(false);
          }}
          returnFocus={() => {
            trigger.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </Dialog.Root>
  );
}

function TurnNavigationDialog({
  messages,
  rowId,
  onJump,
  close,
  returnFocus,
}: {
  messages: ChatMessage[];
  rowId: string | null;
  onJump: (messageId: string) => boolean;
  close: () => void;
  returnFocus: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focusOption = useRef(false);
  const turns = useMemo(() => chatTurnSummaries(messages), [messages]);
  const currentId = useMemo(() => turnAtRow(turns, messages, rowId), [turns, messages, rowId]);
  const [query, setQuery] = useState('');
  const [chosenId, setChosenId] = useState<string | null>(currentId);
  const [failed, setFailed] = useState(false);
  const matches = useMemo(() => filterChatTurns(turns, query), [turns, query]);
  const chosenIndex = matches.findIndex((turn) => turn.messageId === chosenId);
  const activeIndex = Math.max(0, chosenIndex);
  const pageStart = Math.floor(activeIndex / pageSize) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, matches.length);
  const activeId = matches[activeIndex]?.messageId;
  useLayoutEffect(() => {
    const option = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    option?.scrollIntoView({ block: 'nearest' });
    if (focusOption.current) option?.focus({ preventScroll: true });
    focusOption.current = false;
  }, [activeId, pageStart]);
  const select = (messageId: string) => {
    if (!turns.some((turn) => turn.messageId === messageId) || !onJump(messageId)) {
      setFailed(true);
      return;
    }
    close();
  };
  const move = (index: number, focus: boolean) => {
    const turn = matches[Math.max(0, Math.min(matches.length - 1, index))];
    if (turn) {
      focusOption.current = focus;
      setChosenId(turn.messageId);
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const searching = event.target === input.current;
    const choosing = event.target instanceof HTMLElement && event.target.getAttribute('role') === 'option';
    if (
      (!searching && !choosing) ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !matches.length
    )
      return;
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = activeIndex + 1;
    else if (event.key === 'ArrowUp') next = activeIndex - 1;
    else if (choosing && event.key === 'Home') next = 0;
    else if (choosing && event.key === 'End') next = matches.length - 1;
    else if (searching && event.key === 'Enter' && activeId) {
      event.preventDefault();
      select(activeId);
      return;
    }
    if (next !== undefined) {
      event.preventDefault();
      move(next, choosing);
    }
  };
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="modal-overlay" />
      <Dialog.Content
        className="modal turn-navigator"
        aria-describedby={undefined}
        onKeyDown={keyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <div className="modal-title">
          <Dialog.Title>{t('chatJumpTitle')}</Dialog.Title>
          <Dialog.Close asChild>
            <button type="button" className="icon-button" aria-label={t('close')}>
              <X size={18} aria-hidden="true" />
            </button>
          </Dialog.Close>
        </div>
        <div className="turn-navigator-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-label={t('chatJumpSearch')}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={`${id}-results`}
            aria-activedescendant={activeId ? `${id}-turn-${String(activeIndex)}` : undefined}
            value={query}
            maxLength={256}
            placeholder={t('chatJumpPlaceholder')}
            onChange={(event) => {
              setQuery(event.target.value);
              setChosenId(null);
              setFailed(false);
            }}
          />
        </div>
        <div
          ref={list}
          id={`${id}-results`}
          className="turn-navigator-list"
          role="listbox"
          aria-label={t('chatJumpTitle')}
        >
          {matches.slice(pageStart, pageEnd).map((turn, index) => (
            <button
              type="button"
              role="option"
              id={`${id}-turn-${String(pageStart + index)}`}
              key={turn.messageId}
              className="turn-navigator-option"
              aria-selected={turn.messageId === activeId}
              tabIndex={turn.messageId === activeId ? 0 : -1}
              onFocus={() => {
                setChosenId(turn.messageId);
              }}
              onClick={() => {
                select(turn.messageId);
              }}
            >
              <span className="turn-navigator-number">{turn.number}</span>
              <span className="turn-navigator-preview">
                <span className="turn-navigator-user">{turnPreview(turn.userText) || t('chatJumpUser')}</span>
                {turn.assistantText && (
                  <span className="turn-navigator-answer">{turnPreview(turn.assistantText)}</span>
                )}
              </span>
              {turn.messageId === currentId && (
                <span className="turn-navigator-current">{t('chatJumpCurrent')}</span>
              )}
            </button>
          ))}
        </div>
        {!matches.length && (
          <p className="turn-navigator-empty" role="status">
            {t('chatJumpEmpty')}
          </p>
        )}
        {failed && (
          <p className="error" role="alert">
            {t('chatJumpUnavailable')}
          </p>
        )}
        <div className="turn-navigator-footer">
          <span role="status">{t('chatJumpCount', { count: matches.length })}</span>
          {matches.length > pageSize && (
            <span className="turn-navigator-pages">
              <IconButton
                label={t('previous')}
                disabled={pageStart === 0}
                onClick={() => {
                  move(pageStart - pageSize, true);
                }}
              >
                <ChevronLeft size={15} aria-hidden="true" />
              </IconButton>
              <span>
                {pageStart + 1}–{pageEnd}
              </span>
              <IconButton
                label={t('next')}
                disabled={pageEnd === matches.length}
                onClick={() => {
                  move(pageEnd, true);
                }}
              >
                <ChevronRight size={15} aria-hidden="true" />
              </IconButton>
            </span>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
