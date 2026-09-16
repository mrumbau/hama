import { Suspense } from 'react';
import { SettingsPage } from '@/components/settings-page';

export const metadata = { title: 'Einstellungen · MR Umbau Dispo' };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Wird geladen …</div>}>
      <SettingsPage />
    </Suspense>
  );
}
