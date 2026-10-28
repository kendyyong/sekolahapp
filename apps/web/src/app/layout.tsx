import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SekolahApp", template: "%s · SekolahApp" },
  description: "Satu aplikasi untuk seluruh warga sekolah.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f4fb8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
