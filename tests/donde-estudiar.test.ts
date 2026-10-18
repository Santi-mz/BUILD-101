import { describe, expect, test } from "vitest";
import { CATALOGO, FICHAS } from "@/app/donde-estudiar/catalogo";
import { buscar, FILTROS_INICIALES, fuentesBecas, tieneCatalogo, type Filtros, type Seleccion } from "@/app/donde-estudiar/filtros";

const uy = (area: string, career: string | null = null): Seleccion => ({ area, career, region: "uy", country: null });
const f = (patch: Partial<Filtros> = {}): Filtros => ({ ...FILTROS_INICIALES, ...patch });
const ids = (rs: { ficha: { id: string } }[]) => rs.map((r) => r.ficha.id).sort();

// Dominios oficiales de las instituciones del catálogo.
const DOMINIOS = ["fing.edu.uy", "fcea.udelar.edu.uy", "utec.edu.uy", "carreras.ucu.edu.uy", "um.edu.uy", "fi.ort.edu.uy", "facs.ort.edu.uy", "ude.edu.uy"];

describe("catálogo de Dónde estudiar", () => {
  test("tiene los 19 programas reales, todos con atributos de filtro y sin datos DEMO", () => {
    expect(FICHAS).toHaveLength(19);
    expect(CATALOGO.programas).toHaveLength(19);
    for (const p of FICHAS) {
      // Marcas que usan los datos de demostración del repo (src/data/*.demo.json): "DEMO", "EJEMPLO:" e "Institución de demostración".
      expect(JSON.stringify(p)).not.toMatch(/\bDEMO\b|EJEMPLO:|de demostración/);
      expect(p.region).toBe("uy");
    }
  });

  test("ninguna ficha se presenta como inscripción vigente o beca confirmada", () => {
    expect(FICHAS.filter((p) => p.inscripcionVigente || p.becaConfirmada)).toEqual([]);
  });

  test("cada enlace es la página oficial de una carrera, en https y en un dominio institucional", () => {
    for (const p of FICHAS) {
      const u = new URL(p.url_programa);
      expect(u.protocol).toBe("https:");
      expect(DOMINIOS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`)), p.url_programa).toBe(true);
      expect(u.pathname.length, `${p.id} apunta a la portada`).toBeGreaterThan(1);
    }
  });
});

describe("búsquedas", () => {
  test("Economía en Uruguay encuentra los programas reales de Economía", () => {
    const r = buscar(uy("emp", "Economía"), f());
    expect(ids(r.direct)).toEqual(["ort-lic-economia", "ucu-negocios-economia", "udelar-fcea-lic-economia"]);
  });

  test("Ingeniería en Computación en Uruguay encuentra su programa y muestra aparte las relacionadas", () => {
    const r = buscar(uy("tec", "Ingeniería en Computación"), f());
    expect(ids(r.direct)).toEqual(["udelar-fing-ingenieria-computacion"]);
    expect(ids(r.related)).toEqual(["ort-ingenieria-sistemas", "udelar-fing-licenciatura-computacion", "um-ingenieria-informatica", "utec-utu-udelar-tecnologo-informatica"]);
  });

  test("Todas las del área muestra las nueve de Tecnología y datos", () => {
    expect(buscar(uy("tec"), f()).direct).toHaveLength(9);
  });

  test("Europa no muestra universidades uruguayas y se marca como destino sin catálogo", () => {
    const sel: Seleccion = { area: "emp", career: "Economía", region: "eu", country: null };
    expect(tieneCatalogo(sel)).toBe(false);
    const r = buscar(sel, f());
    expect([...r.direct, ...r.related, ...r.incomplete, ...r.excluded]).toEqual([]);
    expect(fuentesBecas(sel).map((s) => s.name)).not.toContain("Udelar · Becas");
  });

  test("un área sin catálogo no muestra resultados", () => {
    expect(tieneCatalogo(uy("cre"))).toBe(false);
  });
});

describe("filtros honestos", () => {
  test("Solo con beca confirmada no muestra coincidencias, porque ninguna beca está verificada", () => {
    const r = buscar(uy("emp"), f({ becas: true }));
    expect(r.direct).toEqual([]);
    expect(r.incomplete).toHaveLength(10);
    expect(r.incomplete.every((x) => x.checks.some((c) => c.key === "becas" && c.value === "unknown"))).toBe(true);
  });

  test("Matrícula gratuita: coincide solo lo confirmado; lo pago queda afuera y lo desconocido aparte", () => {
    const r = buscar(uy("emp", "Economía"), f({ budget: "free" }));
    expect(ids(r.direct)).toEqual(["udelar-fcea-lic-economia"]);
    expect(ids(r.excluded)).toEqual(["ort-lic-economia"]);
    expect(ids(r.incomplete)).toEqual(["ucu-negocios-economia"]);
  });

  test("Gratuita o con beca no cuenta una beca general de la universidad como confirmada", () => {
    const r = buscar(uy("tec", "Ingeniería en Computación"), f({ budget: "aid" }));
    expect(ids(r.incomplete)).toContain("ort-ingenieria-sistemas");
  });

  test("Modalidad: una modalidad no publicada no pasa el filtro", () => {
    const r = buscar(uy("tec"), f({ mode: "presencial" }));
    expect(ids(r.direct)).toEqual(["ort-ingenieria-sistemas", "ucu-ia-ciencia-datos", "utec-lic-ingenieria-datos-ia", "utec-utu-udelar-tecnologo-informatica"]);
    expect(ids(r.excluded)).toEqual(["utec-lic-tecnologias-informacion"]);
    expect(r.incomplete.every((x) => x.ficha.modes === null)).toBe(true);
  });

  test("Idioma: ninguna fuente lo publica, así que nada coincide y todo queda como incompleto", () => {
    const r = buscar(uy("emp"), f({ lang: "es" }));
    expect(r.direct).toEqual([]);
    expect(r.incomplete).toHaveLength(10);
  });
});
