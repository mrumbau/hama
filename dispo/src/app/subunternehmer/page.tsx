import { Suspense } from 'react';
import { SubcontractorsPage } from '@/components/people/subcontractors-page';

export const metadata = { title: 'Subunternehmer · MR Umbau Dispo' };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Wird geladen …</div>}>
      <SubcontractorsPage />
    </Suspense>
  );
}
