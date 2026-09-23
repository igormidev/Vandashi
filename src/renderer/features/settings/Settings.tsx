import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { Modal, InfoTip } from '../../shared/ui';
import { ModelPicker } from '../chat/ModelPicker';
import { availableLocales, normalizeLocale } from '../../../domain/locales';
import { languageLabels } from '../../locales/catalogs';

export function Settings({ onClose, onChecks }: { onClose: () => void; onChecks: () => void }) {
  const { t } = useTranslation();
  const { state, api, run, refresh } = useApp();
  const [settings, setSettings] = useState(state?.settings);
  const [saving, setSaving] = useState(false);
  if (!settings) return null;
  return (
    <Modal title={t('settings')} open onClose={onClose} locked={saving}>
      <fieldset className="form" disabled={saving}>
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
      <div className="modal-actions">
        <button
          type="button"
          className="button primary"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void run(async () => {
              try {
                await api.settings(settings);
                await refresh();
                onClose();
              } finally {
                setSaving(false);
              }
            });
          }}
        >
          {t(saving ? 'loading' : 'save')}
        </button>
      </div>
    </Modal>
  );
}
