import { PrismaClient } from '@prisma/client';

// Next.js laedt Module im Dev-Modus mehrfach neu – ohne Singleton entstehen
// sonst dutzende Connection Pools.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
