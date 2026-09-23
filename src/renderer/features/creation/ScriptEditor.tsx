import { FileDiff, Minus, Plus, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPatch } from 'diff';
import { defaultSettings } from '../../../domain/defaults';
import type { Workspace } from '../../../domain/models';
import { useApp } from '../../app/store';
import { IconButton, Modal, PendingLabel } from '../../shared/ui';
import { ModelPicker } from '../chat/ModelPicker';
import { RichComposer } from '../chat/RichComposer';
import { mentionReferences } from '../chat/mention-references';

export function ScriptEditor({ onBegin }: { onBegin: () => void }) {
  const { t } = useTranslation();
  const { workspace, state, api, run, busy, setDirty } = useApp();
  const original = workspace?.documents.find((document) => document.kind === 'script')?.content ?? '';
  const [versions, setVersions] = useState([original]);
  const [position, setPosition] = useState(0);
  const [dialog, setDialog] = useState<'diff' | 'save' | null>(null);
  const [guidance, setGuidance] = useState('');
  const [selection, setSelection] = useState(state?.settings.chat ?? defaultSettings.chat);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState<{ content: string; workspace: Workspace } | null>(null);
  const [fontSize, setFontSize] = useState(12);
  const logoLabel = t('logo');
  const references = useMemo(
    () => (workspace ? mentionReferences(workspace, 'creation', logoLabel) : []),
    [workspace, logoLabel],
  );
  const content = versions[position] ?? original;
  // Only the accepted draft belongs to the handoff. Later edits and adopted snapshots
  // must recover normal dirty checks even when the source revision did not change.
  const handedOff = submitted?.content === content && submitted.workspace === workspace;
  const dirty = !handedOff && content !== original;
  const move = (next: number) => {
    if (next === position) return;
    setSubmitted(null);
    setPosition(next);
  };
  const update = (value: string) => {
    if (value === content) return;
    setVersions([...versions.slice(0, position + 1), value]);
    move(position + 1);
  };
  useEffect(() => {
    setDirty(dirty);
    return () => {
      setDirty(false);
    };
  }, [dirty, setDirty]);
  return (
    <>
      <div className="script-pane">
        <div className="script-file">
          <span className="mono">
            {workspace?.documents.find((document) => document.kind === 'script')?.name}
          </span>
          <div className="spacer" />
          <IconButton
            label={t('smallerText')}
            disabled={fontSize <= 10}
            onClick={() => {
              setFontSize(fontSize - 1);
            }}
          >
            <Minus size={13} />
          </IconButton>
          <IconButton
            label={t('biggerText')}
            disabled={fontSize >= 22}
            onClick={() => {
              setFontSize(fontSize + 1);
            }}
          >
            <Plus size={13} />
          </IconButton>
        </div>
        <textarea
          className="script-editor"
          style={{ fontSize }}
          aria-label={t('script')}
          disabled={busy}
          placeholder={t('scriptPlaceholder')}
          value={content}
          onChange={(event) => {
            update(event.target.value);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
              event.preventDefault();
              move(Math.max(0, Math.min(versions.length - 1, position + (event.shiftKey ? 1 : -1))));
            }
            if ((event.metaKey || event.ctrlKey) && ['+', '=', '-'].includes(event.key)) {
              event.preventDefault();
              setFontSize(Math.max(10, Math.min(22, fontSize + (event.key === '-' ? -1 : 1))));
            }
          }}
        />
      </div>
      <div className="script-actions">
        <IconButton
          label={t('reset')}
          disabled={!dirty || busy}
          onClick={() => {
            update(original);
          }}
        >
          <RotateCcw size={15} />
        </IconButton>
        <IconButton
          label={t('undo')}
          disabled={position === 0 || busy}
          onClick={() => {
            move(position - 1);
          }}
        >
          <Undo2 size={15} />
        </IconButton>
        <IconButton
          label={t('redo')}
          disabled={position === versions.length - 1 || busy}
          onClick={() => {
            move(position + 1);
          }}
        >
          <Redo2 size={15} />
        </IconButton>
        <IconButton
          label={t('diff')}
          disabled={!dirty || busy}
          onClick={() => {
            setDialog('diff');
          }}
        >
          <FileDiff size={15} />
        </IconButton>
        <div className="spacer" />
        <button
          className="button primary"
          type="button"
          disabled={!dirty || busy}
          onClick={() => {
            setDialog('save');
          }}
        >
          {t('save')}
        </button>
      </div>
      <Modal
        title={t(dialog === 'save' ? 'syncScript' : 'changes')}
        open={dialog !== null}
        locked={saving}
        onClose={() => {
          if (!saving) setDialog(null);
        }}
        wide
      >
        <pre className="script-diff">{createPatch('script.md', original, content)}</pre>
        {dialog === 'save' && (
          <>
            <div className="field">
              <span>{t('scriptGuidance')}</span>
              <div className="composer">
                <RichComposer
                  label={t('scriptGuidance')}
                  value={guidance}
                  references={references}
                  disabled={saving}
                  onChange={setGuidance}
                  placeholder={t('scriptGuidanceHint')}
                />
              </div>
            </div>
            <div className="modal-actions">
              <ModelPicker value={selection} onChange={setSelection} disabled={saving} />
              <button
                className="button primary"
                type="button"
                disabled={saving}
                aria-busy={saving}
                onClick={() => {
                  if (!workspace) return;
                  setSaving(true);
                  void run(async () => {
                    await api.saveScript({
                      scope: workspace.scope,
                      revision: workspace.revision,
                      content,
                      guidance,
                      selection,
                    });
                    setSubmitted({ content, workspace });
                    setDirty(false);
                    setDialog(null);
                    onBegin();
                  }).finally(() => {
                    setSaving(false);
                  });
                }}
              >
                {saving ? <PendingLabel label={t('loading')} /> : t('applyScript')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
