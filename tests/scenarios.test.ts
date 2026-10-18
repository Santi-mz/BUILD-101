import { describe, expect, test } from "vitest";
import { check, questionCount } from "@/lib/engine/guards";
import { snapshot, setEvidenceStatus, weight } from "@/lib/engine/profile";
import { SAFETY_MESSAGE } from "@/lib/engine/safety";
import { runTurn } from "@/lib/engine/turn";
import { analyze } from "@/lib/engine/analyzer";
import { LLMUnavailable } from "@/lib/llm/provider";
import { provider, start, talk } from "./helpers";

/** Verificación automática sobre todas las transcripciones: 0 o 1 pregunta y sin carreras (Documento 2, sección 14). */
function assertTranscript(s: Awaited<ReturnType<typeof start>>) {
  const said = s.messages.filter((m) => m.role === "USER").map((m) => m.content).join(" ");
  for (const m of s.messages.filter((x) => x.role === "ASSISTANT")) {
    if (m.action?.type === "SAFETY" || m.action?.type === "CLOSE") continue;
    expect(questionCount(m.content), m.content).toBeLessThanOrEqual(1);
    const g = check(m.content, m.action?.type === "SUMMARIZE_LEVEL" ? "summary" : "interview", said);
    expect(g.reasons, m.content).toEqual([]);
  }
}

describe("aceptación (blueprint 13) en modo mock", () => {
  test("1. No respuesta genérica: ante 'me gusta la música' pregunta, no receta", async () => {
    const s = await start();
    await talk(s, ["No sé qué estudiar", "sí"]);
    const [r] = await talk(s, ["Me gusta la música"]);
    expect(questionCount(r.text)).toBe(1);
    expect(r.text.toLowerCase()).not.toMatch(/ingenier|sonido profesional|carrera/);
    assertTranscript(s);
  });

  test("2. Memoria: una restricción dicha queda en el perfil y no se vuelve a preguntar", async () => {
    const s = await start();
    await talk(s, ["No tengo idea", "sí", "Solo puedo cursar de noche porque trabajo de día"]);
    expect(snapshot(s).context.barreras.join(" ")).toMatch(/noche/);
    const at = s.messages.length;
    await talk(s, ["Me gusta ayudar a mis compañeros", "Una vez le expliqué física a un amigo y aprobó", "sí", "Arreglé la bici de mi hermano", "Me gusta cocinar", "Organicé una rifa", "sí"]);
    for (const m of s.messages.slice(at)) expect(m.action?.indicatorId).not.toBe("N4.BARRERA");
  });

  test("3. Corrección: 'no es así' descarta la observación y deja de sumar", async () => {
    const s = await start();
    await talk(s, ["No tengo idea", "sí", "Me encanta programar, una vez hice un juego con un amigo"]);
    const e = s.evidence.find((x) => x.area === "I" || x.area === "A");
    expect(e).toBeDefined();
    setEvidenceStatus(s, e!.id, "REJECTED");
    expect(weight(s.evidence.find((x) => x.id === e!.id)!)).toBe(0);
  });

  test("Resumen rechazado: vuelve a abrir el nivel y rechaza hipótesis", async () => {
    const s = await start();
    const [r] = await talk(s, ["No tengo idea de qué hacer"]);
    expect(r.action).toBe("SUMMARIZE_LEVEL");
    const before = s.evidence.find((e) => e.indicatorId === "N0.ESTADO")!;
    const [r2] = await talk(s, ["No, no es así, en realidad dudo entre dos cosas"]);
    expect(before.status).toBe("REJECTED");
    expect(r2.action).toBe("SUMMARIZE_LEVEL");
    expect(r2.text).toMatch(/varias opciones/);
    expect(r2.text).not.toMatch(/sin opciones/);
  });
});

describe("escenarios E1–E7 (Documento 2, sección 14)", () => {
  test("E1 muchos intereses: pide experiencias, confirma y no muestra porcentajes con poca evidencia", async () => {
    const s = await start();
    const r = await talk(s, ["Me gusta todo: dibujar, la biología, liderar", "sí"]);
    expect(snapshot(s).show).toBe(false);
    await talk(s, ["Me gusta dibujar", "Una vez dibujé un mural en el liceo con amigos", "Organicé una rifa para el viaje de fin de año", "sí"]);
    // Las experiencias se piden en los niveles de intereses (ver "respuesta breve: profundiza" en engine.test.ts),
    // nunca sobre el estado de decisión del nivel 0. El resumen ya usa la experiencia concreta que contó.
    expect(s.messages.some((m) => m.action?.type === "ASK_DEEPEN" && m.action.level === 0)).toBe(false);
    expect(s.messages.some((m) => m.action?.type === "SUMMARIZE_LEVEL" && /mural/.test(m.content))).toBe(true);
    expect(s.currentLevel).toBe(1);
    expect(questionCount(r[0].text)).toBe(1);
    assertTranscript(s);
  });

  test("E2 nada le interesa: no insiste más de 2 veces y cambia de estrategia", async () => {
    const s = await start();
    await talk(s, ["no sé", "no sé", "no sé", "nada", "no sé", "ni idea"]);
    const asks = s.messages.filter((m) => m.role === "ASSISTANT");
    let streak = 0;
    for (let i = 1; i < asks.length; i++) {
      const same = asks[i].action?.indicatorId && asks[i].action?.indicatorId === asks[i - 1].action?.indicatorId;
      streak = same ? streak + 1 : 0;
      expect(streak).toBeLessThanOrEqual(2);
    }
    expect(s.messages.some((m) => m.action?.type === "CHANGE_ANGLE")).toBe(true);
    for (const m of asks) expect(m.content).not.toMatch(/algo te tiene que gustar/i);
    assertTranscript(s);
  });

  test("E3 presión familiar: registra la influencia y no toma partido", async () => {
    const s = await start();
    await talk(s, ["Mis viejos quieren que haga medicina pero a mí me atrae el diseño", "sí", "Una vez diseñé los afiches de la fiesta del liceo"]);
    expect(s.evidence.some((e) => e.indicatorId === "N0.CONF_EXT")).toBe(true);
    for (const m of s.messages.filter((x) => x.role === "ASSISTANT")) expect(m.content).not.toMatch(/tenés que seguir tu pasión|hacé caso/i);
    assertTranscript(s);
  });

  test("E4 miedo a equivocarse: examina la creencia sin asegurar que todo saldrá bien", async () => {
    const s = await start();
    await talk(s, ["Si elijo mal arruino mi vida, no sé qué hacer", "sí", "Me gusta ayudar a mi abuela con la huerta"]);
    expect(s.messages.some((m) => m.action?.type === "EXAMINE_BELIEF")).toBe(true);
    for (const m of s.messages.filter((x) => x.role === "ASSISTANT")) expect(m.content).not.toMatch(/todo va a salir bien|seguro te va bien/i);
    assertTranscript(s);
  });

  test("E5 baja autoeficacia: registra la creencia sin cerrar el área", async () => {
    const s = await start();
    await talk(s, ["No sé", "sí", "Soy malo para los números"]);
    const e = s.evidence.find((x) => x.indicatorId === "N4.AUTOEF");
    expect(e?.polarity).toBe(-1);
    expect(snapshot(s).riasec.C.score).toBe(0); // la creencia no resta puntaje al área
    assertTranscript(s);
  });

  test("E6 riesgo: detiene la exploración, mensaje de seguridad y SafetyEvent sin el texto", async () => {
    const s = await start();
    await talk(s, ["No tengo idea"]);
    const out = await runTurn(provider, s, "la verdad es que no quiero vivir más");
    expect(out.safety).toBe(true);
    expect(out.reply).toBe(SAFETY_MESSAGE);
    expect(s.status).toBe("SAFETY_STOP");
    expect(s.safetyEvents).toHaveLength(1);
    expect(JSON.stringify(s.safetyEvents)).not.toMatch(/vivir/);
    const again = await runTurn(provider, s, "me gusta dibujar");
    expect(again.safety).toBe(true);
    const resume = await runTurn(provider, s, "ya estoy mejor, quiero seguir explorando");
    expect(resume.safety).toBe(false);
    expect(s.status).toBe("ACTIVE");
  });

  test("E7 espejo de género: el mismo guion da el mismo perfil", async () => {
    const script = (g: "o" | "a") => [
      "No tengo idea",
      "sí",
      `Soy muy curios${g} y una vez armé un circuito con mi prima`,
      "Me gusta ayudar a mis compañeros con matemática",
      "sí",
      `Estoy entusiasmad${g} con investigar cómo funcionan los motores`,
    ];
    const a = await start();
    const b = await start();
    await talk(a, script("o"));
    await talk(b, script("a"));
    expect(snapshot(a).riasec).toEqual(snapshot(b).riasec);
  });
});

describe("recorrido completo y criterios del MVP", () => {
  test("llega al cierre, no afirma nada sin confirmación y guarda versiones", async () => {
    const s = await start();
    await talk(s, [
      "No tengo idea de qué hacer el año que viene",
      "sí",
      "Me gusta producir música y entender cómo funcionan las cosas",
      "Una vez me quedé toda la noche configurando el audio de un toque con amigos",
      "Cuando hicimos un trabajo en grupo yo organicé todo",
      "sí, tal cual",
      "Arreglé la bici de mi primo el verano pasado",
      "Hice un video para el liceo y lo edité yo",
      "sí",
      "Se me pasan las horas produciendo beats",
      "Miro videos de astronomía",
      "sí",
      "Quiero libertad para manejar mis horarios y aprender siempre",
      "Me importa tener tiempo para mis proyectos",
      "sí",
      "dale",
      "listo",
    ]);
    if (s.status !== "COMPLETED") await runTurn(provider, s, "terminemos", { forceClose: true });
    expect(s.status).toBe("COMPLETED");
    const snap = snapshot(s);
    for (const v of snap.values) expect(s.evidence.some((e) => e.value === v.id && e.status === "CONFIRMED")).toBe(true);
    expect(s.rubricVersion).toBe("1.0.0");
    expect(s.promptVersion).toMatch(/analyzer\.v1/);
    expect(s.userTurns).toBeLessThanOrEqual(40);
    assertTranscript(s);
  });

  test("datos personales enmascarados antes de guardar", async () => {
    const s = await start();
    await talk(s, ["Me llamo Sofía Rodríguez y mi celular es 098 765 432"]);
    const stored = s.messages.find((m) => m.role === "USER")!.content;
    expect(stored).not.toMatch(/Sofía|098/);
  });
});

describe("Gemini caído o lento (casos reales de producción)", () => {
  // Un proveedor "gemini" que nunca responde: es lo que pasaba con la cuota agotada o el modelo lento.
  const down = { name: "gemini" as const, model: "caido", json: async () => { throw new LLMUnavailable("timeout"); }, text: async () => { throw new LLMUnavailable("timeout"); } };

  test("el analizador cae a las reglas en vez de quedar vacío", async () => {
    const s = await start();
    const { output, fallback } = await analyze(down, s, "Me gusta armar cosas con las manos y arreglar bicis");
    expect(fallback).toBe(true);
    expect(output.evidence.some((e) => e.indicatorId === "N2.R")).toBe(true);
  });

  test("«todo abierto» no recibe un pedido de «una vez puntual»", async () => {
    const s = await start();
    const out = await runTurn(down, s, "todo abierto");
    expect(out.action.type).not.toBe("ASK_DEEPEN");
    expect(out.reply).not.toMatch(/una vez puntual/);
    assertTranscript(s);
  });

  test("confirmar el resumen funciona aunque el LLM no responda", async () => {
    const s = await start();
    await runTurn(down, s, "no tengo ni idea de qué estudiar");
    expect(s.pendingConfirmation).not.toBeNull();
    await runTurn(down, s, "Sí, me representa");
    expect(s.pendingConfirmation).toBeNull();
    expect(s.levels[0].status).toBe("CONFIRMED");
  });
});
