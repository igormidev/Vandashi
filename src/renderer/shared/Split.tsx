import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../app/store';

export function Split({ id, left, right }: { id: string; left: ReactNode; right: ReactNode }) {
  const { state, api, run, refresh } = useApp();
  const { t } = useTranslation();
  const [ratio, setRatio] = useState(state?.settings.splits[id] ?? 38);
  const container = useRef<HTMLDivElement>(null);
  const saves = useRef(Promise.resolve());
  const persist = (value: number) => {
    saves.current = saves.current.then(async () => {
      await run(async () => {
        const latest = (await api.getState()).settings;
        await api.settings({ ...latest, splits: { ...latest.splits, [id]: value } });
        await refresh();
      });
    });
  };
  return (
    <div
      className="split"
      ref={container}
      style={{ gridTemplateColumns: `minmax(0, ${String(ratio)}fr) 5px minmax(0, ${String(100 - ratio)}fr)` }}
    >
      <div className="split-left">{left}</div>
      <button
        type="button"
        className="split-handle"
        role="slider"
        tabIndex={0}
        aria-label={t('resizePanels')}
        aria-orientation="horizontal"
        aria-valuenow={ratio}
        aria-valuemin={25}
        aria-valuemax={75}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const next = Math.max(25, Math.min(75, ratio + (event.key === 'ArrowLeft' ? -2 : 2)));
            setRatio(next);
            persist(next);
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !container.current) return;
          const box = container.current.getBoundingClientRect();
          setRatio(
            Math.max(25, Math.min(75, ((event.clientX - box.left) / Math.max(1, box.width - 5)) * 100)),
          );
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          persist(ratio);
        }}
      />
      <div className="split-right">{right}</div>
    </div>
  );
}
