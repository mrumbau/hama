import { Suspense } from 'react';
import { AnmeldeFormular } from '@/components/anmelden';

export const metadata = { title: 'Anmelden · MR Umbau Dispo' };

export default function AnmeldenSeite() {
  // Das Formular liest den Rücksprungpfad aus der Adresse; beim Vorrendern
  // steht der noch nicht fest, deshalb die Suspense-Grenze.
  return (
    <Suspense fallback={null}>
      <AnmeldeFormular />
    </Suspense>
  );
}
