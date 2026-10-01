import { Suspense } from 'react';
import { BauzeitenplanUebersicht } from '@/components/bauzeitenplan/uebersicht';

export const metadata = { title: 'Bauzeitenpläne · MR Umbau Dispo' };

export default function BauzeitenplaeneSeite() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Bauzeitenpläne werden geladen …</div>
      }
    >
      <BauzeitenplanUebersicht />
    </Suspense>
  );
}
