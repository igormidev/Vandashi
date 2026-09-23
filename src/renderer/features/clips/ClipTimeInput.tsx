import { useState } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => number;
}

export function ClipTimeInput(props: Props) {
  // A committed slider change starts a fresh draft without resetting an in-progress keystroke.
  return <TimeDraft key={props.value} {...props} />;
}

function TimeDraft({ label, value, min, max, onCommit }: Props) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const number = draft.trim() ? Number(draft) : NaN;
    setDraft(String(Number.isFinite(number) ? onCommit(number) : value));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={0.1}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
