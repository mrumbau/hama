import { Suspense } from 'react';
import { ProjectsPage } from '@/components/project/projects-page';

export const metadata = { title: 'Projekte · MR Umbau Dispo' };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Wird geladen …</div>}>
      <ProjectsPage />
    </Suspense>
  );
}
