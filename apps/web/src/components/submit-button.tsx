"use client";

import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/** Tombol kirim yang terkunci dan menampilkan status selama aksi server berjalan. */
export function SubmitButton({ children, pendingLabel = "Memproses…", ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? <><LoaderCircle aria-hidden className="size-4 animate-spin" />{pendingLabel}</> : children}
    </Button>
  );
}
