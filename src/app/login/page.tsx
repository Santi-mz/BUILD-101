"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/chat` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  async function google() {
    await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/chat` },
    });
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Entrá a Rumbo</h1>
      <p className="mt-2 text-sm text-muted">Con tu cuenta guardamos tu perfil y personalizamos tus noticias.</p>

      {state === "sent" ? (
        <p className="mt-8 rounded-2xl border border-border bg-card p-5 text-sm">
          Te mandamos un link a <b>{email}</b>. Abrilo desde este dispositivo para entrar.
        </p>
      ) : (
        <>
          <form onSubmit={submit} className="mt-8 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 outline-none focus:border-accent"
            />
            <button disabled={state === "sending"} className="w-full rounded-xl bg-accent py-3 font-medium text-background disabled:opacity-60">
              {state === "sending" ? "Enviando..." : "Mandame un link"}
            </button>
          </form>
          <button onClick={google} className="mt-3 w-full rounded-xl border border-border py-3 font-medium">
            Seguir con Google
          </button>
          {state === "error" && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
