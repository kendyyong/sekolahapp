import type { Metadata } from "next";
import { LoginScreen } from "@/components/login-screen";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; next?: string }> }) {
  return <LoginScreen sp={await searchParams} from="/login" />;
}
