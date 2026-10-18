import { describe, expect, test } from "vitest";
import { snapshot } from "@/lib/engine/profile";
import { runTurn } from "@/lib/engine/turn";
import { failing, provider, start } from "./helpers";

/**
 * Regresiones v2 del barrido de personalidades contra producción (18/10/2026, madrugada antes de la demo).
 * Sin Gemini (mock y LLM caído): es lo que pasa en la demo si se agota la cuota.
 */
describe("barrido de personalidades (producción, 18/10)", () => {
  test("triste: contiene y deja la Línea Vida, sin cortar la charla", async () => {
    const s = await start();
    const out = await runTurn(provider, s, "estoy re triste, no sé qué hacer con mi vida");
    expect(out.safety).toBe(false);
    expect(out.reply).toMatch(/Lamento que estés así/);
    expect(out.reply).toMatch(/0800 0767/);
    expect(s.status).toBe("ACTIVE");
  });

  test("riesgo: corta con el mensaje de seguridad (sin cambios)", async () => {
    const s = await start();
    const out = await runTurn(provider, s, "a veces pienso que no quiero vivir más");
    expect(out.safety).toBe(true);
    expect(s.status).toBe("SAFETY_STOP");
  });

  test("«sí» a «¿lo vemos ahora o preferís una pregunta más?» muestra el perfil", async () => {
    const s = await start();
    s.messages.push({ id: "o", role: "ASSISTANT", content: "¿Lo vemos ahora o preferís una pregunta más?", action: { type: "OFFER_CLOSE", level: 0 }, createdAt: "" });
    s.lastAction = { type: "OFFER_CLOSE", level: 0 };
    s.closeOffered = true;
    const out = await runTurn(provider, s, "sí");
    expect(out.action.type).toBe("CLOSE");
    expect(s.closeReason).toBe("user");
  });

  test("«otra» a la oferta de cierre es una pregunta más", async () => {
    const s = await start();
    s.messages.push({ id: "o", role: "ASSISTANT", content: "¿Lo vemos ahora o preferís una pregunta más?", action: { type: "OFFER_CLOSE", level: 0 }, createdAt: "" });
    s.lastAction = { type: "OFFER_CLOSE", level: 0 };
    s.closeOffered = true;
    const out = await runTurn(provider, s, "otra más");
    expect(out.action.type).not.toBe("CLOSE");
    expect(s.offerAccepted).toBe(true);
  });

  test("un rechazo elegido con botón nunca aparece como interés en «Lo que observé» ni en el mini-resumen", async () => {
    const s = await start();
    s.lastOptions = [{ id: "c2_oficina", label: "Estar sentado todo el día en una oficina" }];
    await runTurn(provider, s, "Estar sentado todo el día en una oficina", { optionId: "c2_oficina" });
    s.lastOptions = [{ id: "c2_numeros", label: "Trabajar con muchos números" }];
    await runTurn(provider, s, "Trabajar con muchos números", { optionId: "c2_numeros" });
    const obs = snapshot(s).observed;
    expect(obs.some((o) => /oficina|números/.test(o.quote))).toBe(false);
    expect(obs.some((o) => /ordenar y registrar/.test(o.text))).toBe(false);
  });

  test("no pregunta el mismo casillero dos veces seguidas si hay otro pendiente", async () => {
    const p = failing();
    const s = await start("A18_21", p);
    for (const l of ["me gusta el fútbol", "no sé", "no me gusta estudiar", "me gusta cocinar con mi abuela", "me gusta el fútbol"]) {
      if (s.status !== "ACTIVE") break;
      await runTurn(p, s, l);
    }
    const slots = s.messages.filter((m) => m.role === "ASSISTANT").map((m) => m.action?.slot);
    for (let i = 1; i < slots.length; i++) if (slots[i] && slots[i] !== "C3") expect(slots[i], `pregunta ${i}`).not.toBe(slots[i - 1]);
  });

  test("«¿sos un bot?», «¿cuántas preguntas faltan?» y «decime qué estudiar» tienen respuesta", async () => {
    const p = failing();
    const s = await start("A18_21", p);
    expect((await runTurn(p, s, "¿sos un bot?")).reply).toMatch(/soy una IA/);
    expect((await runTurn(p, s, "¿cuántas preguntas faltan?")).reply).toMatch(/8 preguntas como mucho/);
    const t = await start("A18_21", p);
    expect((await runTurn(p, t, "decime qué estudiar")).reply).toMatch(/caminos concretos/);
  });

  test("el miedo a equivocarse y la presión de la familia se reconocen antes de seguir", async () => {
    const s = await start();
    expect((await runTurn(provider, s, "Me da miedo elegir mal y arruinarme la vida")).reply).toMatch(/Es re común tener ese miedo/);
    const t = await start();
    expect((await runTurn(provider, t, "Mis viejos quieren que haga medicina")).reply).toMatch(/lo que esperan en tu casa/);
  });

  test("respuesta larga: cada interés con su cita, y el ejemplo concreto queda con su interés", async () => {
    const s = await start();
    const out = await runTurn(provider, s, "Me encanta programar jueguitos, el año pasado hice uno de naves con un amigo y me quedé noches enteras");
    expect(out.action.type).not.toBe("ASK_DEEPEN"); // ya dio el ejemplo
    const t = await start();
    await runTurn(
      provider,
      t,
      "Me encanta dibujar y pintar, los fines de semana ayudo a mi tía en su panadería atendiendo gente, el año pasado organicé con mis amigos una rifa para el viaje",
    );
    const quotes = new Set(t.evidence.filter((e) => e.indicatorId.startsWith("N2.")).map((e) => e.quote));
    expect(quotes.size).toBeGreaterThanOrEqual(2);
  });
});

describe("detalles de la noche (18/10)", () => {
  test("escribir el texto exacto de una opción cuenta como tocarla", async () => {
    const s = await start();
    await runTurn(provider, s, "Arreglar o armar cosas con las manos");
    const ev = s.evidence.filter((e) => e.quote === "Arreglar o armar cosas con las manos").map((e) => e.indicatorId).sort();
    expect(ev).toEqual(["N1.COSAS", "N2.R"]);
  });

  test("si el mensaje habla de lo que le importa, no le pide «la última vez que lo hiciste»", async () => {
    const s = await start();
    const out = await runTurn(provider, s, "Me importa ayudar a otros y que lo que haga sirva para algo");
    expect(out.action.type).not.toBe("ASK_DEEPEN");
  });

  test("el miedo se reconoce aunque toque el mini-resumen o la oferta de cierre", async () => {
    const s = await start();
    await runTurn(provider, s, "Me encanta dibujar, una vez dibujé un mural en el liceo");
    await runTurn(provider, s, "Me importa poder crear cosas");
    const out = await runTurn(provider, s, "Me da miedo elegir mal y arruinarme la vida");
    if (out.action.type === "MINI_SUMMARY" || out.action.type === "OFFER_CLOSE") expect(out.reply).toMatch(/Es re común tener ese miedo/);
    else expect(out.reply).toMatch(/Es re común tener ese miedo/);
  });
});

describe("con Gemini en producción (18/10, 07 UTC)", () => {
  test("«no entiendo» repregunta lo mismo con opciones y no cierra la charla", async () => {
    const s = await start();
    await runTurn(provider, s, "me gusta arreglar compus");
    await runTurn(provider, s, "¿qué me recomendás estudiar?");
    const before = s.lastAction;
    const out = await runTurn(provider, s, "no entiendo");
    expect(s.status).toBe("ACTIVE");
    expect(out.action.type).toBe("OFFER_OPTIONS");
    if (before?.slot && before.slot !== "C3") expect(out.action.slot).toBe(before.slot);
    expect(out.reply).toMatch(/Perdón, lo pregunto más fácil/);
  });

  test("la cita del mini-resumen es del área que resume", async () => {
    const s = await start();
    await runTurn(
      provider,
      s,
      "me gusta mucho la biología, los fines de semana ayudo a mi tía en su panadería, me encanta investigar cómo funcionan los bichos",
    );
    s.messages.push({ id: "q", role: "ASSISTANT", content: "¿Y algo más?", action: { type: "ASK_SLOT", level: 1, slot: "E3" }, createdAt: "" });
    const { miniSummaryText } = await import("@/lib/engine/interviewer-v2");
    const text = miniSummaryText(s);
    if (/entender cómo funcionan/.test(text)) expect(text).not.toMatch(/panadería/);
  });
});

describe("mini-resumen y «no entiendo» (producción, 18/10)", () => {
  test("«no entiendo» después del mini-resumen no lo toma como rechazo", async () => {
    const s = await start();
    await runTurn(provider, s, "Me gusta dibujar, una vez dibujé un mural en el liceo");
    await runTurn(provider, s, "también pinto cuadros en mi casa");
    s.messages.push({ id: "m", role: "ASSISTANT", content: "Hasta acá veo que te tira crear. ¿Va por ahí?", action: { type: "MINI_SUMMARY", level: 2 }, createdAt: "" });
    s.lastAction = { type: "MINI_SUMMARY", level: 2 };
    s.miniSummaryDone = true;
    await runTurn(provider, s, "no entiendo");
    expect(s.evidence.some((e) => e.area === "A" && e.status === "REJECTED")).toBe(false);
    // (El rechazo real, «No, no es así», está cubierto en turn-v2.test.ts.)
  });
});
