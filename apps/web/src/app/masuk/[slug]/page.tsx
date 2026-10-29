import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SchoolBrand } from "@/lib/session";
import { LoginScreen } from "@/components/login-screen";

// Halaman masuk khusus sekolah: tautan ini dibagikan sekolah ke guru, orang tua, dan murid.
const schoolBySlug = cache(async (slug: string) => {
  const sb = await createClient();
  const { data } = await sb.rpc("school_public_profile", { p_slug: slug });
  return (data ?? null) as SchoolBrand | null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const school = await schoolBySlug((await params).slug);
  return school ? { title: { absolute: `Masuk · ${school.app_name ?? school.name}` } } : {};
}

export default async function SchoolLogin({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ err?: string; ok?: string; next?: string }>;
}) {
  const school = await schoolBySlug((await params).slug);
  if (!school) notFound();
  return <LoginScreen sp={await searchParams} school={school} from={`/masuk/${school.slug}`} />;
}
