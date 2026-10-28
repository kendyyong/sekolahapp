import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/session";

export default async function Home() {
  const { active } = await getSession();
  redirect(active ? ROLE_HOME[active.role] : "/tanpa-peran");
}
