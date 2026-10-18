import Dashboard from "@/components/Dashboard";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.memberships.some(({ team }) => team.id === teamId)) notFound();
  return <Dashboard key={teamId} initialTeamId={teamId} />;
}
