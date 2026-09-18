import { PrismaClient } from '@prisma/client';
import { pooltauglicheUrl } from './db-url';

// Next.js laedt Module im Dev-Modus mehrfach neu – ohne Singleton entstehen
// sonst dutzende Connection Pools.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Die Adresse wird vor dem Verbinden auf den Transaction-Pooler gezogen.
// Das ist kein Schoenheitsfehler-Fix: ueber eine Sitzungsverbindung faellt
// die Anwendung unter Last mit EMAXCONNSESSION aus.
const korrektur = pooltauglicheUrl(process.env.DATABASE_URL);
if (korrektur.hinweis) console.warn(korrektur.hinweis);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(korrektur.angepasst ? { datasources: { db: { url: korrektur.url } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
