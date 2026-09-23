import { ArrowLeft, Play, Scissors } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelSelection, Scope, VideoSummary } from '../../../domain/models';
import { defaultSettings } from '../../../domain/defaults';
import { useApp } from '../../app/store';
import { InfoTip, Loading } from '../../shared/ui';
import { ModelPicker } from '../chat/ModelPicker';
import { constrainClipRange, timecode, validClipName, validClipRange } from './clip-range';
import { ClipTimeInput } from './ClipTimeInput';

export function ClipCreation({
  source,
  scope,
  onBack,
  onCreated,
}: {
  source: VideoSummary;
  scope: Scope;
  onBack: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { api, state, models, run, setToast, busy } = useApp();
  const [name, setName] = useState('');
  const [ratio, setRatio] = useState<'9:16' | '1:1'>('9:16');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [url, setUrl] = useState('');
  const [selection, setSelection] = useState<ModelSelection>(state?.settings.chat ?? defaultSettings.chat);
  const [creating, setCreating] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const initializedSource = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void run(async () => {
      if (source.renderedPath) {
        const next = await api.mediaUrl(source.renderedPath);
        if (active) setUrl(next);
      }
    });
    return () => {
      active = false;
    };
  }, [api, source.renderedPath, run]);
  const chooseStart = (value: number) => {
    const next = constrainClipRange({ start: Math.min(value, range.end - 0.1), end: range.end }, duration);
    setRange(next);
    if (video.current) video.current.currentTime = next.start;
    return next.start;
  };
  const chooseEnd = (value: number) => {
    const next = constrainClipRange(
      { start: range.start, end: Math.max(value, range.start + 0.1) },
      duration,
    );
    setRange(next);
    if (video.current) video.current.currentTime = next.end;
    return next.end;
  };
  const create = async () => {
    if (!validClipName(name)) {
      setToast(t('clipInvalidName'));
      return;
    }
    if (!validClipRange(range, duration)) {
      setToast(t('clipRangeBounds'));
      return;
    }
    setCreating(true);
    try {
      const result = await api.createClip({ scope, name: name.trim(), ratio, ...range, prompt, selection });
      await onCreated(result.id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };
  if (creating) return <Loading label={t('clipCreating')} />;
  return (
    <div className="clip-creation">
      <div className="clip-form-top">
        <button className="button ghost" type="button" onClick={onBack} disabled={busy}>
          <ArrowLeft size={15} />
          {t('backToClips')}
        </button>
      </div>
      <div className="clip-creation-columns">
        <div className="clip-creation-fields">
          <h1>{t('createClip')}</h1>
          <fieldset disabled={busy} className="form">
            <label className="field">
              <span>{t('clipName')}</span>
              <input
                value={name}
                maxLength={80}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                autoComplete="off"
              />
            </label>
            <div className="field">
              <span>{t('aspectRatio')}</span>
              <div className="ratio-options clip-ratios">
                {(['9:16', '1:1'] as const).map((value) => (
                  <button
                    type="button"
                    className={`ratio-option ${ratio === value ? 'selected' : ''}`}
                    aria-pressed={ratio === value}
                    key={value}
                    onClick={() => {
                      setRatio(value);
                    }}
                  >
                    <span className={`ratio-shape ${value === '9:16' ? 'vertical' : 'square'}`} />
                    <span className="ratio-label">
                      {t(value === '9:16' ? 'portrait' : 'square')}
                      <small>{t(value === '9:16' ? 'portraitRatio' : 'squareRatio')}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="clip-model">
              <ModelPicker value={selection} onChange={setSelection} disabled={busy} />
            </div>
            <button
              type="button"
              className="button primary"
              disabled={
                busy ||
                !validClipName(name) ||
                !validClipRange(range, duration) ||
                !models.length ||
                mediaFailed
              }
              onClick={() => {
                void create();
              }}
            >
              <Scissors size={15} />
              {t('createClipAction')}
            </button>
          </fieldset>
        </div>
        <div className="clip-cutting">
          <div className="section-title">
            <h2>{t('clipChooseMoment')}</h2>
            <InfoTip text={t('clipCropHelp')} />
          </div>
          <div className="clip-source-screen">
            {url && !mediaFailed ? (
              <>
                <video
                  ref={video}
                  src={url}
                  controls
                  preload="metadata"
                  aria-label={t('clipSource')}
                  onError={() => {
                    setMediaFailed(true);
                  }}
                  onLoadedMetadata={(event) => {
                    const length = event.currentTarget.duration;
                    if (Number.isFinite(length) && length > 0) {
                      setDuration(length);
                      const firstLoad = initializedSource.current !== url;
                      initializedSource.current = url;
                      setRange((current) =>
                        firstLoad
                          ? { start: 0, end: Math.min(30, length) }
                          : constrainClipRange(current, length),
                      );
                    } else setMediaFailed(true);
                  }}
                  onTimeUpdate={(event) => {
                    const player = event.currentTarget;
                    if (
                      !player.paused &&
                      (player.currentTime >= range.end || player.currentTime < range.start)
                    ) {
                      player.pause();
                      player.currentTime = range.start;
                    }
                  }}
                >
                  <track kind="captions" />
                </video>
                <div
                  className={`clip-crop-guide ${ratio === '1:1' ? 'square' : 'portrait'}`}
                  aria-label={t('clipCropGuide')}
                >
                  <span />
                  <span />
                </div>
              </>
            ) : (
              <p className="muted">
                {t(
                  mediaFailed
                    ? 'clipMediaError'
                    : source.renderedPath
                      ? 'clipSourceLoading'
                      : 'clipSourceUnavailable',
                )}
              </p>
            )}
          </div>
          <fieldset className="clip-range" disabled={busy || !duration || mediaFailed}>
            <div className="clip-range-top">
              <span className="mono">{timecode(range.start)}</span>
              <button
                className="button ghost small"
                type="button"
                onClick={() => {
                  const player = video.current;
                  if (player) {
                    player.currentTime = range.start;
                    void run(() => player.play());
                  }
                }}
              >
                <Play size={13} />
                {t('clipPreviewSelection')}
              </button>
              <span className="mono">{timecode(range.end)}</span>
            </div>
            <div className="clip-track" aria-hidden="true">
              <div
                style={{
                  left: `${String(duration ? (range.start / duration) * 100 : 0)}%`,
                  width: `${String(duration ? ((range.end - range.start) / duration) * 100 : 0)}%`,
                }}
              />
            </div>
            <label className="clip-slider">
              <span>{t('clipStartPoint')}</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, duration - 0.1)}
                step={0.1}
                value={range.start}
                onChange={(event) => {
                  chooseStart(Number(event.target.value));
                }}
              />
            </label>
            <label className="clip-slider">
              <span>{t('clipEndPoint')}</span>
              <input
                type="range"
                min={Math.min(0.1, duration)}
                max={duration || 0.1}
                step={0.1}
                value={range.end}
                onChange={(event) => {
                  chooseEnd(Number(event.target.value));
                }}
              />
            </label>
            <div className="field-row">
              <ClipTimeInput
                label={t('clipStart')}
                min={0}
                max={Math.max(0, range.end - 0.1)}
                value={range.start}
                onCommit={chooseStart}
              />
              <ClipTimeInput
                label={t('clipEnd')}
                min={range.start + 0.1}
                max={duration || 0.1}
                value={range.end}
                onCommit={chooseEnd}
              />
            </div>
            <p className="muted clip-selected-duration">
              {t('clipDuration', { duration: timecode(range.end - range.start) })}
            </p>
          </fieldset>
          <label className="field clip-direction">
            <span>{t('clipPrompt')}</span>
            <textarea
              value={prompt}
              rows={3}
              placeholder={t('clipPromptHint')}
              disabled={busy}
              onChange={(event) => {
                setPrompt(event.target.value);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
