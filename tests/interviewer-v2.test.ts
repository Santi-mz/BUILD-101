import { describe, expect, test } from "vitest";
import { check } from "@/lib/engine/guards";
import type { LLMProvider } from "@/lib/llm/provider";
import { publicView } from "@/lib/session";
import { PERSONAS, provider, simulate, start } from "./helpers";

/** Entrevistador v2 y vista pública (spec demo-um-udelar, tarea 7). */
const COMMON = ["none", "skip"];
const SPECIAL = new Set(["MINI_SUMMARY", "OFFER_CLOSE"]);

describe("opciones en botones", () => {
  test("toda pregunta trae opciones: 3–6 del casillero (u 8 después de un «no sé») más las comunes", async () => {
    for (const [name, persona] of Object.entries(PERSONAS)) {
      const s = await simulate(persona);
      const msgs = s.messages;
      msgs.forEach((m, i) => {
        if (m.role !== "ASSISTANT" || m.action?.type === "CLOSE") return;
        const opts = m.action?.options ?? [];
        expect(opts.length, `${name} #${i} ${m.action?.type}`).toBeGreaterThan(0);
        if (SPECIAL.has(m.action?.type ?? "")) return;
        const ids = opts.map((o) => o.id);
        for (const c of COMMON) expect(ids, `${name} #${i}`).toContain(c);
        const own = ids.filter((id) => !COMMON.includes(id));
        if (m.action?.type === "OFFER_OPTIONS") expect(own.length, `${name} #${i}`).toBeLessThanOrEqual(8);
        else if (m.action?.slot && m.action.slot !== "C3" && m.action.type !== "ASK_DEEPEN") {
          expect(own.length, `${name} #${i}`).toBeGreaterThanOrEqual(3);
          expect(own.length, `${name} #${i}`).toBeLessThanOrEqual(6);
        }
      });
    }
  });

  test("después de «no sé» se ofrecen más opciones que en una pregunta normal y no se repiten las ya elegidas", async () => {
    const s = await simulate(PERSONAS.vago);
    const offers = s.messages.filter((m) => m.action?.type === "OFFER_OPTIONS");
    expect(offers.length).toBeGreaterThan(0);
    for (const m of offers) expect((m.action?.options ?? []).filter((o) => !COMMON.includes(o.id)).length).toBeGreaterThan(6);
    const b = await simulate(PERSONAS["solo-botones"]);
    const chosen = b.messages.filter((m) => m.role === "USER").map((m) => m.content);
    b.messages.forEach((m, i) => {
      if (m.role !== "ASSISTANT") return;
      const earlier = new Set(chosen.filter((_, k) => k < b.messages.slice(0, i).filter((x) => x.role === "USER").length));
      for (const o of m.action?.options ?? []) if (!COMMON.includes(o.id)) expect(earlier.has(o.label), o.label).toBe(false);
    });
  });

  test("mini-resumen y oferta de cierre traen sus botones fijos", async () => {
    const s = await simulate(PERSONAS.rico);
    const mini = s.messages.find((m) => m.action?.type === "MINI_SUMMARY");
    const offer = s.messages.find((m) => m.action?.type === "OFFER_CLOSE");
    expect(mini?.action?.options?.map((o) => o.label)).toEqual(["Sí, me representa", "Más o menos", "No, no es así"]);
    expect(offer?.action?.options?.map((o) => o.label)).toEqual(["Ver mi perfil", "Una pregunta más"]);
  });
});

describe("textos del entrevistador v2", () => {
  test("todos los mensajes de todos los personajes pasan las guardas y tienen una sola pregunta", async () => {
    for (const [name, persona] of Object.entries(PERSONAS)) {
      const s = await simulate(persona);
      const said = s.messages.filter((m) => m.role === "USER").map((m) => m.content).join(" ");
      for (const m of s.messages.filter((x) => x.role === "ASSISTANT" && x.action?.type !== "CLOSE")) {
        expect(check(m.content, "interview", said).reasons, `${name}: ${m.content}`).toEqual([]);
        expect((m.content.match(/\?/g) ?? []).length, `${name}: ${m.content}`).toBe(1);
      }
    }
  });

  test("mini-resumen, oferta de cierre y opciones no usan el LLM; un LLM que repite siempre lo mismo no logra repetir", async () => {
    const SAME = "¿Qué te gusta hacer en tu tiempo libre?";
    const texts: string[] = [];
    const p: LLMProvider = {
      name: "gemini",
      model: "spy",
      json: async () => ({ evidence: [], contradictions: [], answerQuality: "BRIEF", risk: { flag: false } }),
      text: async () => {
        texts.push(SAME);
        return SAME;
      },
    };
    const s = await simulate(PERSONAS.rico, { p });
    for (const m of s.messages.filter((x) => x.role === "ASSISTANT")) {
      if (["MINI_SUMMARY", "OFFER_CLOSE", "OFFER_OPTIONS"].includes(m.action?.type ?? "")) expect(m.content).not.toBe(SAME);
    }
    expect(s.messages.filter((m) => m.role === "ASSISTANT" && m.content === SAME).length).toBeLessThanOrEqual(1);
  });
});

describe("vista pública v2", () => {
  test("expone opciones, progreso y «Ver mi perfil» desde la primera pregunta", async () => {
    const s = await start();
    const v = publicView(s);
    expect(v.canClose).toBe(true);
    expect(v.questionsAsked).toBe(1);
    expect(v.maxQuestions).toBe(8);
    expect(v.options.length).toBeGreaterThan(2);
    expect(v.provisional).toBe(false);
    expect(v.closeReason).toBeNull();
    void provider;
  });
});
