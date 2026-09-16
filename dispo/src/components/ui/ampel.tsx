import { cn } from '@/lib/utils';
import type { TrafficLightKey } from '@/lib/labels';

const AMPEL_BG: Record<TrafficLightKey, string> = {
  GRUEN: 'bg-ampel-gruen',
  GELB: 'bg-ampel-gelb',
  ROT: 'bg-ampel-rot',
  GRAU: 'bg-ampel-grau',
};

export function AmpelDot({
  light,
  className,
  title,
}: {
  light: TrafficLightKey;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-label={`Ampel ${light}`}
      className={cn('inline-block size-2.5 shrink-0 rounded-full', AMPEL_BG[light], className)}
    />
  );
}

/** Farbiger Balken links an der Projektzeile. */
export function AmpelBar({ light, className }: { light: TrafficLightKey; className?: string }) {
  return <span className={cn('block w-1 shrink-0 rounded-full', AMPEL_BG[light], className)} />;
}

export { AMPEL_BG };
