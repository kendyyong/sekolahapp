// Admin sekolah membuat / menautkan akun pengguna dan menetapkan perannya.
//
// POST /functions/v1/admin-users
// {
//   "school_id": "...",
//   "full_name": "Sari Wulandari",
//   "email": "sari@contoh.sch.id",          // email atau phone wajib salah satu
//   "phone": "+6281234567890",
//   "password": "opsional, min 8 karakter",  // jika kosong dibuat acak; pengguna reset lewat OTP/email
//   "roles": ["teacher"],
//   "student_id": "...",                     // opsional: tautkan akun ke data murid
//   "guardian_of": [{ "student_id": "...", "relation": "ibu" }]   // opsional
// }
import { adminClient, HttpError, json, requireUser, serve } from "../_shared/supabase.ts";

const ROLES = ["school_admin", "principal", "teacher", "counselor", "finance", "canteen", "student", "guardian"] as const;
type Role = typeof ROLES[number];

interface Body {
  school_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  password?: string;
  roles: Role[];
  student_id?: string;
  guardian_of?: { student_id: string; relation?: string }[];
}

function validate(b: Body) {
  if (!b?.school_id) throw new HttpError(400, "school_id wajib diisi");
  if (!b.full_name?.trim()) throw new HttpError(400, "Nama lengkap wajib diisi");
  if (!b.email && !b.phone) throw new HttpError(400, "Isi email atau nomor HP");
  if (b.phone && !/^\+62\d{8,13}$/.test(b.phone)) throw new HttpError(400, "Nomor HP harus berformat +62…");
  if (!Array.isArray(b.roles) || b.roles.length === 0) throw new HttpError(400, "Pilih minimal satu peran");
  for (const r of b.roles) if (!ROLES.includes(r)) throw new HttpError(400, `Peran tidak dikenal: ${r}`);
  if (b.password && b.password.length < 8) throw new HttpError(400, "Kata sandi minimal 8 karakter");
  if (b.student_id && !b.roles.includes("student")) b.roles.push("student");
  if (b.guardian_of?.length && !b.roles.includes("guardian")) b.roles.push("guardian");
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Metode tidak didukung");
  const body = (await req.json()) as Body;
  validate(body);

  const { client } = await requireUser(req);
  const { data: isAdmin, error: roleErr } = await client.rpc("has_role", {
    p_school: body.school_id,
    p_roles: ["school_admin"],
  });
  if (roleErr) throw roleErr;
  if (!isAdmin) throw new HttpError(403, "Hanya admin sekolah yang dapat membuat akun");

  const admin = adminClient();

  // Kepala sekolah & admin sekolah hanya boleh ditetapkan oleh admin; cek kuota paket gratis.
  const { data: school } = await admin.from("schools").select("plan").eq("id", body.school_id).single();
  if (school?.plan === "free" && body.roles.includes("student")) {
    const { count } = await admin.from("students").select("id", { count: "exact", head: true })
      .eq("school_id", body.school_id).eq("status", "aktif");
    if ((count ?? 0) >= 100) throw new HttpError(402, "Paket Gratis maksimal 100 siswa. Silakan upgrade paket.");
  }

  // Cari akun yang sudah ada (satu orang, satu akun) berdasarkan email/HP.
  let userId: string | null = null;
  const { data: existing } = await admin.from("profiles").select("id")
    .or([body.email ? `email.eq.${body.email}` : null, body.phone ? `phone.eq.${body.phone.replace("+", "")}` : null]
      .filter(Boolean).join(","))
    .limit(1);
  if (existing?.length) userId = existing[0].id;

  let created = false;
  if (!userId) {
    const password = body.password ?? crypto.randomUUID() + "Aa1!";
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email,
      phone: body.phone,
      password,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { full_name: body.full_name.trim() },
    });
    if (error) throw new HttpError(400, `Gagal membuat akun: ${error.message}`);
    userId = data.user.id;
    created = true;
  }

  const { error: mErr } = await admin.from("memberships").upsert(
    body.roles.map((role) => ({ school_id: body.school_id, user_id: userId, role, is_active: true })),
    { onConflict: "school_id,user_id,role" },
  );
  if (mErr) throw mErr;

  if (body.student_id) {
    const { error } = await admin.from("students").update({ user_id: userId })
      .eq("id", body.student_id).eq("school_id", body.school_id);
    if (error) throw error;
  }
  if (body.guardian_of?.length) {
    const { error } = await admin.from("guardian_links").upsert(
      body.guardian_of.map((g) => ({
        student_id: g.student_id, guardian_id: userId, school_id: body.school_id, relation: g.relation ?? "orang tua",
      })),
      { onConflict: "student_id,guardian_id" },
    );
    if (error) throw error;
  }

  return json({ user_id: userId, created, roles: body.roles });
});
