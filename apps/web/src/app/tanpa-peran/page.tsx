import Link from "next/link";

export default function NoRole() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-extrabold text-ink">Akun Anda belum terhubung ke sekolah</h1>
        <p className="mt-2 text-sm text-muted">
          Minta admin sekolah menambahkan peran untuk akun ini (misalnya Guru, Murid, atau Orang Tua), lalu muat ulang halaman.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-brand">Kembali ke halaman masuk</Link>
      </div>
    </main>
  );
}
