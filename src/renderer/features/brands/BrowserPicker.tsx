import { AlertCircle, ChevronDown, Globe } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstalledBrowser } from '../../../domain/browsers';
import type { Platform } from '../../../domain/models';
import { useApp } from '../../app/store';
import { Loading, Modal, Tip } from '../../shared/ui';
import { PlatformIcon } from '../../shared/PlatformIcon';

export function BrowserPicker({
  value,
  platform,
  browsers,
  onChange,
}: {
  value: string;
  platform: Platform;
  browsers: InstalledBrowser[] | null;
  onChange: (name: string) => void;
}) {
  const { t } = useTranslation();
  const { api, run } = useApp();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<InstalledBrowser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const owner = useRef<Promise<InstalledBrowser[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = () => {
    setLoading(true);
    setFailed(false);
    const request = api.installedBrowsers();
    owner.current = request;
    void run(async () => {
      try {
        const result = await request;
        if (owner.current === request) setChoices(result);
      } catch (error) {
        if (owner.current === request) setFailed(true);
        throw error;
      } finally {
        if (owner.current === request) setLoading(false);
      }
    });
  };
  useEffect(
    () => () => {
      owner.current = null;
    },
    [],
  );
  const selected = (choices ?? browsers)?.find((browser) => browser.name === value);
  const platformName = t(platform);
  const question = t('browserForPlatform', { platform: platformName });
  return (
    <>
      <Tip
        label={value && browsers !== null && !selected ? t('browserMissing', { browser: value }) : question}
      >
        <button
          type="button"
          className="browser-select"
          aria-label={question}
          onClick={() => {
            setOpen(true);
            refresh();
          }}
        >
          {selected?.icon ? (
            <img src={selected.icon} alt="" />
          ) : value && browsers !== null && !selected ? (
            <AlertCircle size={16} />
          ) : (
            <Globe size={16} />
          )}
          <span>{value || question}</span>
          <ChevronDown size={13} />
        </button>
      </Tip>
      <Modal
        title={question}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <div className="browser-heading">
          <PlatformIcon platform={platform} />
          <span>{t(platform)}</span>
        </div>
        {loading ? (
          <Loading />
        ) : failed ? (
          <button type="button" className="button" onClick={refresh}>
            {t('retry')}
          </button>
        ) : (
          <div className="browser-choices">
            {(choices ?? []).map((browser) => (
              <button
                type="button"
                className="browser-choice"
                key={browser.name}
                onClick={() => {
                  onChange(browser.name);
                  setOpen(false);
                }}
              >
                {browser.icon ? <img src={browser.icon} alt="" /> : <Globe size={24} />}
                <span>{browser.name}</span>
              </button>
            ))}
            {choices?.length === 0 && <p className="muted">{t('noBrowsers')}</p>}
            {value && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {t('remove')}
              </button>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
