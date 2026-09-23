import { FileDiff, Minus, Plus, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPatch } from 'diff';
import { defaultSettings } from '../../../domain/defaults';
import { useApp } from '../../app/store';
import { IconButton, Modal } from '../../shared/ui';
import { ModelPicker } from '../chat/ModelPicker';

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
  const [submitted, setSubmitted] = useState(false);
  const [fontSize, setFontSize] = useState(12);
  const content = versions[position] ?? original;
  const dirty = !submitted && content !== original;
  const update = (value: string) => {
    if (value === content) return;
    setVersions([...versions.slice(0, position + 1), value]);
    setPosition(position + 1);
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
              setPosition(Math.max(0, Math.min(versions.length - 1, position + (event.shiftKey ? 1 : -1))));
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
            setPosition(position - 1);
          }}
        >
          <Undo2 size={15} />
        </IconButton>
        <IconButton
          label={t('redo')}
          disabled={position === versions.length - 1 || busy}
          onClick={() => {
            setPosition(position + 1);
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
            <label className="field">
              <span>{t('scriptGuidance')}</span>
              <textarea
                value={guidance}
                disabled={saving}
                onChange={(event) => {
                  setGuidance(event.target.value);
                }}
                placeholder={t('scriptGuidanceHint')}
              />
            </label>
            <div className="modal-actions">
              <ModelPicker value={selection} onChange={setSelection} disabled={saving} />
              <button
                className="button primary"
                type="button"
                disabled={saving}
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
                    setSubmitted(true);
                    setDirty(false);
                    setDialog(null);
                    onBegin();
                  }).finally(() => {
                    setSaving(false);
                  });
                }}
              >
                {t(saving ? 'loading' : 'applyScript')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
