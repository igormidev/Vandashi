import { useState, type InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string[];
  onChange: (tags: string[]) => void;
}

/** Keep delimiters and spaces editable; normalize only after the user leaves the field. */
export function TagsInput({ value, onChange, onBlur, ...props }: Props) {
  const key = JSON.stringify(value);
  const [draft, setDraft] = useState({ key, text: value.join(', ') });
  if (draft.key !== key) setDraft({ key, text: value.join(', ') });
  return (
    <input
      {...props}
      value={draft.key === key ? draft.text : value.join(', ')}
      onChange={(event) => {
        const text = event.target.value;
        const tags = text.split(',');
        setDraft({ key: JSON.stringify(tags), text });
        onChange(tags);
      }}
      onBlur={(event) => {
        const tags = [
          ...new Set(
            event.target.value
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ];
        setDraft({ key: JSON.stringify(tags), text: tags.join(', ') });
        onChange(tags);
        onBlur?.(event);
      }}
    />
  );
}
