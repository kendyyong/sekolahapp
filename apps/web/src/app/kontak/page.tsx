import type { Metadata } from "next";
import { LEGAL, waLink } from "@/lib/legal";
import { LinkButton } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Hubungi kami · SekolahApp",
  description: `Alamat, telepon, WhatsApp, dan email ${LEGAL.company}, penyelenggara SekolahApp.`,
};

export default function Contact() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Hubungi kami</h1>
        <p className="mt-2 text-muted text-pretty">
          Untuk demo, penawaran paket Enterprise, pertanyaan tagihan langganan, atau bantuan memakai SekolahApp, hubungi tim kami.
        </p>
        <dl className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line text-sm sm:grid-cols-2">
          <div className="bg-sheet p-5">
            <dt className="font-bold text-ink">Penyelenggara</dt>
            <dd className="mt-1 text-muted">{LEGAL.company}</dd>
          </div>
          <div className="bg-sheet p-5">
            <dt className="font-bold text-ink">Alamat kantor</dt>
            <dd className="mt-1 text-muted text-pretty">{LEGAL.address}</dd>
          </div>
          <div className="bg-sheet p-5">
            <dt className="font-bold text-ink">Telepon / WhatsApp</dt>
            <dd className="mt-1"><a href={waLink()} className="font-semibold text-brand">{LEGAL.phone}</a></dd>
          </div>
          <div className="bg-sheet p-5">
            <dt className="font-bold text-ink">Email</dt>
            <dd className="mt-1"><a href={`mailto:${LEGAL.email}`} className="font-semibold text-brand">{LEGAL.email}</a></dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href={waLink("Halo, saya ingin bertanya tentang SekolahApp.")} variant="primary">Chat WhatsApp</LinkButton>
          <LinkButton href="/berlangganan">Lihat paket & berlangganan</LinkButton>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
