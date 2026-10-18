import { describe, expect, test } from "vitest";
import { ONE_MORE, runTurn } from "@/lib/engine/turn";
import { failing, provider, start } from "./helpers";

/** Turno v2 (spec demo-um-udelar, tarea 6): opciones sin LLM, cierre a pedido, contadores y freno del tope. */
describe("turno v2", () => {
  test("una opción del banco registra su evidencia sin llamar al LLM", async () => {
    const p = failing();
    const s = await start("A18_21", p);
    s.lastOptions = [{ id: "e2_arreglar", label: "Arreglar o armar cosas con las manos" }];
    p.calls = 0;
    await runTurn(p, s, "Arreglar o armar cosas con las manos", { optionId: "e2_arreglar" });
    const added = s.evidence.filter((e) => e.quote === "Arreglar o armar cosas con las manos");
    expect(added.map((e) => e.indicatorId).sort()).toEqual(["N1.COSAS", "N2.R"]);
    expect(added.every((e) => e.kind === "DECLARED" && !e.concrete)).toBe(true);
    // El entrevistador sí intenta redactar (y cae a plantilla); el analizador no se llamó.
    expect(p.calls).toBeLessThanOrEqual(2);
    expect(s.stall).toBe(0);
  });

  test("«Ninguna de estas» cuenta como respuesta sin información; un optionId desconocido es texto", async () => {
    const s = await start();
    s.lastOptions = [{ id: "none", label: "Ninguna de estas" }];
    await runTurn(provider, s, "Ninguna de estas", { optionId: "none" });
    expect(s.stall).toBe(1);
    const before = s.evidence.length;
    await runTurn(provider, s, "Me gusta dibujar", { optionId: "inventado" });
    expect(s.evidence.length).toBeGreaterThan(before);
  });

  test("pedir el perfil cierra sin LLM, con motivo, y es provisional si faltan los imprescindibles", async () => {
    const p = failing();
    const s = await start("A18_21", p);
    p.calls = 0;
    const out = await runTurn(p, s, "quiero ver mi perfil");
    expect(out.action.type).toBe("CLOSE");
    expect(p.calls).toBe(0);
    expect(s.closeReason).toBe("user");
    expect(s.provisional).toBe(true);
    expect(out.reply).toMatch(/perfil provisional/);
  });

  test("el contador de preguntas acompaña la charla y nunca deja pasar una novena", async () => {
    const s = await start();
    expect(s.questionsAsked).toBe(1);
    await runTurn(provider, s, "me gusta dibujar");
    expect(s.questionsAsked).toBe(2);
    s.questionsAsked = 8; // por ejemplo, una sesión vieja que ya se pasó
    const out = await runTurn(provider, s, "también me gusta la música");
    expect(out.action.type).toBe("CLOSE");
    expect(s.closeReason).toBe("budget");
    expect(s.status).toBe("COMPLETED");
  });

  test("con el LLM caído y sin nada que rescatar por reglas, suma fallos y termina ofreciendo cerrar", async () => {
    const p = failing();
    const s = await start("A18_21", p);
    await runTurn(p, s, "eh");
    await runTurn(p, s, "mmm");
    expect(s.llmFailures).toBe(2);
    expect(s.stall).toBe(2);
  });

  test("«Una pregunta más» en la oferta de cierre hace una sola pregunta extra y después cierra", async () => {
    const s = await start();
    s.messages.push({ id: "o", role: "ASSISTANT", content: "Ya tengo bastante. ¿Querés ver tu perfil o una pregunta más?", action: { type: "OFFER_CLOSE", level: 0 }, createdAt: "" });
    s.lastAction = { type: "OFFER_CLOSE", level: 0 };
    s.closeOffered = true;
    s.lastOptions = [ONE_MORE];
    const extra = await runTurn(provider, s, ONE_MORE.label, { optionId: ONE_MORE.id });
    expect(extra.action.type).not.toBe("CLOSE");
    expect(s.offerAccepted).toBe(true);
    const last = await runTurn(provider, s, "me gusta dibujar");
    expect(last.action.type).toBe("CLOSE");
    expect(s.closeReason).toBe("offer_accepted");
  });

  test("rechazar el mini-resumen descarta lo resumido y no vuelve a resumir", async () => {
    const s = await start();
    await runTurn(provider, s, "Me gusta dibujar, una vez dibujé un mural en el liceo");
    await runTurn(provider, s, "también pinto cuadros en mi casa");
    s.messages.push({ id: "m", role: "ASSISTANT", content: "Hasta acá veo que te gusta crear. ¿Va por ahí?", action: { type: "MINI_SUMMARY", level: 2 }, createdAt: "" });
    s.lastAction = { type: "MINI_SUMMARY", level: 2 };
    s.miniSummaryDone = true;
    await runTurn(provider, s, "No, no es así");
    expect(s.evidence.filter((e) => e.area === "A" && e.polarity === 1).every((e) => e.status === "REJECTED")).toBe(true);
  });
});

describe("oferta de cierre honesta (producción, 18/10)", () => {
  test("con el LLM caído, «no sé» y «¿qué me recomendás?» no cuentan como fallos del LLM ni disparan la oferta", async () => {
    const p = failing();
    const s = await start("A18_21", p);
    await runTurn(p, s, "no sé");
    const out = await runTurn(p, s, "¿qué me recomendás estudiar?");
    expect(s.llmFailures).toBe(0);
    expect(out.action.type).not.toBe("OFFER_CLOSE");
    expect(out.reply).toMatch(/caminos concretos/);
  });

  test("si ofrece cerrar sin los imprescindibles, no dice que ya puede armar el perfil", async () => {
    const p = failing();
    const s = await start("A18_21", p);
    await runTurn(p, s, "eh");
    const out = await runTurn(p, s, "mmm");
    expect(out.action.type).toBe("OFFER_CLOSE");
    expect(out.reply).not.toMatch(/ya puedo armarte/);
    expect(out.reply).toMatch(/Todavía sé poco/);
  });
});
