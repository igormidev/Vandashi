import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, File, Folder, Video } from 'lucide-react';
import type { Workspace } from '../../../domain/models';
import { useApp } from '../../app/store';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { diagnosticText } from '../../app/diagnostics';
import { AiButton, Loading, Empty } from '../../shared/ui';
import { FileViewer } from '../../shared/FileViewer';
import { TripleSplit } from '../../shared/TripleSplit';
import { ChatPane } from '../chat/ChatPane';
import { PresetGuide } from './PresetGuide';

export function PresetsPage() {
  const { t } = useTranslation();
  const { workspace, api, setWorkspace, busy, dirty, setChatTarget } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [directory, setDirectory] = useState('');
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<Diagnostic | null>(null);
  const [attempt, setAttempt] = useState(0);
  const owned = useRef<{ brandId: string; attempt: number; promise: Promise<Workspace> } | null>(null);
  const brandId = workspace?.scope.brandId;
  useEffect(() => {
    if (!brandId) return;
    const scope = { brandId, videoId: null, clipId: null };
    let active = true;
    if (!owned.current || owned.current.brandId !== brandId || owned.current.attempt !== attempt)
      owned.current = { brandId, attempt, promise: api.ensurePresets(scope) };
    void owned.current.promise.then(
      (next) => {
        if (active) {
          setWorkspace(next);
          setReady(true);
        }
      },
      (error: unknown) => {
        if (active) setFailure(diagnosticFromBridge(error));
      },
    );
    return () => {
      active = false;
    };
  }, [api, brandId, attempt, setWorkspace]);
  if (failure)
    return (
      <div className="page" role="alert">
        <p>{diagnosticText(failure)}</p>
        <button
          className="button"
          type="button"
          onClick={() => {
            setFailure(null);
            setAttempt(attempt + 1);
          }}
        >
          {t('retry')}
        </button>
      </div>
    );
  if (!ready) return <Loading />;
  const presets = workspace?.presets ?? [];
  const preset = presets.find((entry) => entry.id === selected) ?? presets[0];
  const blocked = busy || dirty;
  const entries =
    preset?.files.filter(
      (entry) =>
        entry.relativePath.startsWith(directory) &&
        !entry.relativePath.slice(directory.length).includes('/') &&
        entry.relativePath !== 'HOW_TO_USE.md',
    ) ?? [];
  const videos = preset?.files.filter((entry) => entry.kind === 'file' && /\.mp4$/iu.test(entry.name)) ?? [];
  return (
    <TripleSplit
      left={
        preset ? (
          <div className="preset-details">
            {file ? (
              <>
                <button
                  type="button"
                  className="button compact"
                  disabled={dirty}
                  onClick={() => {
                    setFile(null);
                  }}
                >
                  {t('presetGuide')}
                </button>
                <FileViewer
                  key={`${file}:${preset.files.find((entry) => entry.path === file)?.revision ?? ''}`}
                  path={file}
                />
              </>
            ) : (
              <PresetGuide key={`${preset.id}:${preset.revision}`} preset={preset} onFile={setFile} />
            )}
            {videos.length > 0 && (
              <div className="preset-demos">
                {videos.map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    className="button compact"
                    disabled={dirty}
                    onClick={() => {
                      setFile(entry.path);
                    }}
                  >
                    <Video size={14} />
                    {entry.relativePath}
                  </button>
                ))}
              </div>
            )}
            <div className="preset-files">
              <div className="toolbar">
                <button
                  type="button"
                  disabled={dirty}
                  onClick={() => {
                    setDirectory('');
                  }}
                >
                  {preset.name}
                </button>
                {directory && (
                  <>
                    <ChevronRight size={12} />
                    <button
                      type="button"
                      disabled={dirty}
                      onClick={() => {
                        setDirectory(
                          directory.slice(0, -1).split('/').slice(0, -1).join('/') +
                            (directory.split('/').length > 2 ? '/' : ''),
                        );
                      }}
                    >
                      {directory.slice(0, -1)}
                    </button>
                  </>
                )}
              </div>
              {entries.map((entry) => (
                <button
                  type="button"
                  key={entry.path}
                  disabled={dirty}
                  onClick={() => {
                    if (entry.kind === 'directory') setDirectory(entry.relativePath + '/');
                    else setFile(entry.path);
                  }}
                >
                  {entry.kind === 'directory' ? <Folder size={14} /> : <File size={14} />}
                  <span>{entry.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Empty icon={<Folder size={26} />} title={t('editingPresets')} />
        )
      }
      center={
        <div className="preset-list">
          <div className="section-title">
            <h2>{t('editingPresets')}</h2>
            <AiButton
              disabled={blocked}
              onClick={() => {
                setChatTarget({ topic: 'presets', title: t('editingPresets') });
              }}
            />
          </div>
          {presets.map((entry) => (
            <div className="preset-row" key={entry.id}>
              <button
                type="button"
                className={preset?.id === entry.id ? 'active' : ''}
                disabled={blocked}
                onClick={() => {
                  setSelected(entry.id);
                  setFile(null);
                  setDirectory('');
                }}
              >
                <Folder size={14} />
                {entry.name}
              </button>
              <AiButton
                disabled={blocked}
                onClick={() => {
                  setChatTarget({ topic: `preset:${entry.id}`, title: entry.name });
                }}
              />
            </div>
          ))}
        </div>
      }
      right={<ChatPane />}
    />
  );
}
