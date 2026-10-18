import { cookies } from "next/headers";
import { AREAS, STAGES, levelOf } from "@/lib/rubric";
import { panelItems, snapshot } from "@/lib/engine/profile";
import { closeReady, isV2, MAX_QUESTIONS } from "@/lib/engine/planner";
import type { SessionState } from "@/lib/engine/types";
import { NEXT_STEPS, suggestedFilters } from "@/lib/agents/pathways";
import { pathDetails } from "@/lib/agents/pathways";
import { providerName } from "@/lib/llm/provider";
import { store } from "@/lib/store";
import { RIASEC_KEYS, type ProfileData } from "@/lib/profile";

/** La sesión vive en una cookie httpOnly con un id aleatorio: sin cuenta, sin datos que identifiquen. */
export const COOKIE = "cf_session";

export async function sessionId() {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function loadSession(): Promise<SessionState | null> {
  const id = await sessionId();
  if (!id) return null;
  const s = await store().get(id);
  return s && s.status !== "DELETED" ? s : null;
}

export async function setSessionCookie(s: SessionState) {
  (await cookies()).set(COOKIE, s.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(s.expiresAt),
  });
}
export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export function stageOf(s: SessionState) {
  if (s.status === "COMPLETED") return STAGES[4];
  return STAGES[Math.min(3, s.currentLevel)];
}

/** Vista pública: lo que la UI necesita, sin campos internos. Los porcentajes solo se usan en /resultado. */
export function publicView(s: SessionState) {
  const rec = s.recommendations.at(-1) ?? null;
  const selected = rec?.routes.find((r) => r.path_id === s.selectedPathId) ?? null;
  return {
    id: s.id,
    status: s.status,
    phase: s.phase,
    stage: stageOf(s),
    stageIndex: STAGES.indexOf(stageOf(s)),
    stages: STAGES,
    level: s.currentLevel,
    levelName: levelOf(Math.min(3, s.currentLevel)).name,
    userTurns: s.userTurns,
    pendingConfirmation: Boolean(s.pendingConfirmation),
    // v2 (demo): "Ver mi perfil" disponible desde la primera pregunta. v1: desde el turno 4.
    canClose: isV2(s) ? s.status === "ACTIVE" : s.userTurns >= 4,
    closeReady: closeReady(s),
    // v2: opciones en botones del último mensaje, progreso y cierre.
    options: s.status === "ACTIVE" ? (s.lastOptions ?? []) : [],
    questionsAsked: s.questionsAsked,
    maxQuestions: isV2(s) ? MAX_QUESTIONS : null,
    provisional: s.provisional,
    closeReason: s.closeReason,
    messages: s.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, action: m.action?.type ?? null })),
    panel: panelItems(s),
    profile: snapshot(s),
    filters: rec?.filters ?? suggestedFilters(s),
    recommendation: rec && !rec.rejected ? rec : null,
    selectedPath: selected ? { route: selected, details: pathDetails(selected) } : null,
    pathQuestions: s.pathQuestions,
    mentorConsent: s.consents.some((c) => c.purpose === "mentors" && c.status === "granted" && c.pathId === s.selectedPathId),
    mentorResult: s.mentorResult,
    nextSteps: NEXT_STEPS,
    nextStep: s.nextStep,
    tasks: s.tasks.slice(-8),
    feedbackSent: Boolean(s.feedback),
    mode: { llm: providerName(), store: store().kind },
    expiresAt: s.expiresAt,
    versions: { rubric: s.rubricVersion, prompts: s.promptVersion, model: s.model },
  };
}
export type PublicSession = ReturnType<typeof publicView>;

/** Perfil compatible con el feed de noticias (lo usa src/lib/feed.ts) para quien entró con cuenta. */
export function feedProfile(s: SessionState): Pick<ProfileData, "riasec" | "interests_keywords" | "summary"> {
  const snap = snapshot(s);
  const conf = snap.confidence === "alta" ? 0.9 : snap.confidence === "media" ? 0.7 : 0.5;
  return {
    riasec: Object.fromEntries(RIASEC_KEYS.map((k) => [k, { score: (snap.riasec[k]?.pct ?? 0) / 100, confidence: conf }])) as ProfileData["riasec"],
    interests_keywords: snap.specifics.map((x) => x.text).slice(0, 10),
    summary: snap.top.length ? `Lo que más apareció: ${snap.top.map((a) => snap.riasec[a].label).join(", ")}.` : "Perfil en construcción.",
  };
}
export const AREA_KEYS = AREAS;
