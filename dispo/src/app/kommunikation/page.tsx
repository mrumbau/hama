import { Suspense } from 'react';
import { CommunicationPage } from '@/components/communication/communication-page';

export const metadata = { title: 'Kommunikation · MR Umbau Dispo' };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Wird geladen …</div>}>
      <CommunicationPage />
    </Suspense>
  );
}
