import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { RotateCcw } from 'lucide-react';
import type { EditingPreset } from '../../../domain/presets';
import { useApp } from '../../app/store';
import { IconButton } from '../../shared/ui';
import { CommitDialog } from '../history/CommitDialog';

function relativeReference(value: string): string {
  try {
    return decodeURIComponent(value.split('#')[0] ?? '').replace(/^\.\//u, '');
  } catch {
    return '';
  }
}

export function PresetGuide({ preset, onFile }: { preset: EditingPreset; onFile: (path: string) => void }) {
  const { t } = useTranslation();
  const { api, busy, setDirty, setWorkspace, workspace } = useApp();
  const [content, setContent] = useState(preset.content);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dirty = content !== preset.content;
  useEffect(() => {
    setDirty(dirty);
    return () => {
      setDirty(false);
    };
  }, [dirty, setDirty]);
  return (
    <div className="preset-guide">
      <div className="toolbar">
        <strong>{preset.name}</strong>
        <span className="spacer" />
        <button
          type="button"
          className="button compact"
          disabled={busy || dirty}
          onClick={() => {
            setEditing(!editing);
          }}
        >
          {t(editing ? 'preview' : 'edit')}
        </button>
      </div>
      {editing ? (
        <textarea
          aria-label={t('presetGuide')}
          disabled={busy}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setDirty(event.target.value !== preset.content);
          }}
        />
      ) : (
        <div className="preset-markdown">
          <ReactMarkdown
            components={{
              code: ({ children, className }) => {
                const file =
                  typeof children === 'string' && !className
                    ? preset.files.find(
                        (entry) =>
                          entry.kind === 'file' &&
                          (entry.relativePath === children.replace(/^\.\//u, '') ||
                            entry.relativePath === relativeReference(children)),
                      )
                    : undefined;
                return file ? (
                  <button
                    type="button"
                    className="preset-file-link"
                    onClick={() => {
                      onFile(file.path);
                    }}
                  >
                    <code>{children}</code>
                  </button>
                ) : (
                  <code className={className}>{children}</code>
                );
              },
              img: ({ src, alt }) => {
                const file = preset.files.find(
                  (entry) => entry.kind === 'file' && entry.relativePath === relativeReference(src ?? ''),
                );
                return file ? (
                  <button
                    type="button"
                    className="preset-file-link"
                    onClick={() => {
                      onFile(file.path);
                    }}
                  >
                    {alt || file.name}
                  </button>
                ) : (
                  <span>{alt}</span>
                );
              },
              a: ({ href, children }) => {
                const relative = relativeReference(href ?? '');
                const file = preset.files.find(
                  (entry) => entry.relativePath === relative && entry.kind === 'file',
                );
                return file ? (
                  <button
                    type="button"
                    className="preset-file-link"
                    onClick={() => {
                      onFile(file.path);
                    }}
                  >
                    {children}
                  </button>
                ) : (
                  <span>{children}</span>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
      {dirty && (
        <div className="savebar">
          <IconButton
            label={t('discard')}
            disabled={busy}
            onClick={() => {
              setContent(preset.content);
              setDirty(false);
            }}
          >
            <RotateCcw size={14} />
          </IconButton>
          <button
            className="button primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirm(true);
            }}
          >
            {t('save')}
          </button>
        </div>
      )}
      {confirm && workspace && (
        <CommitDialog
          summary={JSON.stringify({ before: preset.content, after: content })}
          onClose={() => {
            setConfirm(false);
          }}
          onSave={async (commit) => {
            {
              const next = await api.savePreset({
                scope: workspace.scope,
                presetId: preset.id,
                revision: preset.revision,
                content,
                commit,
              });
              setDirty(false);
              setWorkspace(next);
              setConfirm(false);
            }
          }}
        />
      )}
    </div>
  );
}
