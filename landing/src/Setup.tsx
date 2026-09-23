import { useRef, useState } from 'react';
import { Check, Copy, LoaderCircle } from 'lucide-react';
import type { SiteCopy } from './locales/catalogs';
import { HeadingText } from './HeadingText';

export const sourceUrl = 'https://github.com/igormidev/Vandashi';

export function Setup({ copy }: { copy: SiteCopy }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [copying, setCopying] = useState(false);
  const copyOwner = useRef(false);
  const prompt = useRef<HTMLDetailsElement>(null);
  async function copyPrompt() {
    if (copyOwner.current) return;
    copyOwner.current = true;
    setCopying(true);
    setResult('idle');
    try {
      await navigator.clipboard.writeText(copy.setupPrompt);
      setResult('copied');
    } catch {
      setResult('failed');
      if (prompt.current) prompt.current.open = true;
    } finally {
      copyOwner.current = false;
      setCopying(false);
    }
  }
  return (
    <section className="setup section" id="start" aria-labelledby="setup-title">
      <div>
        <h2 id="setup-title">
          <HeadingText text={copy.setupTitle} />
        </h2>
        <p>{copy.setupBody}</p>
        <p className="platforms">{copy.platforms}</p>
      </div>
      <div className="setup-actions">
        <div className="action-row">
          <button
            className="button primary"
            type="button"
            disabled={copying}
            aria-busy={copying}
            onClick={() => {
              void copyPrompt();
            }}
          >
            {copying ? (
              <LoaderCircle className="copy-spinner" size={18} aria-hidden="true" />
            ) : result === 'copied' ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )}
            {result === 'copied' ? copy.copied : copy.copy}
          </button>
          <a className="text-link" href={`${sourceUrl}#run-from-source`}>
            {copy.guide}
          </a>
        </div>
        <p className="copy-status" role="status">
          {result === 'failed' ? copy.copyFailed : result === 'copied' ? copy.copied : ''}
        </p>
        <details ref={prompt} className="prompt">
          <summary>{copy.promptLabel}</summary>
          <textarea readOnly value={copy.setupPrompt} aria-label={copy.promptLabel} rows={10} />
        </details>
        <p className="requirements">{copy.requirements}</p>
      </div>
    </section>
  );
}
