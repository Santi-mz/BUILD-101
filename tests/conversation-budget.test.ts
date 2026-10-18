import { describe, expect, test } from "vitest";
import { snapshot } from "@/lib/engine/profile";
import type { SessionState } from "@/lib/engine/types";
import { countQuestions, failing, field, PERSONAS, prng, provider, reply, simulate, start, type Reply } from "./helpers";

/**
 * Presupuesto de la conversación (spec .kiro/specs/demo-um-udelar, Testing Strategy T1–T7 y T9).
 * Todo sin red: proveedor mock (reglas + plantillas) o `failing`.
 *
 * `test.fails` = el comportamiento de hoy NO cumple la spec (el bug queda documentado y el CI verde).
 * Las tareas 5 y 6 (planificador v2 y turno) las tienen que pasar a `test` normal; la T7, la tarea 9.
 */
const MAX = 8;
// El contador del estado no puede esconder preguntas: se toma el mayor entre el contador y la transcripción.
const questions = (s: SessionState) => Math.max(field<number>(s, "questionsAsked") ?? 0, countQuestions(s));
const assistant = (s: SessionState) => s.messages.filter((m) => m.role === "ASSISTANT");
const SUMMARY = new Set(["SUMMARIZE_LEVEL", "MINI_SUMMARY"]);

/** Una respuesta al azar: botón del banco, texto rico, "no sé", pedir el perfil o confirmar. */
function randomReply(rand: () => number, s: SessionState, i: number): Reply {
  const opts = field<{ id: string; label: string }[] | null>(s, "lastOptions") ?? [];
  const r = rand();
  if (r < 0.3 && opts.length) {
    const o = opts[Math.floor(rand() * opts.length)];
    return { message: o.label, optionId: o.id };
  }
  if (r < 0.55) return PERSONAS.rico(s, i);
  if (r < 0.85) return PERSONAS.vago(s, i);
  if (r < 0.9) return { message: "quiero ver mi perfil" };
  return { message: "sí" };
}

describe("presupuesto de 8 preguntas (spec demo)", () => {
  test.fails(
    "T1: 200 conversaciones al azar (semilla fija) terminan COMPLETED con 8 preguntas o menos",
    async () => {
      const rand = prng(20261018);
      for (let c = 0; c < 200; c++) {
        const s = await start();
        for (let i = 0; i < 45 && s.status === "ACTIVE"; i++) await reply(provider, s, randomReply(rand, s, i));
        expect(s.status, `conversación ${c}`).toBe("COMPLETED");
        expect(questions(s), `conversación ${c}`).toBeLessThanOrEqual(MAX);
      }
    },
    120_000,
  );

  test.fails("T2: ningún personaje recibe más de 8 mensajes del asistente con «?»", async () => {
    for (const [name, persona] of Object.entries(PERSONAS)) {
      const s = await simulate(persona);
      expect(countQuestions(s), name).toBeLessThanOrEqual(MAX);
    }
  });

  test("T3: con 10 «no sé» seguidos, ningún tema se pregunta más de 2 veces y no hay ASK_DEEPEN", async () => {
    const s = await start();
    for (let i = 0; i < 10 && s.status === "ACTIVE"; i++) await reply(provider, s, { message: "no sé" });
    const asked = new Map<string, number>();
    for (const m of assistant(s)) {
      const key = field<string>(m.action, "slot") ?? m.action?.indicatorId;
      if (key) asked.set(key, (asked.get(key) ?? 0) + 1);
    }
    for (const [key, n] of asked) expect(n, key).toBeLessThanOrEqual(2);
    // Todas las respuestas son "sin información": nunca debe pedirse "un ejemplo concreto".
    expect(assistant(s).some((m) => m.action?.type === "ASK_DEEPEN")).toBe(false);
  });

  test.fails("T4: el personaje rico cierra entre la pregunta 5 y la 7", async () => {
    const s = await simulate(PERSONAS.rico);
    expect(s.status).toBe("COMPLETED");
    expect(questions(s)).toBeGreaterThanOrEqual(5);
    expect(questions(s)).toBeLessThanOrEqual(7);
  });
});

describe("perfil a pedido y resiliencia (spec demo)", () => {
  const closeAt = async (turn: number) => {
    const s = await start();
    for (let i = 0; i < turn && s.status === "ACTIVE"; i++) {
      const last = i === turn - 1;
      await reply(provider, s, last ? { message: "quiero ver mi perfil", close: true } : PERSONAS.rico(s, i));
    }
    return s;
  };

  test("T5a: pedir el perfil en el turno 1, 3 o 6 cierra la sesión", async () => {
    for (const t of [1, 3, 6]) expect((await closeAt(t)).status, `turno ${t}`).toBe("COMPLETED");
  });

  test.fails("T5b: pedir el perfil en el turno 1 o 3 deja un perfil provisional", async () => {
    for (const t of [1, 3]) expect(field<boolean>(await closeAt(t), "provisional"), `turno ${t}`).toBe(true);
  });

  test.fails("T6a: con el LLM caído la charla igual cierra con 8 preguntas o menos", async () => {
    const s = await simulate(PERSONAS.mixto, { p: failing() });
    expect(s.status).toBe("COMPLETED");
    expect(questions(s)).toBeLessThanOrEqual(MAX);
  });

  test.fails("T6b: pedir el perfil (close: true) no llama al LLM", async () => {
    const p = failing();
    const s = await start("A18_21", p);
    p.calls = 0;
    await reply(p, s, { message: "quiero ver mi perfil", close: true });
    expect(s.status).toBe("COMPLETED");
    expect(p.calls).toBe(0);
  });
});

describe("devolución y resúmenes (spec demo)", () => {
  test.fails("T7: lo observado cita evidencias existentes y lo desconocido cubre los casilleros faltantes", async () => {
    const s = await simulate(PERSONAS.mixto);
    const snap = snapshot(s) as unknown as Record<string, unknown>;
    const observed = field<{ evidenceIds: string[] }[]>(snap, "observed");
    const unknown = field<string[]>(snap, "unknown");
    expect(observed).toBeDefined();
    expect(unknown).toBeDefined();
    const ids = new Set(s.evidence.map((e) => e.id));
    for (const o of observed ?? []) for (const id of o.evidenceIds) expect(ids.has(id)).toBe(true);
    const slots = field<Record<string, boolean>>(snap, "slots") ?? {};
    expect(unknown?.length).toBe(Object.values(slots).filter((v) => !v).length);
  });

  test.fails("T9: rechazar el resumen no produce otro resumen", async () => {
    const s = await simulate(PERSONAS.rechaza, { maxTurns: 20 });
    const msgs = s.messages;
    const firstRejected = msgs.findIndex(
      (m, i) => m.role === "ASSISTANT" && SUMMARY.has(m.action?.type ?? "") && /^no\b/i.test(msgs[i + 1]?.content ?? ""),
    );
    expect(firstRejected).toBeGreaterThanOrEqual(0);
    expect(msgs.slice(firstRejected + 1).some((m) => m.role === "ASSISTANT" && SUMMARY.has(m.action?.type ?? ""))).toBe(false);
  });
});
