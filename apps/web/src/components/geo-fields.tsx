"use client";
import { useEffect, useState } from "react";

/** Mengisi lokasi perangkat (bila diizinkan) ke dalam form absensi. */
export function GeoFields() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [msg, setMsg] = useState("Mencari lokasi…");
  useEffect(() => {
    if (!navigator.geolocation) { setMsg("Lokasi tidak tersedia di perangkat ini."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setMsg("Lokasi terdeteksi."); },
      () => setMsg("Izin lokasi ditolak. Absen tetap bisa jika sekolah tidak mewajibkan lokasi."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);
  return (
    <>
      <input type="hidden" name="lat" value={pos?.lat ?? ""} />
      <input type="hidden" name="lng" value={pos?.lng ?? ""} />
      <p className="mt-2 text-xs text-muted">{msg}</p>
    </>
  );
}
