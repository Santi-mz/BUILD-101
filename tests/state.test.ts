import { describe, expect, test } from "vitest";
import { v2Defaults, withDefaults } from "@/lib/engine/defaults";
import { newSession } from "@/lib/engine/turn";
import type { SessionState } from "@/lib/engine/types";
import { memory, store } from "@/lib/store";

/** Estado v2 de la sesión (spec demo-um-udelar, tarea 4). */
describe("estado v2", () => {
  test("una sesión nueva arranca con todos los campos v2 en su valor inicial", () => {
    const s = newSession({ ageRange: "A18_21", guardianConsent: false, model: "mock" });
    for (const [k, v] of Object.entries(v2Defaults())) expect((s as unknown as Record<string, unknown>)[k], k).toEqual(v);
  });

  test("una sesión guardada antes de la v2 carga con defaults y con las preguntas ya hechas contadas", () => {
    const s = newSession({ ageRange: "A18_21", guardianConsent: false, model: "mock" }) as Partial<SessionState>;
    for (const k of Object.keys(v2Defaults())) delete (s as Record<string, unknown>)[k];
    s.messages = [
      { id: "a", role: "ASSISTANT", content: "¡Hola! ¿Cómo estás?", createdAt: "" },
      { id: "b", role: "USER", content: "bien", createdAt: "" },
      { id: "c", role: "ASSISTANT", content: "Bien. ¿Qué te gusta hacer?", createdAt: "" },
    ];
    const loaded = withDefaults(s as SessionState);
    expect(loaded.questionsAsked).toBe(2);
    expect(loaded.stall).toBe(0);
    expect(loaded.lastOptions).toBeNull();
    expect(loaded.slotsAsked).toEqual([]);
  });

  test("el store en memoria completa los campos al leer", async () => {
    const s = newSession({ ageRange: "A18_21", guardianConsent: false, model: "mock" }) as Partial<SessionState>;
    delete (s as Record<string, unknown>).questionsAsked;
    delete (s as Record<string, unknown>).lastOptions;
    memory().sessions.set(s.id!, s as SessionState);
    const loaded = await store().get(s.id!);
    expect(loaded?.questionsAsked).toBe(0);
    expect(loaded?.lastOptions).toBeNull();
  });
});
