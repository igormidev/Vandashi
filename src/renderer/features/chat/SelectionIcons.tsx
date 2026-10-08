import {
  Brain,
  BrainCircuit,
  CircleDashed,
  Cpu,
  Earth,
  Moon,
  Orbit,
  Star,
  Sun,
  type LucideIcon,
} from 'lucide-react';

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
  const bars: Record<string, number> = { minimal: 1, low: 2, medium: 3 };
  const count = bars[level];
  if (count)
    return (
      <svg
        className="selection-icon reasoning-bars"
        width={15}
        height={15}
        viewBox="0 0 15 15"
        fill="currentColor"
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, index) => (
          <rect
            key={index}
            x={2 + index * 4}
            y={10 - index * 3}
            width={2.5}
            height={3 + index * 3}
            rx={0.75}
          />
        ))}
      </svg>
    );
  const icons: Record<string, LucideIcon> = {
    none: CircleDashed,
    high: Brain,
    xhigh: BrainCircuit,
    max: Cpu,
    ultra: Orbit,
  };
  const Icon = icons[level] ?? Brain;
  return <Icon className="selection-icon" size={15} aria-hidden="true" />;
}
