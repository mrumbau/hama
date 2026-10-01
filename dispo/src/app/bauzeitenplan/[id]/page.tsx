import { BauzeitenplanDruck } from '@/components/project/bauzeitenplan-druck';

export const dynamic = 'force-dynamic';

export default async function Seite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BauzeitenplanDruck projectId={id} />;
}
