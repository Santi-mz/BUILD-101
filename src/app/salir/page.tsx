import Link from "next/link";
import { Suspense } from "react";
import SaveAccount from "@/components/save-account";

// Aviso antes de cerrar una sesión anónima: si sale sin guardar, el perfil se pierde.
export default function Salir() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Antes de salir</h1>
      <p className="mt-2 text-muted">
        Estás usando Rumbo sin cuenta. Si salís ahora, <b className="text-foreground">tu perfil y tu charla se pierden</b> y no hay forma de
        recuperarlos.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Guardá tu perfil</h2>
        <Suspense>
          <SaveAccount compact />
        </Suspense>
      </div>
      <div className="mt-6 flex items-center gap-4 text-sm">
        <Link href="/perfil" className="font-medium text-accent">
          ← Volver a mi perfil
        </Link>
        <form action="/auth/signout" method="post" className="ml-auto">
          <input type="hidden" name="confirm" value="1" />
          <button className="text-muted underline-offset-4 hover:underline">Salir igual y perder el perfil</button>
        </form>
      </div>
    </div>
  );
}
