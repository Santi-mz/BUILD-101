"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Convierte una sesión anónima ("Probar sin cuenta") en una cuenta con email y contraseña,
 * sin perder el perfil ni la charla: es el mismo usuario de Supabase.
 */
export default function SaveAccount({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "confirm">("idle");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("working");
    setError("");
    const { data, error } = await supabaseBrowser().auth.updateUser({ email, password });
    if (error) {
      setState("idle");
      setError(
        error.message.toLowerCase().includes("already")
          ? "Ese email ya tiene una cuenta. Usá otro."
          : error.message.toLowerCase().includes("password")
            ? "La contraseña tiene que tener al menos 6 caracteres."
            : "No pude guardar la cuenta. Probá de nuevo.",
      );
      return;
    }
    // Con la confirmación por email apagada, el email queda asignado al instante.
    setState(data.user?.email ? "done" : "confirm");
    router.refresh();
  }

  if (state === "done") return <p className="text-sm font-medium text-accent">Listo: tu perfil quedó guardado en {email}.</p>;
  if (state === "confirm") return <p className="text-sm text-muted">Te mandamos un email a {email} para confirmar la cuenta.</p>;

  return (
    <form onSubmit={save} className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && <p className="text-sm text-muted">Estás probando sin cuenta. Guardá tu perfil para no perderlo si salís o cambiás de dispositivo.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" autoComplete="new-password" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
        <button disabled={state === "working"} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-background disabled:opacity-60">
          {state === "working" ? "Guardando…" : "Guardar perfil"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
