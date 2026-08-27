/**
 * INGESTA desde las hojas del gestor antiguo.
 *
 *   npx tsx scripts/ingesta-hojas.ts [--produccion] [--aplicar] [--solo=horas]
 *
 * Por omisión hace un SIMULACRO contra la base local: lee las hojas, resuelve
 * todo contra `core` y dice exactamente qué haría, sin escribir nada. Para
 * escribir de verdad hay que pasar `--aplicar`, y para hacerlo en producción,
 * además `--produccion`.
 *
 * Reglas que respeta, en orden de importancia:
 *
 *  · NO INVENTA PERSONAS NI PROYECTOS. Si un nombre de la hoja no está en
 *    `core.persona` o `core.proyecto`, la fila se reporta como no enlazable y
 *    se queda fuera. El padrón es de `core` y esta herramienta no lo escribe.
 *
 *  · NO BORRA NADA. Solo inserta lo que falta y actualiza lo que cambió. Una
 *    fila que desaparezca de la hoja se queda en la base.
 *
 *  · Solo toca el schema `actividad`. `deal`, `hub`, `eval`, `grid` y `public`
 *    no se leen ni se escriben.
 *
 *  · Es IDEMPOTENTE: correrlo dos veces seguidas deja la base igual. La clave
 *    de cada fila se deriva de su contenido (ver `claveDeHora`), así que una
 *    fila ya importada se reconoce aunque la hoja no tenga identificadores.
 */

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  BDD_MAESTRA,
  HOJAS,
  aDia,
  aNumero,
  aTexto,
  leerRango,
  primerValor,
} from "../src/lib/google/hojas";

// ─── Argumentos ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const PRODUCCION = args.includes("--produccion");
const SOLO = args.find((a) => a.startsWith("--solo="))?.split("=")[1] ?? "todo";

const URL = PRODUCCION
  ? process.env.DATABASE_URL_PRODUCCION
  : (process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL);

if (!URL) {
  console.error("Falta la cadena de conexión. Revisa .env.local");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url: URL } } });

// ─── Utilidades de salida ────────────────────────────────────────────────────

const t = {
  titulo: (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`),
  ok: (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`),
  aviso: (s: string) => console.log(`  \x1b[33m!\x1b[0m ${s}`),
  error: (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`),
  dato: (s: string) => console.log(`    ${s}`),
};

/**
 * La clave estable de una fila de la hoja.
 *
 * Las hojas no tienen identificador propio, así que se deriva del contenido que
 * la hace única: quién, cuándo, en qué y cuánto. Si la fila ya se importó, el
 * hash coincide y no se duplica. Es lo que permite volver a correr la ingesta
 * cada vez que la hoja cambie sin acumular copias.
 */
function claveDeHora(campos: {
  personaId: string;
  dia: string;
  proyecto: string;
  entregable: string;
  tipo: string;
  horas: number;
  comentario: string;
}): string {
  const semilla = [
    campos.personaId,
    campos.dia,
    campos.proyecto,
    campos.entregable,
    campos.tipo,
    campos.horas.toFixed(2),
    campos.comentario,
  ].join("|");

  return "hoja-" + createHash("sha1").update(semilla).digest("hex").slice(0, 24);
}

// ─── Padrón (se lee de core, no se escribe) ──────────────────────────────────

interface Padron {
  personaPorNombre: Map<string, string>;
  proyectoPorNombre: Map<string, string>;
  proyectoPorCodigo: Set<string>;
  entregablePorClave: Map<string, string>;
  jornadaPorPersona: Map<string, number>;
}

/**
 * Normaliza un nombre para poder compararlo.
 *
 * Las hojas y el padrón no escriben igual a la misma persona: conviven
 * "LIZETTE RODRÍGUEZ" y "LIZETTE RODRIGUEZ", "LUIS TERÁN" y "LUIS TERAN",
 * "RAMÓN INZUNZA" y "RAMON INZUNZA". Sin quitar los acentos, miles de filas
 * quedarían huérfanas por una tilde.
 *
 * El escape ̀-ͯ es el bloque de marcas diacríticas que deja NFD al
 * separar cada letra acentuada en letra + acento.
 */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function cargarPadron(): Promise<Padron> {
  const [personas, proyectos, entregables] = await Promise.all([
    db.persona.findMany({
      select: { id: true, nombre: true, nombreUsuario: true, horasDia: true },
    }),
    db.proyecto.findMany({ select: { codigo: true, nombre: true } }),
    db.entregable.findMany({
      select: { id: true, nombre: true, proyectoCodigo: true },
    }),
  ]);

  const personaPorNombre = new Map<string, string>();
  const jornadaPorPersona = new Map<string, number>();

  for (const p of personas) {
    jornadaPorPersona.set(p.id, Number(p.horasDia));

    // Se indexa por las dos formas: la hoja escribe el nombre corto
    // ("ADOLFO HERNANDEZ") y el padrón guarda el completo
    // ("ADOLFO HERNANDEZ RODRIGUEZ"). Ambas deben llevar a la misma persona.
    personaPorNombre.set(normalizar(p.nombre), p.id);
    if (p.nombreUsuario) {
      personaPorNombre.set(normalizar(p.nombreUsuario), p.id);
    }

    // Y por "nombre de pila + primer apellido", que es como escribe la hoja
    // cuando el padrón tiene los dos apellidos. Solo se registra si no hay ya
    // otra persona en esa clave: ante dos "JUAN PEREZ" es mejor no adivinar y
    // dejar que la fila salga en el informe de no enlazadas.
    const partes = normalizar(p.nombre).split(" ");
    if (partes.length >= 3) {
      const corto = `${partes[0]} ${partes[1]}`;
      const previo = personaPorNombre.get(corto);
      if (previo === undefined) personaPorNombre.set(corto, p.id);
      else if (previo !== p.id) personaPorNombre.set(corto, "AMBIGUO");
    }
  }

  // Las claves ambiguas se retiran: es preferible reportar la fila como no
  // enlazable a asignarle horas a la persona equivocada.
  for (const [clave, valor] of personaPorNombre) {
    if (valor === "AMBIGUO") personaPorNombre.delete(clave);
  }

  const proyectoPorNombre = new Map<string, string>();
  const proyectoPorCodigo = new Set<string>();
  for (const p of proyectos) {
    proyectoPorNombre.set(normalizar(p.nombre), p.codigo);
    proyectoPorCodigo.add(p.codigo);
  }

  const entregablePorClave = new Map<string, string>();
  for (const e of entregables) {
    entregablePorClave.set(`${e.proyectoCodigo}|${normalizar(e.nombre)}`, e.id);
  }

  return {
    personaPorNombre,
    proyectoPorNombre,
    proyectoPorCodigo,
    entregablePorClave,
    jornadaPorPersona,
  };
}

/// Resuelve el proyecto: primero por código (por si la hoja ya lo trae), luego
/// por nombre. Devuelve null si no está en el padrón.
function resolverProyecto(padron: Padron, valor: string): string | null {
  const limpio = valor.trim();
  if (padron.proyectoPorCodigo.has(limpio)) return limpio;
  return padron.proyectoPorNombre.get(normalizar(limpio)) ?? null;
}

// ─── Ingesta de HORAS (BDD ACTIVIDAD V02) ────────────────────────────────────

interface Rechazo {
  fila: number;
  motivo: string;
  detalle: string;
}

async function ingestarHoras(padron: Padron) {
  t.titulo("BDD ACTIVIDAD V02 → actividad.hora");

  const filas = await leerRango(BDD_MAESTRA, `${HOJAS.actividad}!A2:L`);
  t.dato(`${filas.length} filas leídas de la hoja`);

  const aInsertar: Array<{
    id: string;
    personaId: string;
    proyectoCodigo: string | null;
    proyectoTexto: string | null;
    entregableId: string | null;
    entregableTexto: string | null;
    fecha: Date;
    horas: number;
    disciplina: string | null;
    tipo: string | null;
    esfuerzo: string | null;
    comentario: string | null;
    pago: string | null;
    categoria: string;
    origen: string;
    sheetSync: string;
  }> = [];

  const rechazos: Rechazo[] = [];
  const personasDesconocidas = new Map<string, number>();
  const proyectosDesconocidos = new Map<string, number>();

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const numeroFila = i + 2; // la hoja empieza en A2

    const dia = aDia(f[0]);
    const colaborador = aTexto(f[1]);
    const horas = aNumero(f[2]);
    const proyecto = aTexto(f[3]);

    // Filas vacías al final de la hoja: se saltan sin ruido.
    if (!dia && !colaborador && !horas) continue;

    if (!dia || !colaborador || horas === null || horas <= 0) {
      rechazos.push({
        fila: numeroFila,
        motivo: "incompleta",
        detalle: `fecha=${dia ?? "—"} persona=${colaborador ?? "—"} horas=${horas ?? "—"}`,
      });
      continue;
    }

    const personaId = padron.personaPorNombre.get(normalizar(colaborador));
    if (!personaId) {
      personasDesconocidas.set(
        colaborador,
        (personasDesconocidas.get(colaborador) ?? 0) + 1,
      );
      rechazos.push({
        fila: numeroFila,
        motivo: "persona fuera del padrón",
        detalle: colaborador,
      });
      continue;
    }

    // El tipo de envío. En el histórico antiguo la columna está vacía, así que
    // se deduce: si el proyecto es AUSENCIAS, la fila es una ausencia; si no,
    // trabajo normal. Es la misma regla que aplicaba la hoja al escribirla.
    const envioCrudo = (aTexto(f[9]) ?? "").toUpperCase();
    const envio =
      envioCrudo ||
      (normalizar(proyecto ?? "") === "AUSENCIAS" ? "AUSENCIA" : "NORMAL");

    // La columna K cambia de significado según el envío por un fallo del script
    // antiguo (ver docs/MAPA-HOJAS.md): en las filas EXTRA guarda el esfuerzo,
    // en las demás el esfuerzo está en L. Se cubren los dos casos.
    const esfuerzo =
      envio === "EXTRA" ? primerValor(f[10]) : primerValor(f[11]);

    const codigoProyecto = proyecto ? resolverProyecto(padron, proyecto) : null;
    if (proyecto && !codigoProyecto) {
      proyectosDesconocidos.set(
        proyecto,
        (proyectosDesconocidos.get(proyecto) ?? 0) + 1,
      );
    }

    const entregable = aTexto(f[4]);
    const entregableId =
      codigoProyecto && entregable
        ? (padron.entregablePorClave.get(
            `${codigoProyecto}|${normalizar(entregable)}`,
          ) ?? null)
        : null;

    const tipo = aTexto(f[6]);
    const comentario = aTexto(f[7]);

    aInsertar.push({
      id: claveDeHora({
        personaId,
        dia,
        proyecto: codigoProyecto ?? proyecto ?? "",
        entregable: entregable ?? "",
        tipo: tipo ?? "",
        horas,
        comentario: comentario ?? "",
      }),
      personaId,
      proyectoCodigo: codigoProyecto,
      // Si el proyecto no está en el padrón se conserva el nombre original para
      // no perder el dato ni romper la clave foránea.
      proyectoTexto: codigoProyecto ? null : proyecto,
      entregableId,
      // El nombre siempre, aunque no haya enlace: es lo que el radar cruza
      // contra las horas cotizadas, que se guardan por nombre de entregable.
      entregableTexto: entregable,
      fecha: new Date(`${dia}T12:00:00.000Z`),
      horas,
      disciplina: aTexto(f[5]),
      tipo,
      esfuerzo,
      comentario,
      pago: aTexto(f[8]),
      // El envío ya calculado arriba. Sin guardarlo, el tablero no puede
      // distinguir una hora extra de una normal.
      categoria: envio,
      origen: "hoja",
      /*
       * "hoja": vino de ahí, NO hay que devolverla.
       *
       * Sin esto quedaba en "pendiente", que es la marca de "falta subirla":
       * la cola creía que debía escribir en la hoja las filas que acababa de
       * leer de esa misma hoja. Hoy no pasaba nada porque el sincronizador
       * filtra además por `origen`, pero es la misma trampa que llenó
       * `BDD PERMISOS` de 680 renglones repetidos.
       */
      sheetSync: "hoja",
    });
  }

  t.ok(`${aInsertar.length} filas listas para importar`);

  if (rechazos.length > 0) {
    t.aviso(`${rechazos.length} filas NO se pueden importar`);
  }

  if (personasDesconocidas.size > 0) {
    t.aviso(`${personasDesconocidas.size} personas de la hoja no están en core.persona:`);
    for (const [nombre, veces] of [...personasDesconocidas].sort((a, b) => b[1] - a[1])) {
      t.dato(`· ${nombre} — ${veces} fila(s)`);
    }
  }

  if (proyectosDesconocidos.size > 0) {
    t.aviso(
      `${proyectosDesconocidos.size} proyectos no están en core.proyecto ` +
        `(se guardan con el nombre en proyecto_texto):`,
    );
    for (const [nombre, veces] of [...proyectosDesconocidos]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)) {
      t.dato(`· ${nombre} — ${veces} fila(s)`);
    }
  }

  /*
   * Cuáles de esas ya están. Se mira por DOS caminos, y hacen falta los dos.
   *
   * Por id (`hoja-<hash>` del contenido) reconoce lo que importó este mismo
   * script otras veces.
   *
   * Por CONTENIDO —día, persona, horas, proyecto— reconoce las 9 236 filas que
   * trajo la migración anterior, que llevan `cuid` y por id no coinciden con
   * nada. Sin esta segunda pasada, volver a correr la ingesta insertaba otra
   * vez todo lo que ya había: 1 233 filas duplicadas en la primera pasada.
   *
   * La comparación cuenta REPETIDOS a propósito: una persona puede reportar
   * dos veces las mismas horas en el mismo proyecto el mismo día, y esas dos
   * filas son legítimas. Por eso se lleva un contador y no un simple conjunto.
   */
  const porId = await db.hora.findMany({
    where: { id: { in: aInsertar.map((h) => h.id) } },
    select: { id: true },
  });
  const idsConocidos = new Set(porId.map((h) => h.id));

  const dias = [...new Set(aInsertar.map((h) => h.fecha.toISOString().slice(0, 10)))];
  const existentes = await db.hora.findMany({
    where: {
      fecha: {
        gte: new Date(`${dias.reduce((a, b) => (a < b ? a : b))}T00:00:00.000Z`),
        lte: new Date(`${dias.reduce((a, b) => (a > b ? a : b))}T23:59:59.999Z`),
      },
    },
    select: {
      personaId: true,
      fecha: true,
      horas: true,
      proyectoCodigo: true,
      proyectoTexto: true,
      comentario: true,
      tipo: true,
      entregableTexto: true,
    },
  });

  /*
   * La huella lleva TAMBIÉN el comentario, el tipo y el entregable.
   *
   * Sin ellos, media hora de Carlos el día 20 parecía la misma fila ocho
   * veces: reporta varios ratos cortos al día en el mismo proyecto, y solo el
   * comentario los distingue. Con la huella corta, siete se daban por
   * conocidas y se perdían; con esta, cada una se reconoce por separado.
   */
  const huella = (f: {
    personaId: string;
    fecha: Date;
    horas: unknown;
    proyectoCodigo: string | null;
    proyectoTexto: string | null;
    comentario: string | null;
    tipo: string | null;
    entregableTexto: string | null;
  }) =>
    [
      f.personaId,
      f.fecha.toISOString().slice(0, 10),
      Number(f.horas).toFixed(2),
      (f.proyectoCodigo ?? f.proyectoTexto ?? "").toUpperCase(),
      (f.comentario ?? "").trim(),
      (f.tipo ?? "").trim().toUpperCase(),
      (f.entregableTexto ?? "").trim().toUpperCase(),
    ].join("|");

  const cuenta = new Map<string, number>();
  for (const f of existentes) {
    const k = huella(f);
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }

  const nuevas: typeof aInsertar = [];
  let conocidas = 0;

  for (const h of aInsertar) {
    if (idsConocidos.has(h.id)) {
      conocidas++;
      continue;
    }
    const k = huella(h);
    const quedan = cuenta.get(k) ?? 0;
    if (quedan > 0) {
      cuenta.set(k, quedan - 1);
      conocidas++;
      continue;
    }
    nuevas.push(h);
  }

  t.dato(`${conocidas} ya estaban en la base · ${nuevas.length} son nuevas`);

  if (!APLICAR) {
    t.aviso("SIMULACRO: no se escribió nada. Añade --aplicar para hacerlo.");
    return { nuevas: nuevas.length, rechazos: rechazos.length };
  }

  if (nuevas.length > 0) {
    // En lotes: un createMany con miles de filas satura el mensaje de Postgres.
    const LOTE = 500;
    for (let i = 0; i < nuevas.length; i += LOTE) {
      await db.hora.createMany({
        data: nuevas.slice(i, i + LOTE),
        skipDuplicates: true,
      });
      t.dato(`insertadas ${Math.min(i + LOTE, nuevas.length)}/${nuevas.length}`);
    }
    t.ok(`${nuevas.length} horas importadas`);
  } else {
    t.ok("No hay horas nuevas que importar");
  }

  return { nuevas: nuevas.length, rechazos: rechazos.length };
}

// ─── Ingesta de AUSENCIAS (BDD PERMISOS) ─────────────────────────────────────

/**
 * Las ausencias vienen con UNA FILA POR DÍA. Aquí se vuelven a agrupar en una
 * sola ausencia con rango, que es como las modela la base.
 *
 * Se agrupan los días consecutivos (saltando fines de semana) de la misma
 * persona, mismo tipo y mismo motivo.
 */
async function ingestarAusencias(padron: Padron) {
  t.titulo("BDD PERMISOS → actividad.ausencia");

  const filas = await leerRango(BDD_MAESTRA, `${HOJAS.permisos}!A2:I`);
  t.dato(`${filas.length} filas leídas de la hoja`);

  interface DiaSuelto {
    personaId: string;
    dia: string;
    tipo: string;
    horas: number | null;
    motivo: string | null;
    aprobada: boolean;
    periodo: number | null;
  }

  const dias: DiaSuelto[] = [];
  const desconocidas = new Map<string, number>();
  let sinFecha = 0;
  let sinTipo = 0;
  let horasRotas = 0;

  for (const f of filas) {
    const solicitante = aTexto(f[0]);
    const tipo = aTexto(f[1]);

    // Filas de relleno al final de la hoja: se saltan sin contarlas como error.
    if (!solicitante && !tipo) continue;

    // Un permiso sin fecha no significa nada: no se puede saber qué día se
    // ausentó nadie, ni descontarlo de un saldo.
    const dia = aDia(f[2]);
    if (!dia) {
      sinFecha++;
      continue;
    }
    if (!tipo) {
      sinTipo++;
      continue;
    }
    if (!solicitante) continue;

    const personaId = padron.personaPorNombre.get(normalizar(solicitante));
    if (!personaId) {
      desconocidas.set(solicitante, (desconocidas.get(solicitante) ?? 0) + 1);
      continue;
    }

    /*
     * Las horas vienen sucias: hay celdas con `#¡REF!` de una fórmula rota, y
     * otras con "N/A" o 0. Un permiso de cero horas no existe, así que en esos
     * casos se toma la jornada de la persona: es lo que significa un permiso
     * sin horas marcadas —el día completo—, y es como lo trataba la hoja.
     */
    const horasCrudas = aNumero(f[3]);
    const jornada = padron.jornadaPorPersona.get(personaId) ?? 8;
    if (horasCrudas === null || horasCrudas <= 0) horasRotas++;
    const horas = horasCrudas !== null && horasCrudas > 0 ? horasCrudas : jornada;

    const autorizado = (aTexto(f[5]) ?? "").toUpperCase();

    dias.push({
      personaId,
      dia,
      tipo: tipo.toUpperCase(),
      horas,
      motivo: aTexto(f[4]),
      // La hoja marcaba "PAGADO"/"APROBADO"/"SÍ" según quién lo escribiera.
      // Solo "NO AUTORIZADO" niega; lo demás son formas de decir que sí.
      aprobada:
        /PAGAD|APROBAD|AUTORIZAD|S[IÍ]|TRUE/.test(autorizado) &&
        !/NO AUTORIZAD|RECHAZAD/.test(autorizado),
      periodo: aNumero(f[8]),
    });
  }

  // El detalle de lo que NO entra, para poder decidir qué hacer con ello en
  // vez de que desaparezca en silencio.
  if (sinFecha > 0) t.aviso(`${sinFecha} filas SIN FECHA: no se pueden importar`);
  if (sinTipo > 0) t.aviso(`${sinTipo} filas sin tipo de permiso`);
  if (horasRotas > 0) {
    t.aviso(
      `${horasRotas} filas con horas vacías, cero o con error de fórmula: ` +
        `se toman como día completo`,
    );
  }

  if (desconocidas.size > 0) {
    const total = [...desconocidas.values()].reduce((a, b) => a + b, 0);
    t.aviso(
      `${desconocidas.size} solicitantes fuera de core.persona ` +
        `(${total} filas). Gente que ya no está en el padrón:`,
    );
    for (const [nombre, veces] of [...desconocidas].sort((a, b) => b[1] - a[1])) {
      t.dato(`· ${nombre} — ${veces} fila(s)`);
    }
  }

  // Agrupar días contiguos de la misma persona/tipo/motivo.
  dias.sort(
    (a, b) =>
      a.personaId.localeCompare(b.personaId) ||
      a.tipo.localeCompare(b.tipo) ||
      a.dia.localeCompare(b.dia),
  );

  interface Bloque {
    personaId: string;
    tipo: string;
    inicio: string;
    fin: string;
    horas: number | null;
    motivo: string | null;
    aprobada: boolean;
    periodo: number | null;
  }

  const bloques: Bloque[] = [];

  for (const d of dias) {
    const ultimo = bloques[bloques.length - 1];

    // ¿Continúa el bloque anterior? Mismo quien, mismo qué, y el día siguiente
    // hábil. Se aceptan hasta 3 días de hueco para saltar el fin de semana.
    const continua =
      ultimo &&
      ultimo.personaId === d.personaId &&
      ultimo.tipo === d.tipo &&
      ultimo.motivo === d.motivo &&
      ultimo.aprobada === d.aprobada &&
      diasEntre(ultimo.fin, d.dia) <= 3 &&
      diasEntre(ultimo.fin, d.dia) > 0;

    if (continua) {
      ultimo.fin = d.dia;
    } else {
      bloques.push({
        personaId: d.personaId,
        tipo: d.tipo,
        inicio: d.dia,
        fin: d.dia,
        horas: d.horas,
        motivo: d.motivo,
        aprobada: d.aprobada,
        periodo: d.periodo,
      });
    }
  }

  t.ok(`${dias.length} días agrupados en ${bloques.length} ausencias`);

  const registros = bloques.map((b) => {
    const jornada = padron.jornadaPorPersona.get(b.personaId) ?? 8;
    const esDiaCompleto = b.horas === null || b.horas >= jornada;

    return {
      id:
        "hoja-" +
        createHash("sha1")
          .update([b.personaId, b.tipo, b.inicio, b.fin, b.motivo ?? ""].join("|"))
          .digest("hex")
          .slice(0, 24),
      personaId: b.personaId,
      tipo: b.tipo,
      fechaInicio: new Date(`${b.inicio}T12:00:00.000Z`),
      fechaFin: new Date(`${b.fin}T12:00:00.000Z`),
      medioDia: !esDiaCompleto,
      horas: esDiaCompleto ? null : b.horas,
      motivo: b.motivo,
      estado: b.aprobada ? "APROBADA" : "PENDIENTE",
      periodo: b.periodo === null ? null : Math.round(b.periodo),
      // YA ESTÁN EN LA HOJA: sin esto la sincronización las devolvería y la
      // duplicaría. Es el mismo motivo por el que las horas nacen con "hoja".
      sheetSync: "hoja",
    };
  });

  const yaEstan = await db.ausencia.findMany({
    where: { id: { in: registros.map((r) => r.id) } },
    select: { id: true },
  });
  const conocidas = new Set(yaEstan.map((a) => a.id));
  const nuevas = registros.filter((r) => !conocidas.has(r.id));

  t.dato(`${conocidas.size} ya estaban · ${nuevas.length} son nuevas`);

  if (!APLICAR) {
    t.aviso("SIMULACRO: no se escribió nada.");
    return { nuevas: nuevas.length };
  }

  if (nuevas.length > 0) {
    await db.ausencia.createMany({ data: nuevas, skipDuplicates: true });
    t.ok(`${nuevas.length} ausencias importadas`);
  } else {
    t.ok("No hay ausencias nuevas");
  }

  return { nuevas: nuevas.length };
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T12:00:00.000Z`).getTime();
  const b = new Date(`${hasta}T12:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// ─── Ingesta de TICKETS (BDD MANTENIMIENTO) ──────────────────────────────────

async function ingestarTickets(padron: Padron) {
  t.titulo("BDD MANTENIMIENTO → actividad.ticket");

  const filas = await leerRango(BDD_MAESTRA, `${HOJAS.mantenimiento}!A2:G`);
  t.dato(`${filas.length} filas leídas de la hoja`);

  const registros: Array<{
    id: string;
    personaId: string;
    titulo: string;
    detalle: string | null;
    clase: string | null;
    falla: string | null;
    prioridad: string;
    estado: string;
    equipo: string | null;
    creadoEn: Date;
    sheetSync: string;
  }> = [];

  const desconocidas = new Map<string, number>();

  for (const f of filas) {
    const colaborador = aTexto(f[2]);
    const problema = aTexto(f[4]);
    if (!colaborador || !problema) continue;

    const personaId = padron.personaPorNombre.get(normalizar(colaborador));
    if (!personaId) {
      desconocidas.set(colaborador, (desconocidas.get(colaborador) ?? 0) + 1);
      continue;
    }

    // La columna A es un INSTANTE (fecha y hora del reporte), no un día suelto.
    const dia = aDia(f[0]) ?? "2024-01-01";
    const clase = (aTexto(f[3]) ?? "").toUpperCase();

    // La urgencia de la hoja son las mismas tres de siempre; cualquier otra
    // cosa cae en MEDIA en vez de romper la restricción de la tabla.
    const urgencia = (aTexto(f[6]) ?? "").toUpperCase();
    const prioridad = ["ALTA", "MEDIA", "BAJA"].includes(urgencia)
      ? urgencia
      : "MEDIA";

    registros.push({
      id:
        "hoja-" +
        createHash("sha1")
          .update([personaId, dia, problema].join("|"))
          .digest("hex")
          .slice(0, 24),
      personaId,
      // La hoja separa el PROBLEMA (del catálogo) de su DESCRIPCIÓN. El título
      // es el problema, que es lo que se lee en una lista.
      titulo: problema,
      detalle: aTexto(f[5]),
      clase: clase.includes("HARD") ? "HARDWARE" : "SOFTWARE",
      falla: problema,
      prioridad,
      // El código de la hoja (260611_HARD_26020) es su folio de allá; aquí el
      // folio lo numera la base. Se guarda como equipo para no perderlo: es lo
      // que permite rastrear el ticket en el registro antiguo.
      equipo: aTexto(f[1]),
      // El histórico entra como resuelto: son incidencias ya atendidas, y
      // dejarlas abiertas llenaría la bandeja de trabajo viejo.
      estado: "RESUELTO",
      creadoEn: new Date(`${dia}T12:00:00.000Z`),
      // Ya están en la hoja: devolverlas las duplicaría.
      sheetSync: "hoja",
    });
  }

  if (desconocidas.size > 0) {
    t.aviso(`${desconocidas.size} personas no están en core.persona:`);
    for (const [nombre, veces] of desconocidas) t.dato(`· ${nombre} — ${veces}`);
  }

  const yaEstan = await db.ticket.findMany({
    where: { id: { in: registros.map((r) => r.id) } },
    select: { id: true },
  });
  const conocidos = new Set(yaEstan.map((x) => x.id));
  const nuevos = registros.filter((r) => !conocidos.has(r.id));

  t.ok(`${registros.length} tickets · ${nuevos.length} nuevos`);

  if (!APLICAR) {
    t.aviso("SIMULACRO: no se escribió nada.");
    return { nuevas: nuevos.length };
  }

  if (nuevos.length > 0) {
    await db.ticket.createMany({ data: nuevos, skipDuplicates: true });
    t.ok(`${nuevos.length} tickets importados`);
  }

  return { nuevas: nuevos.length };
}

// ─── Programa ────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Ingesta de las hojas del gestor antiguo      │");
  console.log("╰──────────────────────────────────────────────╯");
  t.dato(`Destino: ${PRODUCCION ? "PRODUCCIÓN (Neon)" : "local"}`);
  t.dato(`Modo:    ${APLICAR ? "APLICAR (escribe)" : "simulacro (no escribe)"}`);

  const padron = await cargarPadron();
  t.titulo("Padrón cargado desde core");
  t.dato(`${padron.jornadaPorPersona.size} personas · ${padron.proyectoPorCodigo.size} proyectos`);

  if (SOLO === "todo" || SOLO === "horas") await ingestarHoras(padron);
  if (SOLO === "todo" || SOLO === "ausencias") await ingestarAusencias(padron);
  if (SOLO === "todo" || SOLO === "tickets") await ingestarTickets(padron);

  console.log("");
}

main()
  .catch((e) => {
    t.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
