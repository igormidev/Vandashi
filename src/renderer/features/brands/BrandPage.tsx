import { ImagePlus, Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { platforms } from '../../../domain/defaults';
import { useApp } from '../../app/store';
import { AiButton, IconButton } from '../../shared/ui';
import { PlatformIcon } from '../../shared/PlatformIcon';
import { CommitDialog } from '../history/CommitDialog';
import { TasteIcon } from './TasteIcon';
import { tasteLabelKey } from '../../locales/taste-labels';

export function BrandPage() {
  const { t } = useTranslation();
  const { workspace, api, run, busy, setDirty, setWorkspace, setChatTarget } = useApp();
  const [config, setConfig] = useState(workspace?.brand.config);
  const [documents, setDocuments] = useState(workspace?.documents ?? []);
  const [logo, setLogo] = useState<{ path: string; revision: string; url: string } | null>(null);
  const [active, setActive] = useState(0);
  const [fontSize, setFontSize] = useState(12);
  const [confirm, setConfirm] = useState(false);
  const dirty =
    JSON.stringify(config) !== JSON.stringify(workspace?.brand.config) ||
    JSON.stringify(documents) !== JSON.stringify(workspace?.documents ?? []);
  useEffect(() => {
    setDirty(dirty);
    return () => {
      setDirty(false);
    };
  }, [dirty, setDirty]);
  const imagePath = config?.image;
  const brandPath = workspace?.brand.path;
  const revision = workspace?.revision;
  const logoUrl = logo?.path === imagePath && logo?.revision === revision ? logo?.url : '';
  useEffect(() => {
    let active = true;
    if (imagePath && brandPath && revision)
      void api
        .mediaUrl(
          /^(?:[A-Za-z]:[\\/]|\/)/.test(imagePath) ? imagePath : `${brandPath}/brand_identity/${imagePath}`,
        )
        .then((url) => {
          const source = new URL(url);
          source.searchParams.set('revision', revision);
          if (active) setLogo({ path: imagePath, revision, url: source.href });
        })
        .catch(() => {
          if (active) setLogo(null);
        });
    return () => {
      active = false;
    };
  }, [api, imagePath, brandPath, revision]);
  if (!workspace || !config) return null;
  const changedDocuments = documents.filter(
    (document) =>
      workspace.documents.find((original) => original.path === document.path)?.content !== document.content,
  );
  const tastes = documents.filter((document) => document.kind === 'taste');
  const selected = tastes[active];
  const tasteLabel = (name: string) => {
    const key = tasteLabelKey(name);
    return key ? t(key) : name;
  };
  const label = selected ? tasteLabel(selected.name) : '';
  const ask = (topic: string, title: string) => {
    setChatTarget({ topic, title });
  };
  return (
    <>
      <div className="panel-scroll brand-panel">
        <fieldset disabled={busy}>
          <section className="form-section">
            <div className="section-title">
              <h2>{t('brandAttributes')}</h2>
              <AiButton
                disabled={dirty || busy}
                onClick={() => {
                  ask('brand', t('brandAttributes'));
                }}
              />
            </div>
            <div className="form">
              <div className="field-row">
                <label className="field">
                  <span>{t('name')}</span>
                  <input
                    value={config.name}
                    minLength={3}
                    onChange={(event) => {
                      setConfig({ ...config, name: event.target.value });
                    }}
                  />
                </label>
                <div className="field">
                  <span>{t('logo')}</span>
                  <div className="brand-image-field">
                    {config.image && logoUrl && <img src={logoUrl} alt={t('logo')} />}
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        void run(async () => {
                          const path = (await api.chooseFiles('images'))[0];
                          if (path) setConfig({ ...config, image: path });
                        });
                      }}
                    >
                      <ImagePlus size={14} />
                      {t('chooseFile')}
                    </button>
                  </div>
                </div>
              </div>
              <label className="field">
                <span>{t('theme')}</span>
                <textarea
                  value={config.description}
                  onChange={(event) => {
                    setConfig({ ...config, description: event.target.value });
                  }}
                  rows={3}
                />
              </label>
              <div className="field">
                <span>{t('platforms')}</span>
                <div className="platform-fields">
                  {platforms
                    .filter((platform) => platform !== 'youtubeShorts')
                    .map((platform) => (
                      <div className="platform-field" key={platform}>
                        <PlatformIcon platform={platform} />
                        <input
                          type="url"
                          aria-label={`${t(platform)} ${t('channelUrl')}`}
                          placeholder={t(platform)}
                          value={config.platforms[platform]?.url ?? ''}
                          onChange={(event) => {
                            setConfig({
                              ...config,
                              platforms: {
                                ...config.platforms,
                                [platform]: {
                                  url: event.target.value,
                                  browser: config.platforms[platform]?.browser ?? '',
                                },
                              },
                            });
                          }}
                        />
                        <input
                          aria-label={`${t(platform)} ${t('browser')}`}
                          placeholder={t('browser')}
                          value={config.platforms[platform]?.browser ?? ''}
                          onChange={(event) => {
                            setConfig({
                              ...config,
                              platforms: {
                                ...config.platforms,
                                [platform]: {
                                  url: config.platforms[platform]?.url ?? '',
                                  browser: event.target.value,
                                },
                              },
                            });
                          }}
                        />
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </section>
          <section className="form-section">
            <div className="section-title">
              <h2>{t('creativeDirection')}</h2>
              <AiButton
                disabled={dirty || busy}
                onClick={() => {
                  if (selected) ask(`taste:${selected.name}`, label);
                }}
              />
            </div>
            <div className="chip-scroll">
              {tastes.map((document, index) => (
                <button
                  className={`chip ${active === index ? 'active' : ''}`}
                  type="button"
                  key={document.path}
                  onClick={() => {
                    setActive(index);
                  }}
                >
                  <TasteIcon file={document.name} />
                  {tasteLabel(document.name)}
                </button>
              ))}
            </div>
            {selected && (
              <>
                <div className="editor-toolbar">
                  <span className="mono">{selected.name}</span>
                  <IconButton
                    label={t('smallerText')}
                    onClick={() => {
                      setFontSize(Math.max(10, fontSize - 1));
                    }}
                  >
                    <Minus size={13} />
                  </IconButton>
                  <IconButton
                    label={t('biggerText')}
                    onClick={() => {
                      setFontSize(Math.min(22, fontSize + 1));
                    }}
                  >
                    <Plus size={13} />
                  </IconButton>
                </div>
                <textarea
                  className="markdown-editor"
                  style={{ fontSize }}
                  aria-label={label}
                  value={selected.content}
                  onChange={(event) => {
                    setDocuments(
                      documents.map((document) =>
                        document.path === selected.path
                          ? { ...document, content: event.target.value }
                          : document,
                      ),
                    );
                  }}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-'].includes(event.key)) {
                      event.preventDefault();
                      setFontSize(Math.max(10, Math.min(22, fontSize + (event.key === '-' ? -1 : 1))));
                    }
                  }}
                />
              </>
            )}
          </section>
        </fieldset>
      </div>
      <div className="savebar">
        <IconButton
          label={t('discard')}
          disabled={!dirty || busy}
          onClick={() => {
            setConfig(workspace.brand.config);
            setDocuments(workspace.documents);
          }}
        >
          <RotateCcw size={15} />
        </IconButton>
        <button
          className="button primary"
          type="button"
          disabled={!dirty || busy || config.name.trim().length < 3}
          onClick={() => {
            setConfirm(true);
          }}
        >
          {t('save')}
        </button>
      </div>
      {confirm && (
        <CommitDialog
          summary={JSON.stringify({
            before: {
              config: workspace.brand.config,
              documents: workspace.documents.filter((original) =>
                changedDocuments.some((document) => document.path === original.path),
              ),
            },
            after: { config, documents: changedDocuments },
          })}
          onClose={() => {
            setConfirm(false);
          }}
          onSave={async (commit) => {
            const result = await api.saveWorkspace({
              scope: workspace.scope,
              revision: workspace.revision,
              brandConfig: config,
              documents: changedDocuments.map(({ path, content }) => ({ path, content })),
              packaging: null,
              commit,
            });
            setConfig(result.brand.config);
            setDocuments(result.documents);
            setDirty(false);
            setWorkspace(result);
            setConfirm(false);
          }}
        />
      )}
    </>
  );
}
