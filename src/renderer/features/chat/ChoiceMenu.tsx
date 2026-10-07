import { Check, ChevronDown } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Tip } from '../../shared/ui';

export interface ChoiceOption {
  value: string;
  label: string;
  icon: ReactNode;
}

/** A select-only popup that follows its trigger while escaping the chat's scroll clipping. */
export function ChoiceMenu({
  label,
  value,
  options,
  disabled = false,
  className = '',
  onChange,
}: {
  label: string;
  value: string;
  options: ChoiceOption[];
  disabled?: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<number | null>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  if (disabled && open) setOpen(false);
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = trigger.current;
    const menu = popup.current;
    if (!anchor || !menu) return;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 24);
      menu.style.width = String(width) + 'px';
      menu.style.left = String(Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))) + 'px';
      menu.style.bottom = String(window.innerHeight - rect.top + 8) + 'px';
      menu.style.maxHeight = String(Math.max(80, rect.top - 20)) + 'px';
    };
    position();
    const buttons = menu.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const selectedIndex = options.findIndex((option) => option.value === value);
    buttons.item(initialFocus.current ?? Math.max(0, selectedIndex)).focus();
    initialFocus.current = null;
    search.current = { text: '', time: 0 };
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target) && !anchor.contains(event.target))
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [open, options, value]);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = popup.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!buttons?.length) return;
    const current = Array.from(buttons).findIndex((button) => button === document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      close(true);
      return;
    }
    let next: number | undefined;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowUp') next = (current + buttons.length - 1) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const now = event.timeStamp;
      const query =
        `${now - search.current.time < 700 ? search.current.text : ''}${event.key}`.toLocaleLowerCase();
      search.current = { text: query, time: now };
      const start = current + 1;
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (start + offset) % options.length;
        if (options[index]?.label.toLocaleLowerCase().startsWith(query)) {
          next = index;
          break;
        }
      }
    }
    if (next !== undefined) {
      event.preventDefault();
      buttons.item(next).focus();
    }
  };
  return (
    <>
      <Tip label={label}>
        <button
          ref={trigger}
          type="button"
          role="combobox"
          className={`choice-trigger ${className}`}
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          disabled={disabled}
          onClick={() => {
            if (!disabled) setOpen((current) => !current);
          }}
          onKeyDown={(event) => {
            if (disabled || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            initialFocus.current = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : null;
            setOpen(true);
          }}
        >
          {selected?.icon}
          <span className="choice-label">{selected?.label ?? value}</span>
          <ChevronDown className="choice-chevron" size={12} aria-hidden="true" />
        </button>
      </Tip>
      {open &&
        createPortal(
          <div
            id={id}
            ref={popup}
            className={`choice-popup ${className}`}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={keyDown}
          >
            {options.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={-1}
                key={option.value}
                onClick={() => {
                  if (disabled) return;
                  close(true);
                  onChange(option.value);
                }}
              >
                {option.icon}
                <span>{option.label}</span>
                {option.value === value && <Check size={14} aria-hidden="true" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
