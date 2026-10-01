/**
 * ESLint für die Dispo.
 *
 * Die Wurzel des Repos hat eine eigene Konfiguration, die `dispo/**`
 * ausnimmt - die Dispo ist ein eigenstaendiges Projekt mit eigener
 * Werkzeugkette. Ohne diese Datei lief hier gar kein Linter: `next lint`
 * fand nur die Wurzelkonfiguration, und die hat die Dispo ignoriert.
 */
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'backups/**', 'next-env.d.ts'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      /*
       * Anfuehrungszeichen im deutschen Fliesstext sind Inhalt, kein Fehler.
       * Die Regel will vor einem kaputten Attribut warnen; in 29 Faellen hat
       * sie Saetze aus der Anleitung gemeldet.
       */
      'react/no-unescaped-entities': 'off',
      /*
       * Beide kommen vom React Compiler. "setState im Effekt" ist hier fast
       * immer das Zuruecksetzen eines Formulars beim Oeffnen eines Dialogs -
       * harmlos, aber eine Warnung wert, damit es nicht mehr wird. Das zweite
       * sagt nur, dass der Compiler eine Stelle nicht optimiert; das ist kein
       * Fehler im Programm.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
];
