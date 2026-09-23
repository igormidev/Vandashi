import { useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { siGithub } from 'simple-icons';
import { matchSiteLocale, readSiteLocale, saveSiteLocale, siteLocales } from './language';
import { languageNames, siteCopy } from './locales/catalogs';
import { Screenshot } from './Screenshot';
import { Setup, sourceUrl } from './Setup';
import { HeadingText } from './HeadingText';
import creation from './assets/creation.webp';
import direction from './assets/creative-direction.webp';
import assets from './assets/assets.webp';
import clips from './assets/clips.webp';

export function App() {
  const [locale, setLocale] = useState(readSiteLocale);
  const copy = siteCopy(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.pageTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', copy.pageDescription);
  }, [copy, locale]);
  useEffect(() => {
    const update = () => {
      setLocale(readSiteLocale());
    };
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('popstate', update);
    };
  }, []);
  const stories = [
    {
      id: 'direction',
      title: copy.directionTitle,
      body: copy.directionBody,
      src: direction,
      alt: copy.directionAlt,
    },
    { id: 'assets', title: copy.assetsTitle, body: copy.assetsBody, src: assets, alt: copy.assetsAlt },
    { id: 'clips', title: copy.clipsTitle, body: copy.clipsBody, src: clips, alt: copy.clipsAlt },
  ];
  return (
    <>
      <a className="skip" href="#main">
        {copy.skip}
      </a>
      <header className="header shell">
        <a href="#main" className="wordmark" translate="no">
          <svg viewBox="150 220 724 650" aria-hidden="true">
            <path d="M176 244h196l140 304 140-304h196L512 842 176 244Z" fill="currentColor" />
            <path d="m512 244 107 214-107 214-107-214 107-214Z" fill="#f7f9f8" />
          </svg>
          {copy.product}
        </a>
        <div className="header-actions">
          <label className="language-control">
            <Globe2 size={18} aria-hidden="true" />
            <span className="sr-only">{copy.language}</span>
            <select
              value={locale}
              onChange={(event) => {
                const selected = matchSiteLocale(event.currentTarget.value);
                if (selected) {
                  saveSiteLocale(selected);
                  setLocale(selected);
                }
              }}
            >
              {siteLocales.map((value) => (
                <option key={value} value={value} lang={value}>
                  {languageNames[value]}
                </option>
              ))}
            </select>
          </label>
          <a className="source-link" href={sourceUrl} aria-label={copy.source}>
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
              <path d={siGithub.path} fill="currentColor" />
            </svg>
            <span>{copy.source}</span>
          </a>
        </div>
      </header>
      <main id="main" className="shell">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">
            <HeadingText text={copy.heroTitle} />
          </h1>
          <div className="hero-copy">
            <p>{copy.heroBody}</p>
            <a className="button primary" href="#start">
              {copy.run}
            </a>
            <p className="free-note">{copy.free}</p>
          </div>
        </section>
        <figure className="hero-preview">
          <Screenshot src={creation} alt={copy.creationAlt} copy={copy} priority />
          <figcaption>
            <span>{copy.creationCaption}</span>
            <a href={`${sourceUrl}/blob/master/docs/REQUIREMENTS.md`}>{copy.preview}</a>
          </figcaption>
        </figure>
        <div className="stories">
          {stories.map((story) => (
            <section
              className={`story story-${story.id}`}
              key={story.id}
              aria-labelledby={`${story.id}-title`}
            >
              <div className="story-copy">
                <h2 id={`${story.id}-title`}>
                  <HeadingText text={story.title} />
                </h2>
                <p>{story.body}</p>
              </div>
              <Screenshot src={story.src} alt={story.alt} copy={copy} />
            </section>
          ))}
        </div>
        <section className="ownership section" aria-labelledby="ownership-title">
          <h2 id="ownership-title">
            <HeadingText text={copy.ownershipTitle} />
          </h2>
          <div>
            <p>{copy.ownershipBody}</p>
            <p className="privacy">{copy.privacy}</p>
          </div>
        </section>
        <Setup key={locale} copy={copy} />
      </main>
      <footer className="footer shell">
        <p translate="no">{copy.product}</p>
        <nav aria-label={copy.product}>
          <a href={`${sourceUrl}/blob/master/LICENSE`}>{copy.license}</a>
          <a href={`${sourceUrl}/blob/master/THIRD_PARTY_NOTICES.md`}>{copy.notices}</a>
          <a href={`${sourceUrl}/blob/master/docs/REQUIREMENTS.md`}>{copy.status}</a>
        </nav>
      </footer>
    </>
  );
}
