import { cn } from '@/lib/utils';
import { TRAFFIC_LIGHT_LABEL, TRAFFIC_LIGHT_MEANING, type TrafficLightKey } from '@/lib/labels';

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

/**
 * Erklaerung zur Ampel – ueberall dieselbe.
 *
 * Bisher stand in den Tooltips der Rohwert ("Ampel: ROT") und darunter eine
 * Strichliste. Wer die Tafel zum ersten Mal sieht, liest daraus nicht, was
 * zu tun ist. Hier steht die Farbe, was sie verlangt, und warum sie
 * ausgerechnet diese Farbe hat.
 */
export function AmpelErklaerung({ light, reasons }: { light: TrafficLightKey; reasons: string[] }) {
  return (
    <div className="max-w-[18rem] space-y-1">
      <p className="flex items-center gap-1.5 font-semibold">
        <AmpelDot light={light} />
        {TRAFFIC_LIGHT_LABEL[light]} – {TRAFFIC_LIGHT_MEANING[light]}
      </p>
      {reasons.length > 0 ? (
        <ul className="space-y-0.5 text-muted-foreground">
          {reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Keine offenen Punkte.</p>
      )}
    </div>
  );
}
