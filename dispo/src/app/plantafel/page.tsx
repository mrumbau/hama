import { Suspense } from 'react';
import { Plantafel } from '@/components/plantafel/plantafel';

export const metadata = { title: 'Plantafel · MR Umbau Dispo' };

export default function PlantafelPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-muted-foreground">Plantafel wird geladen …</div>}
    >
      <Plantafel />
    </Suspense>
  );
}
