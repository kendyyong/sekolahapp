"use server";
import { getSession } from "@/lib/session";
import { run, str } from "@/lib/actions";

export async function sendStudentMessage(fd: FormData) {
  const { active, user } = await getSession();
  await run(str(fd, "back"), "Pesan terkirim.", (sb) => sb.from("student_messages").insert({
    school_id: active!.school_id,
    student_id: str(fd, "student_id"),
    sender_id: user.id,
    body: str(fd, "body"),
  }));
}
