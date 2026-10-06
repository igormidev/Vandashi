import { ImagePlus, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { AiButton, IconButton } from '../../shared/ui';
import { PlatformIcon } from '../../shared/PlatformIcon';
import { CommitDialog } from '../history/CommitDialog';
import { TasteIcon } from './TasteIcon';
import { tasteLabelKey } from '../../locales/taste-labels';
import type { InstalledBrowser } from '../../../domain/browsers';
import { BrowserPicker } from './BrowserPicker';
import { SectionActions } from './SectionActions';
import type { Platform } from '../../../domain/models';
const brandPlatforms: Platform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'x',
  'facebook',
  'threads',
  'odysee',
  'rumble',
];

export function BrandPage() {
  const { t } = useTranslation();
  const { workspace, api, run, busy, setDirty, setWorkspace, setChatTarget } = useApp();
  const [config, setConfig] = useState(workspace?.brand.config);
  const [documents, setDocuments] = useState(workspace?.documents ?? []);
  const [logo, setLogo] = useState<{ path: string; revision: string; url: string } | null>(null);
  const [active, setActive] = useState(0);
  const [fontSize, setFontSize] = useState(12);
  const [confirm, setConfirm] = useState<'attributes' | 'direction' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [browsers, setBrowsers] = useState<InstalledBrowser[] | null>(null);
  useEffect(() => {
    let current = true;
    void api.installedBrowsers().then(
      (result) => {
        if (current) setBrowsers(result);
      },
      () => {
        if (current) setBrowsers(null);
      },
    );
    return () => {
      current = false;
    };
  }, [api, workspace?.brand.id]);
  const attributesDirty = JSON.stringify(config) !== JSON.stringify(workspace?.brand.config);
  const directionDirty = JSON.stringify(documents) !== JSON.stringify(workspace?.documents ?? []);
  const dirty = attributesDirty || directionDirty;
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
        <fieldset disabled={busy || directionDirty}>
          <section className="form-section">
            <div className="section-title">
              <h2>{t('brandAttributes')}</h2>
              <AiButton
                disabled={dirty || busy}
                onClick={() => {
                  ask('brand', t('brandAttributes'));
                }}
              />
              <SectionActions
                dirty={attributesDirty}
                disabled={busy || directionDirty}
                invalid={config.name.trim().length < 3}
                onReset={() => {
                  setConfig(workspace.brand.config);
                }}
                onSave={() => {
                  setConfirm('attributes');
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
                <span id="brand-description-help">
                  {t('description')} <span className="muted">{t('brandDescriptionHelp')}</span>
                </span>
                <textarea
                  aria-label={t('description')}
                  aria-describedby="brand-description-help"
                  value={config.description}
                  onChange={(event) => {
                    setConfig({ ...config, description: event.target.value });
                  }}
                  rows={3}
                />
              </label>
              <div className="field">
                <span>{t('platforms')}</span>
                <p className="muted platform-help">{t('brandPlatformsHelp')}</p>
                <div className={`platform-fields ${showAll ? 'expanded' : 'collapsed'}`}>
                  {brandPlatforms.slice(0, showAll ? brandPlatforms.length : 4).map((platform, index) => (
                    <div
                      className="platform-field"
                      key={platform}
                      inert={!showAll && index === 3}
                      aria-hidden={!showAll && index === 3}
                    >
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
                      <BrowserPicker
                        platform={platform}
                        browsers={browsers}
                        value={config.platforms[platform]?.browser ?? ''}
                        onChange={(browser) => {
                          setConfig({
                            ...config,
                            platforms: {
                              ...config.platforms,
                              [platform]: {
                                url: config.platforms[platform]?.url ?? '',
                                browser,
                              },
                            },
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <button
                  className="button compact platform-expand"
                  type="button"
                  aria-expanded={showAll}
                  onClick={() => {
                    setShowAll(!showAll);
                  }}
                >
                  {t(showAll ? 'less' : 'showAllPlatforms')}
                </button>
              </div>
            </div>
          </section>
        </fieldset>
        <fieldset disabled={busy || attributesDirty}>
          <section className="form-section">
            <div className="section-title">
              <h2>{t('creativeDirection')}</h2>
              <SectionActions
                dirty={directionDirty}
                disabled={busy || attributesDirty}
                onReset={() => {
                  setDocuments(workspace.documents);
                }}
                onSave={() => {
                  setConfirm('direction');
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
                  <AiButton
                    disabled={dirty || busy}
                    onClick={() => {
                      ask(`taste:${selected.name}`, label);
                    }}
                  />
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
            setConfirm(null);
          }}
          onSave={async (commit) => {
            const result = await api.saveWorkspace({
              scope: workspace.scope,
              revision: workspace.revision,
              brandConfig: confirm === 'attributes' ? config : null,
              documents: (confirm === 'direction' ? changedDocuments : []).map(({ path, content }) => ({
                path,
                content,
              })),
              packaging: null,
              commit,
            });
            setConfig(result.brand.config);
            setDocuments(result.documents);
            setDirty(false);
            setWorkspace(result);
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}
