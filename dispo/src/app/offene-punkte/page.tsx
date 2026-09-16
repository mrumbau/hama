import { Suspense } from 'react';
import { OpenPointsPage } from '@/components/open-points-page';

export const metadata = { title: 'Offene Punkte · MR Umbau Dispo' };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Wird geladen …</div>}>
      <OpenPointsPage />
    </Suspense>
  );
}
