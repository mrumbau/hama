import { Suspense } from 'react';
import { PeoplePage } from '@/components/people/people-page';

export const metadata = { title: 'Mitarbeiter · MR Umbau Dispo' };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Wird geladen …</div>}>
      <PeoplePage />
    </Suspense>
  );
}
