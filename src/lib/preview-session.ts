import { withDefaults } from "@/lib/engine/defaults";
import type { SessionState } from "@/lib/engine/types";

/**
 * Fallback EXCLUSIVO de Vercel Preview cuando no hay almacenamiento persistente.
 * El grafo vocacional sigue en src/lib/graph.ts: no es un almacén de conversaciones.
 *
 * Solo para pruebas con respuestas inventadas: el estado va y vuelve al navegador y
 * no está firmado. No utilizar como autenticación ni con datos reales de menores.
 * Production y cualquier despliegue con Supabase permanecen en el flujo existente.
 */
export function browserPreviewEnabled() {
  const hasDatabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    && process.env.STORE !== "memory";
  return process.env.VERCEL_ENV === "preview" && !hasDatabase;
}

/** Entrada de cliente NO confiable: validar forma, tamaño y límites antes de usarla. */
export function readPreviewState(value: unknown): SessionState | null {
  if (!browserPreviewEnabled() || !value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    if (JSON.stringify(value).length > 100_000) return null;
    const s = value as Partial<SessionState>;
    if (typeof s.id !== "string" || !/^[a-f0-9-]{36}$/i.test(s.id)) return null;
    if (s.userId || !["ACTIVE", "COMPLETED", "SAFETY_STOP"].includes(s.status ?? "")) return null;
    if (!["A14_15", "A16_17", "A18_21", "A22_25", "A26_MAS"].includes(s.ageRange ?? "")) return null;
    if (!s.consentAt || !s.createdAt || !s.expiresAt || Date.parse(s.expiresAt) <= Date.now()) return null;
    if (!Array.isArray(s.messages) || s.messages.length > 30) return null;
    if (!Array.isArray(s.evidence) || s.evidence.length > 150) return null;
    if (!Array.isArray(s.recommendations) || s.recommendations.length > 5) return null;
    if (!Array.isArray(s.consents) || !Array.isArray(s.levels)) return null;
    if (!Number.isInteger(s.userTurns) || s.userTurns! < 0 || s.userTurns! > 20) return null;
    // El servidor aplica sus propias reglas de seguridad, preguntas y perfil tras recuperar el estado.
    return withDefaults(structuredClone(s as SessionState));
  } catch {
    return null;
  }
}

export function previewEnvelope(s: SessionState) {
  return browserPreviewEnabled() ? { __previewState: s, previewStorage: "browser" as const } : {};
}
