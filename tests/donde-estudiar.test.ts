import { describe, expect, test } from "vitest";
import { CATALOGO, FICHAS } from "@/app/donde-estudiar/catalogo";
import { buscar, FILTROS_INICIALES, fuentesBecas, tieneCatalogo, type Filtros, type Seleccion } from "@/app/donde-estudiar/filtros";
import { seleccionInicial, urlDe } from "@/app/donde-estudiar/parametros";

const uy = (area: string, career: string | null = null): Seleccion => ({ area, career, region: "uy", country: null });
const f = (patch: Partial<Filtros> = {}): Filtros => ({ ...FILTROS_INICIALES, ...patch });
const ids = (rs: { ficha: { id: string } }[]) => rs.map((r) => r.ficha.id).sort();

// Dominios oficiales de las instituciones del catálogo.
const DOMINIOS = ["fing.edu.uy", "fcea.udelar.edu.uy", "utec.edu.uy", "carreras.ucu.edu.uy", "um.edu.uy", "fi.ort.edu.uy", "facs.ort.edu.uy", "ude.edu.uy", "psico.edu.uy", "cure.edu.uy", "fic.edu.uy"];

describe("catálogo de Dónde estudiar", () => {
  test("tiene los 33 programas reales, todos con atributos de filtro y sin datos DEMO", () => {
    expect(FICHAS).toHaveLength(33);
    expect(CATALOGO.programas).toHaveLength(33);
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

  test("las cinco áreas tienen programas en Uruguay y ninguna en Otro destino", () => {
    for (const area of ["tec", "emp", "per", "cre", "man"]) {
      expect(tieneCatalogo(uy(area)), area).toBe(true);
      expect(tieneCatalogo({ area, career: null, region: "otro", country: null }), area).toBe(false);
    }
  });

  test("cada carrera de cada área tiene al menos un programa que coincide", () => {
    const carreras: Record<string, string[]> = {
      per: ["Enfermería", "Psicología", "Trabajo social", "Educación"],
      cre: ["Música", "Comunicación", "Contenidos digitales"],
      man: ["Mecatrónica y automatización", "Energías renovables", "Ingeniería civil", "Ingeniería mecánica"],
    };
    for (const [area, cs] of Object.entries(carreras)) for (const c of cs) expect(buscar(uy(area, c), f()).direct.length, `${area} · ${c}`).toBeGreaterThan(0);
  });

  test("Enfermería: Udelar (CURE, Rocha) y UCU, sin marcar inscripción vigente", () => {
    const r = buscar(uy("per", "Enfermería"), f());
    expect(ids(r.direct)).toEqual(["ucu-licenciatura-enfermeria", "udelar-cure-enfermeria-rocha"]);
    const cure = r.direct.find((x) => x.ficha.id === "udelar-cure-enfermeria-rocha")!.ficha;
    expect(cure.inscripcionVigente).toBe(false);
    expect(cure.inscripciones).toMatch(/NO abre inscripciones/);
  });

  test("Comunicación muestra la tecnicatura de UTEC como relacionada, no como la misma carrera", () => {
    const r = buscar(uy("cre", "Comunicación"), f());
    expect(ids(r.direct)).toEqual(["ucu-licenciatura-comunicacion", "udelar-fic-licenciatura-comunicacion"]);
    expect(ids(r.related)).toEqual(["utec-tec-comunicacion-creativa"]);
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

  test("Hacer con las manos · Matrícula gratuita: solo Udelar coincide; UTEC queda como incompleto", () => {
    const r = buscar(uy("man"), f({ budget: "free" }));
    expect(ids(r.direct)).toEqual(["udelar-fing-ingenieria-civil", "udelar-fing-ingenieria-industrial-mecanica"]);
    expect(r.incomplete.every((x) => x.ficha.institucion.includes("UTEC"))).toBe(true);
  });

  test("Semipresencial cuenta como híbrida y no como presencial", () => {
    const hib = buscar(uy("cre", "Música"), f({ mode: "hibrida" }));
    expect(ids(hib.direct)).toEqual(["utec-lic-jazz-musica-creativa"]);
    expect(ids(buscar(uy("cre", "Música"), f({ mode: "presencial" })).excluded)).toEqual(["utec-lic-jazz-musica-creativa"]);
  });

  test("Idioma: ninguna fuente lo publica, así que nada coincide y todo queda como incompleto", () => {
    const r = buscar(uy("emp"), f({ lang: "es" }));
    expect(r.direct).toEqual([]);
    expect(r.incomplete).toHaveLength(10);
  });
});

describe("parámetros de la URL", () => {
  const q = (s: string) => seleccionInicial(new URLSearchParams(s));

  test("precarga área, carrera, región y país; la carrera se reconoce sin tildes ni mayúsculas", () => {
    expect(q("area=emp&carrera=economia&region=uy&pais=URUGUAY")).toEqual({ area: "emp", career: "Economía", region: "uy", country: "Uruguay", riasec: [] });
    expect(q("area=eu&carrera=Economía").area).toBe("tec");
  });

  test("ignora valores que no existen", () => {
    expect(q("area=xx&carrera=Medicina&region=marte&riasec=Z")).toEqual({ area: "tec", career: null, region: "uy", country: null, riasec: [] });
    expect(q("area=emp&carrera=Ingeniería en Computación").career).toBeNull();
  });

  test("riasec solo acepta las seis letras y no elige el área por la persona", () => {
    const r = q("riasec=e, s,x,E");
    expect(r.riasec).toEqual(["E", "S"]);
    expect(r.area).toBe("tec");
  });

  test("urlDe vuelve a armar la misma selección", () => {
    const sel: Seleccion = { area: "per", career: "Trabajo social", region: "uy", country: "Uruguay" };
    const url = urlDe(sel, ["S"]);
    const back = q(url.split("?")[1]);
    expect(back).toEqual({ ...sel, riasec: ["S"] });
  });
});
