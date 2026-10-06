import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../app/store';
export function TripleSplit({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  const { t } = useTranslation();
  const { state, api, run, refresh } = useApp();
  const first = Math.max(25, Math.min(50, state?.settings.splits.presetLeft ?? 34));
  const second = Math.max(first + 25, Math.min(75, state?.settings.splits.presetCenter ?? 67));
  const [dividers, setDividers] = useState([first, second]);
  const container = useRef<HTMLDivElement>(null);
  const saves = useRef(Promise.resolve());
  const update = (index: number, value: number) => {
    setDividers((current) =>
      index === 0
        ? [Math.max(25, Math.min((current[1] ?? 67) - 25, value)), current[1] ?? 67]
        : [current[0] ?? 34, Math.max((current[0] ?? 34) + 25, Math.min(75, value))],
    );
  };
  const persist = () => {
    const [presetLeft, presetCenter] = dividers;
    saves.current = saves.current.then(() =>
      run(async () => {
        const latest = (await api.getState()).settings;
        await api.settings({
          ...latest,
          splits: { ...latest.splits, presetLeft: presetLeft ?? 34, presetCenter: presetCenter ?? 67 },
        });
        await refresh();
      }),
    );
  };
  return (
    <div
      className="triple-split"
      ref={container}
      style={{
        gridTemplateColumns: `minmax(0, ${String(dividers[0])}fr) 5px minmax(0, ${String((dividers[1] ?? 67) - (dividers[0] ?? 34))}fr) 5px minmax(0, ${String(100 - (dividers[1] ?? 67))}fr)`,
      }}
    >
      <section>{left}</section>
      {[0, 1].map((index) => (
        <button
          key={index}
          type="button"
          role="slider"
          className={`split-handle triple-handle-${String(index)}`}
          aria-label={t('resizePanels')}
          aria-orientation="horizontal"
          aria-valuenow={dividers[index]}
          aria-valuemin={index === 0 ? 25 : (dividers[0] ?? 34) + 25}
          aria-valuemax={index === 0 ? (dividers[1] ?? 67) - 25 : 75}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              update(index, (dividers[index] ?? 34) + (event.key === 'ArrowLeft' ? -2 : 2));
            }
          }}
          onBlur={persist}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId) || !container.current) return;
            const box = container.current.getBoundingClientRect();
            update(index, ((event.clientX - box.left) / Math.max(1, box.width - 10)) * 100);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            persist();
          }}
        />
      ))}
      <section>{center}</section>
      <section>{right}</section>
    </div>
  );
}
