import * as Dialog from '@radix-ui/react-dialog';
import { Maximize2, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { SiteCopy } from './locales/catalogs';

function panImage(event: KeyboardEvent<HTMLAnchorElement>) {
  const directions: Readonly<Record<string, readonly [number, number]>> = {
    ArrowLeft: [-80, 0],
    ArrowRight: [80, 0],
    ArrowUp: [0, -80],
    ArrowDown: [0, 80],
  };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  event.currentTarget.scrollBy({ left: direction[0], top: direction[1], behavior: 'instant' });
}

export function Screenshot({
  src,
  alt,
  copy,
  priority = false,
}: {
  src: string;
  alt: string;
  copy: SiteCopy;
  priority?: boolean;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="screenshot" aria-label={`${copy.enlarge}: ${alt}`}>
        <img
          src={src}
          alt={alt}
          width={2960}
          height={1880}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
        />
        <span className="enlarge">
          <Maximize2 size={18} aria-hidden="true" />
          <span>{copy.enlarge}</span>
        </span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="image-overlay" />
        <Dialog.Content className="image-dialog" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          <Dialog.Close className="image-close" aria-label={copy.close}>
            <X aria-hidden="true" />
          </Dialog.Close>
          <a
            className="image-scroll"
            href={src}
            target="_blank"
            rel="noreferrer"
            aria-label={copy.enlarge}
            onKeyDown={panImage}
          >
            <img src={src} alt={alt} width={2960} height={1880} />
          </a>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
