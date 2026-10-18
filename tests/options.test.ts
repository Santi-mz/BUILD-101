import { describe, expect, test } from "vitest";
import rawOptions from "@/knowledge/options.v1.json";
import rawV1 from "@/knowledge/rubric.v1.json";
import { check } from "@/lib/engine/guards";
import {
  commonOptions,
  indicator,
  OPTION_GROUPS,
  optionBank,
  optionBankSchema,
  optionById,
  optionsOf,
  rubric,
  RUBRIC_VERSION,
  rubricV1,
  rubricV2,
  SLOT_IDS,
  VALUE_IDS,
} from "@/lib/rubric";

/** Rúbrica v2 y banco de opciones (spec demo-um-udelar, tarea 3; prueba T10 de design.md). */
describe("rúbrica v2", () => {
  test("es la activa por defecto y mantiene los niveles e indicadores de la v1", () => {
    expect(RUBRIC_VERSION).toBe("2.0.0");
    expect(rubric).toBe(rubricV2);
    expect(rubricV2.levels).toEqual(rubricV1.levels);
    expect(rubricV1.version).toBe((rawV1 as { version: string }).version);
  });

  test("tiene el presupuesto de 8 preguntas y los seis casilleros en orden de prioridad", () => {
    expect(rubricV2.limits.maxQuestions).toBe(8);
    expect(rubricV2.limits.targetQuestions).toEqual([5, 7]);
    expect(rubricV2.slots?.map((s) => s.id)).toEqual([...SLOT_IDS]);
    const priorities = rubricV2.slots!.map((s) => s.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  test("todos los indicadores de los casilleros existen (o son comodines de nivel)", () => {
    for (const slot of rubricV2.slots!)
      for (const id of slot.indicators) {
        if (id.endsWith(".*")) continue;
        expect(indicator(id), `${slot.id}: ${id}`).toBeDefined();
      }
  });
});

describe("banco de opciones v1", () => {
  const all = OPTION_GROUPS.flatMap((g) => optionBank.slots[g]);

  test("el esquema es válido y los ids son únicos", () => {
    expect(optionBankSchema.safeParse(rawOptions).success).toBe(true);
    expect(new Set(all.map((o) => o.id)).size).toBe(all.length);
    for (const o of all) expect(optionById(o.id)?.label).toBe(o.label);
  });

  test("toda evidencia apunta a un indicador de la rúbrica, y los valores existen", () => {
    for (const o of all)
      for (const e of o.evidence ?? []) {
        expect(indicator(e.indicatorId), `${o.id}: ${e.indicatorId}`).toBeDefined();
        if (e.indicatorId === "N4.VALOR") expect(VALUE_IDS, o.id).toContain(e.value);
      }
  });

  test("T10: todos los textos pasan las guardas de la entrevista (sin carreras, instituciones ni diagnósticos)", () => {
    for (const o of all) expect(check(o.label, "interview").reasons, o.label).toEqual([]);
  });

  test("cada casillero con opciones tiene entre 3 y 8, y siempre están las comunes sin información", () => {
    for (const slot of SLOT_IDS) {
      const n = optionsOf(slot).length;
      if (slot === "C3") expect(n).toBe(0); // C3 es texto libre ("contame una vez…")
      else {
        expect(n, slot).toBeGreaterThanOrEqual(3);
        expect(n, slot).toBeLessThanOrEqual(8);
      }
    }
    expect(commonOptions().map((o) => o.id)).toEqual(["none", "skip"]);
    expect(commonOptions().every((o) => o.noInfo)).toBe(true);
  });

  test("las opciones con información generan evidencia (salvo «Ninguna en especial», que marca C1)", () => {
    for (const slot of SLOT_IDS)
      for (const o of optionsOf(slot)) expect((o.evidence?.length ?? 0) > 0 || o.marksDone === true, o.id).toBe(true);
  });
});
