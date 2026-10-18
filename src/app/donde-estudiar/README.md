# Dónde estudiar (`/donde-estudiar`)

Etapa 2 de Rumbo: de un área de interés a una carrera, y de la carrera a programas reales de Uruguay con su página oficial. Funciona sola, con un catálogo local: no llama a Gemini ni a la entrevista.

## Abrirla

- Local: `npm run dev` y abrir http://localhost:3000/donde-estudiar
- Con una selección hecha: `/donde-estudiar?area=emp&carrera=Economía&region=uy`

## Qué tiene el catálogo

33 programas de Uruguay (versión 0.3.0, comprobados el 18/10/2026), en `catalogo-uy.json`:

| Área | Carreras | Programas |
|---|---|---|
| Tecnología y datos | Ingeniería en Computación, Ciencia de Datos, Tecnologías de la Información | 9 (Udelar, UTEC, UCU, UM, ORT) |
| Organizar y emprender | Economía, Administración y negocios, Marketing, Contador Público | 10 (Udelar, ORT, UCU, UM, UDE) |
| Enseñar, cuidar y acompañar | Enfermería, Psicología, Trabajo social, Educación | 5 (Udelar, CURE, UCU) |
| Diseño, audio y creación | Música, Comunicación, Contenidos digitales | 4 (UTEC, Udelar, UCU) |
| Hacer con las manos | Mecatrónica y automatización, Energías renovables, Ingeniería civil, Ingeniería mecánica | 5 (UTEC, Udelar) |

No se pudieron verificar: las carreras de Diseño de FADU (el sitio responde 403 a la lectura automática) y la página de carrera de la Facultad de Enfermería (es un índice general; se usó la del CURE).

## Qué está verificado y qué no

- **Verificado:** que cada programa tiene una página oficial de carrera que responde, y cada dato que muestra la ficha, tomado de esa página (o de la fuente que indica `*_fuente`).
- **No verificado:** ninguna ficha está completa. Lo que la página no publica dice «No consta en la fuente» y se lista en «Faltan en la fuente». Ninguna fuente publica el idioma de cursado. Ninguna confirma una beca específica de la carrera ni una inscripción vigente, por eso no se muestran las etiquetas «Beca confirmada» ni «Inscripción vigente».
- La gratuidad de Udelar sale de su sitio institucional («sus carreras de grado son abiertas y gratuitas»), no de cada página de carrera.

## Filtros

Cada filtro responde «sí», «no» o «no consta» según la fuente (`filtros.ts`). Un programa **coincide** solo si todo da «sí». Con algo «no consta» va aparte, en **Con información incompleta**. Con algo «no» queda afuera y se dice por qué.

- **Área y carrera:** los programas que son esa carrera aparecen como coincidencia. Las carreras cercanas aparecen aparte como **Relacionadas**, por criterio de Rumbo.
- **Región y país:** solo Uruguay tiene catálogo. Los demás destinos muestran el estado «sin catálogo» y fuentes oficiales de becas, sin programas uruguayos.
- **Presupuesto:** «Matrícula gratuita» solo con fuente que lo diga. «Gratuita o con beca» no cuenta becas generales de una universidad.
- **Becas:** «Solo con beca confirmada» hoy no deja ninguna coincidencia, porque ninguna beca de carrera está confirmada.
- **Idioma:** como ninguna fuente lo publica, todo queda en información incompleta.
- **Modalidad:** según la fuente. «Semipresencial» cuenta como híbrida. Si la modalidad no se publica, el programa no pasa el filtro.
- Cambiar de región, país o carrera conserva los filtros. Sin coincidencias, la página ofrece quitar el filtro que más recorta.

## Conexión con `/resultado` (pendiente, la hacen Santi o Marto)

La página ya acepta estos parámetros, todos opcionales. Los que no reconoce los ignora (`parametros.ts`):

| Parámetro | Valores | Efecto |
|---|---|---|
| `area` | `tec`, `emp`, `per`, `cre`, `man` | Preselecciona el área |
| `carrera` | Una carrera del área (sin importar tildes ni mayúsculas) | Preselecciona la carrera |
| `region` / `pais` | `uy`, `latam`, `eu`, `us`, `otro` / un país de la región | Preselecciona el destino |
| `riasec` | Letras de Holland separadas por coma, por ejemplo `I,A` | Muestra «Tu devolución destacó…», **sin elegir el área** |

El contrato mínimo para enlazar es un `<Link>` en `/resultado` a `/donde-estudiar?riasec=${p.top.join(",")}`, con las letras que `/resultado` ya tiene en `profile.top`. Así no hace falta ninguna equivalencia: la persona elige el área.

Si el equipo aprueba una equivalencia RIASEC → área, `/resultado` puede mandar también `area`. Esta es la propuesta, a revisar, y ya figura como etiqueta de cada área:

| RIASEC | Área |
|---|---|
| I, C | `tec` |
| E | `emp` |
| S | `per` |
| A | `cre` |
| R | `man` |

El motor no produce carreras, porque en la Parte 1 no se nombran. Por eso `carrera` solo tiene sentido si la elige la persona.

Falta decidir cómo convive esta página con la Parte 2 actual de `/resultado` («Caminos para investigar»).

## Actualizar el catálogo sin perder las fuentes

El catálogo **no se edita a mano**. Se genera fuera del repo, en `~/Documents/Rumbo/catalogo-educativo/`:

1. Agregar o corregir programas en `armar_catalogo_v3.py`, siempre a partir de la página oficial de la carrera.
2. Correr `python3 armar_catalogo_v3.py`. Regenera `catalogo-uy.json` y `.csv` y vuelve a comprobar cada enlace (`enlace_verificado`).
3. Guardar la página leída en `fuentes-html/`. `FUENTES.md` lista todas las URLs.
4. Copiar `catalogo-uy.json` a esta carpeta y, por cada programa nuevo, agregar su entrada en `ATRIBUTOS` (`catalogo.ts`): carrera, gratuidad y modalidades. Si falta, el build falla a propósito.
5. Correr `npm test` (`tests/donde-estudiar.test.ts`).

Las versiones anteriores del catálogo quedan como `catalogo-uy-v0.2-respaldo.json` y `.csv`.
