import { cookies } from 'next/headers';
import { handler, ok } from '@/server/api';
import { SESSION_COOKIE } from '@/server/auth';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return ok({ message: 'Abgemeldet.' });
});
