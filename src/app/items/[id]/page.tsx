import WorkItemDetail from "@/components/WorkItemDetail";

export default async function WorkItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkItemDetail itemId={id} />;
}
