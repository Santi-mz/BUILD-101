import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";

// Sin Supabase configurado (modo demo local) se usa una URL inalcanzable: getUser devuelve null y las consultas fallan sin romper la página.
export const hasSupabase = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:1";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "demo-sin-supabase";

/** Cliente con la sesión del usuario (respeta RLS). */
export async function supabaseServer() {
  // Supabase usa Date.now() al leer la sesión: con Cache Components hay que marcar el render como dinámico antes.
  await connection();
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Cliente con service role, solo para el cron (saltea RLS). Nunca usar en el navegador. */
export function supabaseAdmin() {
  return createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
