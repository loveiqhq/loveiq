import ArchetypeProfile from "@features/admin/ui/ArchetypeProfile";

export default async function ArchetypeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ArchetypeProfile slug={slug} />;
}
