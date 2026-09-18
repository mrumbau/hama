import { handler, ok } from '@/server/api';
import { baueAuswertung } from '@/server/auswertung';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  const roh = new URL(request.url).searchParams.get('jahr');
  const jahr = Number(roh);
  const gewaehlt =
    Number.isInteger(jahr) && jahr >= 2000 && jahr <= 2100 ? jahr : new Date().getFullYear();

  return ok({ jahr: gewaehlt, bloecke: await baueAuswertung(gewaehlt) });
});
