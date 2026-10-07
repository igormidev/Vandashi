import {
  Archive,
  BookmarkPlus,
  Cpu,
  Eye,
  ListChecks,
  LoaderCircle,
  Minimize2,
  PencilLine,
  Slash,
  Sparkles,
  X,
} from 'lucide-react';
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconButton, Modal, PendingLabel } from '../../shared/ui';
import type { CommandItem } from './composer-command';
import type { ComposerToolControls } from './use-composer-tools';
import '../../styles/composer-tools.css';

export function ComposerTools({ controls }: { controls: ComposerToolControls }) {
  const { t, i18n } = useTranslation();
  const id = controls.id;
  const anchor = useRef<HTMLSpanElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({ query: '', time: 0 });
  useLayoutEffect(() => {
    if (!controls.menu) return;
    const trigger = anchor.current;
    const panel = popup.current;
    if (!trigger || !panel) return;
    const position = () => {
      const composer =
        trigger.closest('.composer')?.getBoundingClientRect() ?? trigger.getBoundingClientRect();
      const width = Math.min(Math.max(composer.width, 280), 520, window.innerWidth - 24);
      panel.style.width = String(width) + 'px';
      panel.style.left = String(Math.max(12, Math.min(composer.left, window.innerWidth - width - 12))) + 'px';
      panel.style.bottom = String(window.innerHeight - composer.top - 1) + 'px';
      panel.style.maxHeight = String(Math.max(90, Math.min(composer.top - 20, 340))) + 'px';
    };
    position();
    if (trigger.contains(document.activeElement))
      (panel.querySelector<HTMLButtonElement>('[data-composer-option]:not(:disabled)') ?? panel).focus();
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !panel.contains(event.target) &&
        !trigger.contains(event.target) &&
        !trigger.closest('.composer')?.contains(event.target)
      )
        controls.close();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [controls]);
  const icon = (item: CommandItem) =>
    item.skill ? (
      <Sparkles size={15} />
    ) : item.command === 'plan' ? (
      <ListChecks size={15} />
    ) : item.command === 'read' ? (
      <Eye size={15} />
    ) : item.command === 'edit' ? (
      <PencilLine size={15} />
    ) : item.command === 'model' ? (
      <Cpu size={15} />
    ) : (
      <Minimize2 size={15} />
    );
  const description = (item: CommandItem) =>
    item.skill?.description ??
    t(
      item.command === 'plan'
        ? 'commandPlanHelp'
        : item.command === 'read'
          ? 'commandReadHelp'
          : item.command === 'edit'
            ? 'commandEditHelp'
            : item.command === 'model'
              ? 'commandModelHelp'
              : 'commandCompactHelp',
    );
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = popup.current?.querySelectorAll<HTMLButtonElement>(
      '[data-composer-option]:not(:disabled)',
    );
    if (event.key === 'Escape') {
      event.preventDefault();
      controls.close();
      return;
    }
    if (!buttons?.length) return;
    const current = Array.from(buttons).findIndex((button) => button === document.activeElement);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowUp') next = (current + buttons.length - 1) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      search.current = {
        query:
          `${event.timeStamp - search.current.time < 700 ? search.current.query : ''}${event.key}`.toLocaleLowerCase(),
        time: event.timeStamp,
      };
      for (let offset = 1; offset <= buttons.length; offset++) {
        const index = (current + offset + buttons.length) % buttons.length;
        if (
          buttons
            .item(index)
            .textContent.replace(/^[/$]/u, '')
            .toLocaleLowerCase()
            .startsWith(search.current.query)
        ) {
          next = index;
          break;
        }
      }
    }
    if (next !== null) {
      event.preventDefault();
      buttons.item(next).focus();
    }
  };
  return (
    <>
      <span className="composer-tools" ref={anchor}>
        <IconButton
          label={t('composerCommands')}
          disabled={controls.locked}
          aria-haspopup="listbox"
          aria-expanded={controls.menu === 'commands'}
          aria-controls={controls.menu === 'commands' ? id : undefined}
          onClick={controls.menu === 'commands' ? controls.close : controls.openCommands}
        >
          <Slash size={15} />
        </IconButton>
        <IconButton
          label={t('composerStashTitle')}
          disabled={controls.locked}
          aria-haspopup="dialog"
          aria-expanded={controls.menu === 'stash'}
          aria-controls={controls.menu === 'stash' ? id : undefined}
          onClick={controls.menu === 'stash' ? controls.close : controls.openStash}
        >
          <Archive size={15} />
          {controls.entries.length > 0 && (
            <span className="composer-stash-count">{controls.entries.length}</span>
          )}
        </IconButton>
        <IconButton
          label={t('usageCompact')}
          disabled={!controls.canCompact || controls.compacting}
          aria-busy={controls.compacting}
          onClick={controls.compact}
        >
          {controls.compacting ? <LoaderCircle className="spin" size={15} /> : <Minimize2 size={15} />}
        </IconButton>
      </span>
      {controls.menu &&
        createPortal(
          <div
            ref={popup}
            id={id}
            className="composer-tool-popup"
            role={controls.menu === 'commands' ? 'listbox' : 'dialog'}
            aria-label={t(controls.menu === 'commands' ? 'composerCommands' : 'composerStashTitle')}
            tabIndex={-1}
            onKeyDown={keyboard}
          >
            <div className="composer-tool-heading">
              <strong>{t(controls.menu === 'commands' ? 'composerCommands' : 'composerStashTitle')}</strong>
              <IconButton label={t('close')} onClick={controls.close}>
                <X size={13} />
              </IconButton>
            </div>
            {controls.menu === 'commands' ? (
              <>
                {controls.items.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === Math.min(controls.selected, controls.items.length - 1)}
                    id={`${id}-command-${String(index)}`}
                    data-composer-option="true"
                    disabled={controls.disabled(item)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onMouseEnter={() => {
                      controls.setSelected(index);
                    }}
                    onFocus={() => {
                      controls.setSelected(index);
                    }}
                    onClick={() => {
                      controls.choose(item);
                    }}
                  >
                    {icon(item)}
                    <span>
                      <b>{item.id}</b>
                      <small>{description(item)}</small>
                    </span>
                  </button>
                ))}
                {controls.loading && (
                  <div className="composer-tool-status" role="status">
                    <PendingLabel label={t('composerSkillsLoading')} />
                  </div>
                )}
                {controls.skillFailure && (
                  <div className="composer-tool-status">
                    <span>{t('composerSkillsUnavailable')}</span>
                    <button className="button small" type="button" onClick={controls.retrySkills}>
                      {t('retry')}
                    </button>
                  </div>
                )}
                {!controls.items.length && !controls.loading && !controls.skillFailure && (
                  <div className="composer-tool-status">{t('composerNoCommands')}</div>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  data-composer-option="true"
                  disabled={!controls.canStash}
                  onClick={controls.stash}
                >
                  <BookmarkPlus size={14} />
                  <span>
                    <b>{t('composerStashSave')}</b>
                  </span>
                </button>
                {!controls.entries.length && (
                  <div className="composer-tool-status">{t('composerStashEmpty')}</div>
                )}
                {controls.entries.map((entry) => (
                  <div key={entry.id} className="composer-stash-row">
                    <button
                      type="button"
                      data-composer-option="true"
                      disabled={controls.locked}
                      onClick={() => {
                        controls.restore(entry);
                      }}
                      aria-label={t('composerStashRestore')}
                    >
                      <Archive size={14} />
                      <span>
                        <b>{entry.draft.text || t('composerStashAttachments')}</b>
                        <small>
                          {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(entry.createdAt))}
                        </small>
                      </span>
                    </button>
                    <IconButton
                      label={t('composerStashRemove')}
                      disabled={controls.locked}
                      onClick={() => {
                        controls.remove(entry.id);
                      }}
                    >
                      <X size={13} />
                    </IconButton>
                  </div>
                ))}
                {controls.stashFailure && (
                  <div role="alert" className="composer-tool-status error-text">
                    {t('composerStashFailed')}
                  </div>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
      <Modal
        open={!!controls.review}
        title={t('composerStashRestore')}
        description={t('composerStashReview')}
        onClose={controls.closeReview}
      >
        <div className="composer-stash-preview">
          {controls.review?.draft.text || t('composerStashAttachments')}
        </div>
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={controls.closeReview}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              if (controls.review) controls.restore(controls.review, true);
            }}
          >
            {t('composerStashSwap')}
          </button>
        </div>
        {controls.stashFailure && (
          <div role="alert" className="error-text">
            {t('composerStashFailed')}
          </div>
        )}
      </Modal>
    </>
  );
}
