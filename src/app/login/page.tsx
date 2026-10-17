"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Tres formas de entrar. Las dos primeras no mandan emails (el plan gratis de Supabase manda muy pocos por hora).
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "working" | "sent">("idle");
  const [error, setError] = useState("");

  const done = () => {
    router.push("/chat");
    router.refresh();
  };
  const fail = (msg: string) => {
    setError(msg);
    setState("idle");
  };

  async function guest() {
    setState("working");
    setError("");
    const { error } = await supabaseBrowser().auth.signInAnonymously();
    if (error) return fail("No pude abrir una sesión de prueba. Probá con email y contraseña.");
    done();
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setState("working");
    setError("");
    const auth = supabaseBrowser().auth;
    const signIn = await auth.signInWithPassword({ email, password });
    if (!signIn.error) return done();
    // Si no existe la cuenta, la creamos con esos datos.
    const signUp = await auth.signUp({ email, password });
    if (signUp.error) {
      return fail(
        signUp.error.message.toLowerCase().includes("already")
          ? "Esa cuenta existe y la contraseña no coincide."
          : signUp.error.message.toLowerCase().includes("password")
            ? "La contraseña tiene que tener al menos 6 caracteres."
            : "No pude crear la cuenta. Probá de nuevo.",
      );
    }
    if (signUp.data.session) return done();
    fail("La cuenta se creó, pero hay que confirmarla por email. Mientras tanto usá «Probar sin cuenta».");
  }

  async function magicLink() {
    if (!email) return fail("Escribí tu email arriba.");
    setState("working");
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/chat` },
    });
    if (error) return fail(error.message.toLowerCase().includes("rate") ? "Se mandaron demasiados emails en la última hora. Entrá con contraseña o sin cuenta." : error.message);
    setState("sent");
  }

  const busy = state === "working";
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Entrá a Rumbo</h1>
      <p className="mt-2 text-sm text-muted">Con tu cuenta guardamos tu perfil y personalizamos tus noticias.</p>

      <button onClick={guest} disabled={busy} className="mt-8 w-full rounded-xl bg-accent py-3 font-medium text-background disabled:opacity-60">
        Probar sin cuenta
      </button>
      <p className="mt-2 text-center text-xs text-muted">Entrás al toque. Tu perfil queda en este navegador.</p>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />o con tu cuenta<span className="h-px flex-1 bg-border" />
      </div>

      {state === "sent" ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm">
          Te mandamos un link a <b>{email}</b> (mirá también en spam).
        </p>
      ) : (
        <form onSubmit={withPassword} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 outline-none focus:border-accent"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña (si es nueva, se crea la cuenta)"
            autoComplete="current-password"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 outline-none focus:border-accent"
          />
          <button disabled={busy} className="w-full rounded-xl border border-accent py-3 font-medium text-accent disabled:opacity-60">
            {busy ? "Entrando…" : "Entrar o crear cuenta"}
          </button>
          <button type="button" onClick={magicLink} disabled={busy} className="w-full text-sm text-muted underline-offset-4 hover:underline">
            Prefiero que me manden un link por email
          </button>
        </form>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}
