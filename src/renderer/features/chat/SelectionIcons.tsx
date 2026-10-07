import { Brain, CircleDashed, Cpu, Earth, Moon, Star, Sun } from 'lucide-react';

export function ModelIcon({ model }: { model: string }) {
  const Icon = /(?:^|[-_\s])sol(?:[-_\s]|$)/iu.test(model)
    ? Sun
    : /(?:^|[-_\s])terra(?:[-_\s]|$)/iu.test(model)
      ? Earth
      : /(?:^|[-_\s])luna(?:[-_\s]|$)/iu.test(model)
        ? Moon
        : /(?:^|[-_\s])astra(?:[-_\s]|$)/iu.test(model)
          ? Star
          : Cpu;
  return <Icon className="selection-icon" size={15} aria-hidden="true" />;
}

export function ReasoningIcon({ level }: { level: string }) {
  const Icon = level === 'none' ? CircleDashed : Brain;
  return <Icon className="selection-icon" size={15} aria-hidden="true" />;
}
