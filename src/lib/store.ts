import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withDefaults } from "@/lib/engine/defaults";
import type { SessionState } from "@/lib/engine/types";

/**
 * Persistencia de sesiones. Supabase (service role, solo servidor) cuando está configurado;
 * memoria del proceso en modo demo local (se pierde al reiniciar: no sirve para producción).
 */
export interface SessionStore {
  kind: "supabase" | "memory";
  get(id: string): Promise<SessionState | null>;
  save(s: SessionState): Promise<void>;
  remove(id: string): Promise<void>;
  purgeExpired(now?: Date): Promise<number>;
  audit(event: string, sessionId: string | null, data?: Record<string, string | number | boolean>): Promise<void>;
}

const TABLE = "vocational_sessions";

function supabaseStore(): SessionStore {
  const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  return {
    kind: "supabase",
    async get(id) {
      const { data } = await db.from(TABLE).select("state,expires_at").eq("id", id).maybeSingle();
      if (!data || new Date(data.expires_at) < new Date()) return null;
      return withDefaults(data.state as SessionState);
    },
    async save(s) {
      const { error } = await db.from(TABLE).upsert({
        id: s.id,
        user_id: s.userId ?? null,
        state: s,
        status: s.status,
        rubric_version: s.rubricVersion,
        prompt_version: s.promptVersion,
        model: s.model,
        expires_at: s.expiresAt,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(`No pude guardar la sesión: ${error.message}`);
    },
    async remove(id) {
      await db.from(TABLE).delete().eq("id", id);
    },
    async purgeExpired(now = new Date()) {
      const { data } = await db.from(TABLE).delete().lt("expires_at", now.toISOString()).select("id");
      return data?.length ?? 0;
    },
    async audit(event, sessionId, data = {}) {
      await db.from("audit_events").insert({ event, session_id: sessionId, data });
    },
  };
}

type Mem = { sessions: Map<string, SessionState>; audit: { event: string; sessionId: string | null; data: object; at: string }[] };
const g = globalThis as unknown as { __cfMem?: Mem };
export const memory = (): Mem => (g.__cfMem ??= { sessions: new Map(), audit: [] });

function memoryStore(): SessionStore {
  const m = memory();
  return {
    kind: "memory",
    async get(id) {
      const s = m.sessions.get(id);
      if (!s || new Date(s.expiresAt) < new Date()) return null;
      return withDefaults(structuredClone(s));
    },
    async save(s) {
      m.sessions.set(s.id, structuredClone(s));
    },
    async remove(id) {
      m.sessions.delete(id);
    },
    async purgeExpired(now = new Date()) {
      let n = 0;
      for (const [id, s] of m.sessions) {
        if (new Date(s.expiresAt) < now) {
          m.sessions.delete(id);
          n++;
        }
      }
      return n;
    },
    async audit(event, sessionId, data = {}) {
      m.audit.push({ event, sessionId, data, at: new Date().toISOString() });
    },
  };
}

export function store(): SessionStore {
  const useSupabase = process.env.STORE !== "memory" && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
  return useSupabase ? supabaseStore() : memoryStore();
}
