import { describe, expect, test } from "vitest";
import { analyze, mockAnalyze } from "@/lib/engine/analyzer";
import { questionCount } from "@/lib/engine/guards";
import { detectIntent } from "@/lib/engine/intents";
import { runTurn } from "@/lib/engine/turn";
import type { LLMProvider } from "@/lib/llm/provider";
import { LLMUnavailable } from "@/lib/llm/provider";
import { provider, start, talk } from "./helpers";

/**
 * Regresiones de las auditorías de Benja y de las sesiones reales de producción (17/10/2026).
 * Todo con reglas y plantillas (sin Gemini): la lógica que se prueba acá es la misma con el LLM.
 */
const down: LLMProvider = {
  name: "gemini",
  model: "caido",
  json: async () => {
    throw new LLMUnavailable("x");
  },
  text: async () => {
    throw new LLMUnavailable("x");
  },
};
const asks = (s: Awaited<ReturnType<typeof start>>) => s.messages.filter((m) => m.role === "ASSISTANT");

describe("intenciones de la persona", () => {
  test("detecta las frases de la auditoría y no confunde respuestas largas", () => {
    expect(detectIntent("Quiero terminar")).toBe("CLOSE");
    expect(detectIntent("No quiero más preguntas")).toBe("CLOSE");
    expect(detectIntent("Eso ya te lo expliqué")).toBe("ALREADY_SAID");
    expect(detectIntent("¿Qué me recomendás estudiar?")).toBe("ASK_RECOMMENDATION");
    expect(detectIntent("No entiendo qué decís")).toBe("CONFUSED");
    expect(detectIntent("no entiendo la matemática pero me gusta dibujar")).toBeNull();
  });

  test("«quiero terminar» con algo de charla cierra y lleva a la devolución", async () => {
    const s = await start();
    await talk(s, ["no sé qué estudiar", "sí", "me gusta la música"]);
    const out = await runTurn(provider, s, "quiero terminar");
    expect(out.action.type).toBe("CLOSE");
    expect(s.status).toBe("COMPLETED");
  });

  test("«no quiero más preguntas» muy temprano: avisa y nunca pide un ejemplo encima", async () => {
    const s = await start();
    const out = await runTurn(provider, s, "no quiero más preguntas");
    expect(out.action.type).not.toBe("ASK_DEEPEN");
    expect(out.reply).toMatch(/una o dos respuestas más/);
    expect(questionCount(out.reply)).toBe(1);
  });

  test("«eso ya te lo expliqué»: lo reconoce y cambia de tema", async () => {
    const s = await start();
    await talk(s, ["Me gusta arreglar bicis"]);
    const out = await runTurn(provider, s, "Eso ya te lo expliqué");
    expect(out.reply).toMatch(/Tenés razón/);
    expect(out.action.type).not.toBe("ASK_DEEPEN");
  });

  test("«¿qué me recomendás estudiar?»: explica cuándo ve caminos, sin nombrar carreras", async () => {
    const s = await start();
    const out = await runTurn(provider, s, "¿Qué me recomendás estudiar?");
    expect(out.reply).toMatch(/caminos concretos/);
    expect(out.action.type).not.toBe("ASK_DEEPEN");
  });

  test("«no entiendo» ante un resumen: lo explica simple una vez y no lo toma como confirmación; a la segunda sigue", async () => {
    const s = await start();
    await talk(s, ["No tengo idea de nada, no me gusta estudiar"]);
    expect(s.pendingConfirmation).not.toBeNull();
    const first = await runTurn(down, s, "No entiendo qué decís");
    expect(first.reply).toMatch(/me expliqué mal/);
    expect(s.pendingConfirmation).not.toBeNull();
    const second = await runTurn(down, s, "¿De qué me hablás?");
    expect(second.reply).not.toBe(first.reply);
    expect(s.pendingConfirmation).toBeNull();
  });
});

describe("no repetir ni pedir ejemplos sin sentido", () => {
  test("un entrevistador que devuelve siempre la misma pregunta no logra repetirla (escenario F2)", async () => {
    const same: LLMProvider = { ...down, text: async () => "¿Qué te gusta hacer en tu tiempo libre?" };
    const s = await start();
    await talk(s, ["hola"]);
    for (const l of ["fútbol", "con amigos", "los viernes", "no sé", "asado", "música", "dibujar", "nada más"]) await runTurn(same, s, l);
    const questions = asks(s)
      .filter((m) => !["SUMMARIZE_LEVEL", "WAIT_CONFIRMATION", "CLOSE", "OFFER_CLOSE"].includes(m.action?.type ?? ""))
      .map((m) => m.content.match(/¿[^?]*\?/g)?.at(-1) ?? m.content);
    expect(new Set(questions).size).toBe(questions.length);
  });

  test("«está todo abierto» en el nivel 1 no recibe «una vez puntual en la que pasó eso» (captura de producción)", async () => {
    const s = await start();
    await talk(s, ["no sé qué estudiar", "sí"]);
    expect(s.currentLevel).toBe(1);
    const out = await runTurn(down, s, "Está todo abierto.");
    expect(out.action.type).not.toBe("ASK_DEEPEN");
    expect(out.reply).not.toMatch(/una vez puntual/);
  });

  test("no pide un ejemplo dos veces seguidas («con mis amigos, todos los viernes»)", async () => {
    const s = await start();
    await talk(s, ["no sé qué estudiar", "sí"]);
    await runTurn(down, s, "Me gusta comer asado con mis amigos");
    const out = await runTurn(down, s, "Con mis amigos, todos los viernes");
    expect(out.action.type).not.toBe("ASK_DEEPEN");
  });

  test("nunca pide episodios sobre el estado de decisión (nivel 0)", async () => {
    const s = await start();
    await talk(s, ["todo abierto", "bo", "no ser feliz", "tengo idea de qué quiero hacer"]);
    expect(asks(s).some((m) => m.action?.type === "ASK_DEEPEN" && m.action.level === 0)).toBe(false);
  });
});

describe("respuestas ricas y analizador por reglas", () => {
  test("una respuesta con muchos intereses no queda retenida en el nivel 0", async () => {
    const s = await start();
    const out = await runTurn(
      provider,
      s,
      "Me gusta dibujar, programar videojuegos con mis amigos, ayudar a mi hermano con matemática y organizar torneos de fútbol en el barrio",
    );
    expect(out.action.type).toBe("SUMMARIZE_LEVEL");
    for (const area of ["A", "S", "E", "R"]) expect(s.evidence.some((e) => e.indicatorId === `N2.${area}`), area).toBe(true);
  });

  test("los duplicados se sacan antes del tope: no se pierden evidencias distintas", async () => {
    const dup = { indicatorId: "N2.R", area: "R", polarity: 1, kind: "DECLARED", concrete: false, quote: "x", rationale: "r" };
    const distinct = ["A", "S", "E", "C", "I"].map((a) => ({ ...dup, indicatorId: `N2.${a}`, area: a }));
    const p: LLMProvider = { ...down, json: async () => ({ evidence: [...Array(9).fill(dup), ...distinct], contradictions: [], answerQuality: "RICH", risk: { flag: false } }) };
    const s = await start();
    const { output, fallback } = await analyze(p, s, "x");
    expect(fallback).toBe(false);
    expect(new Set(output.evidence.map((e) => e.indicatorId)).size).toBe(6);
  });

  test("la negación no contagia a otro interés de la misma frase", async () => {
    const s = await start();
    const out = mockAnalyze(s, "Odio las planillas y me encanta construir muebles");
    expect(out.evidence.find((e) => e.indicatorId === "N2.C")?.polarity).toBe(-1);
    expect(out.evidence.find((e) => e.indicatorId === "N2.R")?.polarity).toBe(1);
  });

  test("«miro videos de motos» no es interés artístico", async () => {
    const s = await start();
    const out = mockAnalyze(s, "miro videos de motos");
    expect(out.evidence.some((e) => e.indicatorId === "N2.A")).toBe(false);
  });

  test("seguir contando en vez de responder al resumen cuenta como confirmación parcial (sin repreguntar)", async () => {
    const s = await start();
    await talk(s, ["no sé qué estudiar"]);
    const out = await runTurn(provider, s, "Me gusta arreglar bicis con mi viejo");
    expect(out.action.type).not.toBe("WAIT_CONFIRMATION");
    expect(s.levels[0].status).toBe("CONFIRMED");
  });
});

describe("largo de la entrevista", () => {
  test("una persona colaboradora llega a la devolución en 12 turnos o menos", async () => {
    const s = await start();
    await talk(s, [
      "No tengo idea de qué estudiar, está todo abierto",
      "sí",
      "Me gusta armar y arreglar cosas, el año pasado arreglé la bici de mi hermano",
      "También me gusta estar con gente, una vez organicé una salida de todo el grupo",
      "Prefiero hacer cosas con las manos que estar con números, odio las planillas",
      "Me quedo horas arreglando cosas en el taller de mi abuelo",
      "sí",
      "Me gusta construir cosas, armé un mueble para mi cuarto",
      "Una vez construí una rampa para andar en skate con mis amigos",
      "sí",
      "Me importa tener libertad y no estar en una oficina",
      "Quiero aprender cosas nuevas y ver el resultado de lo que hago",
    ]);
    expect(s.status).toBe("COMPLETED");
    expect(s.userTurns).toBeLessThanOrEqual(12);
  });
});
