import { UpdateCheck } from '../updates/UpdateControls';
import type { UpdateControl } from '../updates/use-updates';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { Modal, InfoTip, PendingLabel } from '../../shared/ui';
import { ModelPicker } from '../chat/ModelPicker';
import { availableLocales, normalizeLocale } from '../../../domain/locales';
import { languageLabels } from '../../locales/catalogs';
import { transcriptionModels } from '../../../domain/transcription';
import { TranscriptionStatus, useTranscriptionProgress } from '../transcription/TranscriptionStatus';

export function Settings({
  onClose,
  onChecks,
  updates,
}: {
  onClose: () => void;
  onChecks: () => void;
  updates: UpdateControl;
}) {
  const { t } = useTranslation();
  const { state, api, run, refresh } = useApp();
  const [settings, setSettings] = useState(state?.settings);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const progress = useTranscriptionProgress();
  const saveOwner = useRef(false);
  const locked = saving || installing || updates.working;
  if (!settings) return null;
  return (
    <Modal title={t('settings')} open onClose={onClose} locked={locked}>
      <fieldset className="form" disabled={locked}>
        <label className="field">
          <span>{t('language')}</span>
          <select
            value={settings.locale}
            onChange={(event) => {
              setSettings({ ...settings, locale: normalizeLocale(event.target.value) });
            }}
          >
            {availableLocales.map((locale) => (
              <option key={locale} value={locale}>
                {t(languageLabels[locale])}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">
            <span>{t('defaultChat')}</span>
          </span>
          <ModelPicker
            value={settings.chat}
            onChange={(chat) => {
              setSettings({ ...settings, chat });
            }}
          />
        </div>
        <div className="field">
          <span className="field-label">
            <span>
              {t('commitModel')}
              <InfoTip text={t('commitModelHelp')} />
            </span>
          </span>
          <ModelPicker
            value={settings.automation}
            onChange={(automation) => {
              setSettings({ ...settings, automation });
            }}
          />
        </div>
        <div className="field">
          <span>{t('assetMetadataModel')}</span>
          <ModelPicker
            value={settings.assetMetadata}
            onChange={(assetMetadata) => {
              setSettings({ ...settings, assetMetadata });
            }}
          />
        </div>
        <div className="field">
          <span>{t('chapterModel')}</span>
          <ModelPicker
            value={settings.chapters}
            onChange={(chapters) => {
              setSettings({ ...settings, chapters });
            }}
          />
        </div>
        <label className="field">
          <span>
            {t('transcriptionModel')}
            <InfoTip text={t('transcriptionModelHelp')} />
          </span>
          <select
            value={settings.transcriptionModel}
            aria-label={t('transcriptionModel')}
            aria-busy={installing}
            onChange={(event) => {
              const model = transcriptionModels.find((entry) => entry === event.target.value);
              if (!model || saveOwner.current) return;
              saveOwner.current = true;
              setInstalling(true);
              void run(async () => {
                try {
                  await api.prepareTranscriptionModel(model);
                  setSettings((current) => (current ? { ...current, transcriptionModel: model } : current));
                } finally {
                  saveOwner.current = false;
                  setInstalling(false);
                }
              });
            }}
          >
            {transcriptionModels.map((model) => (
              <option value={model} key={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        {installing && <TranscriptionStatus progress={progress ?? { phase: 'installing' }} />}
        <div className="field">
          <span className="field-label">
            <span>
              {t('scriptSyncModel')}
              <InfoTip text={t('scriptSyncHelp')} />
            </span>
          </span>
          <ModelPicker
            value={settings.scriptSync}
            onChange={(scriptSync) => {
              setSettings({ ...settings, scriptSync });
            }}
          />
        </div>
        <button className="button" type="button" onClick={onChecks}>
          {t('checkTools')}
        </button>
      </fieldset>
      <div className="modal-actions settings-actions">
        <UpdateCheck updates={updates} disabled={saving || installing} />
        <button
          type="button"
          className="button primary"
          disabled={locked}
          aria-busy={saving}
          onClick={() => {
            if (saveOwner.current) return;
            saveOwner.current = true;
            setSaving(true);
            void run(async () => {
              try {
                await api.settings(settings);
                if (await refresh()) onClose();
              } finally {
                saveOwner.current = false;
                setSaving(false);
              }
            });
          }}
        >
          {saving ? <PendingLabel label={t('loading')} /> : t('save')}
        </button>
      </div>
    </Modal>
  );
}
