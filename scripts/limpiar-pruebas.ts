/**
 * LIMPIA las pruebas manuales, de la base y de las hojas.
 *
 *   npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts                    (simulacro)
 *   npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts --aplicar          (solo base)
 *   npx tsx --env-file=.env.local scripts/limpiar-pruebas.ts --aplicar --hojas  (base y hojas)
 *
 * Cómo distingue una prueba de un dato real: todo lo importado del gestor
 * antiguo lleva `sheet_sync = "hoja"` y las horas además `origen = "hoja"`. Lo
 * que se captura desde la aplicación nace con `origen = "app"`. Solo eso se
 * borra, y solo lo creado a partir de la FECHA DE CORTE.
 *
 * En las hojas se borran las filas por debajo de la marca de agua: las que
 * había antes de empezar. Esos números están en docs/PRUEBAS.md y se pueden
 * ajustar abajo si se hicieron pruebas en varias tandas.
 */

import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";

const APLICAR = process.argv.includes("--aplicar");
const HOJAS = process.argv.includes("--hojas");

/**
 * Desde cuándo se considera prueba.
 *
 * Por omisión, hoy a medianoche: lo capturado durante la sesión de pruebas. Se
 * puede pasar otra con `--desde=2026-08-24`.
 */
const argDesde = process.argv.find((a) => a.startsWith("--desde="))?.split("=")[1];
const DESDE = argDesde
  ? new Date(`${argDesde}T00:00:00.000Z`)
  : (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })();

/**
 * Filas que tenía cada hoja ANTES de las pruebas. Ver docs/PRUEBAS.md.
 *
 * Ya NO se borra por esta marca: solo sirve para informar de cuánto creció
 * cada hoja. El Digital Core sigue en uso y lo nuevo casi nunca es de las
 * pruebas — el 25/8/2026, `BDD ACTIVIDAD V02` tenía 57 filas de más y las 57
 * eran horas reales de compañeros. Borrar "todo lo que hay por debajo" las
 * habría destruido.
 *
 * Lo que se borra se identifica por QUIÉN y CUÁNDO. Ver `limpiarPorIdentidad`.
 */
const MARCA_DE_AGUA = {
  actividad: 1327,
  permisos: 1113,
  mantenimiento: 14,
} as const;

/**
 * Cómo debe quedar la base al terminar las pruebas.
 *
 * Cambia cada vez que se trae lo nuevo de las hojas (`ingesta-hojas.ts`), así
 * que se ajusta aquí en lugar de repetirlo suelto por el archivo: con el
 * número viejo, el script avisaría de un descuadre que no existe y se
 * aprendería a ignorar el aviso.
 */
const BASE = {
  horas: 9410,
  ausencias: 442,
  tickets: 10,
  saldos: 119,
} as const;

const BDD = "18FrU-jbGkK-c0CeV7_xA0GLGKZS4pOeDLBS1K4XeTV4";
const LIBRO_CHECK_HO = "1kESIhWsCT9NfFzk_yiSq_Mac8M7CyPl2QQWAOwAsH_w";

const URL = process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL;
if (!URL) {
  console.error("Falta la cadena de conexión. Revisa .env.local");
  process.exit(1);
}
const db = new PrismaClient({ datasources: { db: { url: URL } } });

function sheets() {
  const c = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  c.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.sheets({ version: "v4", auth: c });
}

/**
 * Informa de cuánto creció una hoja. NO borra nada.
 *
 * Lo que hay de más casi nunca es de las pruebas: el Digital Core sigue en
 * uso y esas filas son trabajo real de otras personas.
 */
async function informarHoja(libro: string, hoja: string, marca: number) {
  const s = sheets();
  const actual =
    (
      await s.spreadsheets.values.get({
        spreadsheetId: libro,
        range: `${hoja}!A:A`,
      })
    ).data.values?.length ?? 0;

  const dif = actual - marca;
  console.log(
    `    ${hoja.padEnd(22)} ${actual} filas` +
      (dif > 0 ? ` · ${dif} más que la marca (${marca})` : " · sin cambios"),
  );
}

/**
 * Borra de una hoja SOLO las filas de quien hizo las pruebas, y solo del día
 * de la prueba en adelante.
 *
 * `columnaNombre` y `columnaFecha` son índices base 0: cambian de hoja a hoja.
 *
 * La comparación es por nombre EXACTO —el corto, el que la hoja usa— y por
 * día. Cualquier fila de otra persona, o de otro día, se queda donde está.
 */
async function limpiarPorIdentidad(opciones: {
  libro: string;
  hoja: string;
  columnaNombre: number;
  columnaFecha: number;
  /** Las parejas "NOMBRE|D/M/AAAA" que sí son de la prueba. */
  claves: Set<string>;
}) {
  const { libro, hoja, columnaNombre, columnaFecha, claves } = opciones;
  const s = sheets();

  if (claves.size === 0) {
    console.log(`    ${hoja.padEnd(22)} sin filas de prueba`);
    return;
  }

  const r = await s.spreadsheets.values.get({
    spreadsheetId: libro,
    range: `${hoja}!A:L`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const filas = r.data.values ?? [];

  const aBorrar: number[] = [];
  filas.forEach((f, i) => {
    const nombre = String(f[columnaNombre] ?? "").trim().toUpperCase();
    const fecha = normalizarDia(String(f[columnaFecha] ?? ""));
    if (nombre && fecha && claves.has(`${nombre}|${fecha}`)) aBorrar.push(i);
  });

  console.log(
    `    ${hoja.padEnd(22)} ${filas.length} filas · ${aBorrar.length} de prueba`,
  );
  aBorrar.forEach((i) =>
    console.log(`      ${JSON.stringify((filas[i] ?? []).slice(0, 5))}`),
  );

  if (!APLICAR || aBorrar.length === 0) return;

  const libroInfo = await s.spreadsheets.get({ spreadsheetId: libro });
  const props = libroInfo.data.sheets?.find(
    (h) => h.properties?.title === hoja,
  )?.properties;
  if (props?.sheetId === undefined || props.sheetId === null) return;

  // De abajo hacia arriba: borrar de arriba correría los índices de abajo.
  for (const i of [...aBorrar].sort((a, b) => b - a)) {
    await s.spreadsheets.batchUpdate({
      spreadsheetId: libro,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: props.sheetId,
                dimension: "ROWS",
                startIndex: i,
                endIndex: i + 1,
              },
            },
          },
        ],
      },
    });
  }
  console.log(`      [32m✓[0m borradas ${aBorrar.length}`);
}

/** Un día de la hoja como D/M/AAAA, venga como venga escrito. */
function normalizarDia(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${Number(m[1])}/${Number(m[2])}/${m[3]}` : null;
}

/** El día de una fecha guardada a mediodía UTC, como D/M/AAAA. */
function diaDeFecha(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("-");
  return `${Number(p[2])}/${Number(p[1])}/${p[0]}`;
}

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Limpiar las pruebas manuales                │");
  console.log("╰──────────────────────────────────────────────╯");
  console.log(`  Modo:  ${APLICAR ? "\x1b[31mAPLICAR (borra)\x1b[0m" : "simulacro"}`);
  console.log(`  Desde: ${DESDE.toISOString().slice(0, 10)}`);
  console.log(`  Hojas: ${HOJAS ? "sí" : "no (solo la base)"}\n`);

  /*
   * QUIÉN y CUÁNDO, recogido ANTES de borrar nada.
   *
   * Es lo que identifica una fila de prueba en las hojas. Si se leyera después
   * del borrado ya no habría con qué compararlas, y la única alternativa sería
   * borrar por posición: justo lo que destruiría el trabajo de los demás.
   */
  const nombreHoja = (p: { nombre: string; nombreUsuario: string | null }) =>
    (p.nombreUsuario?.trim() || p.nombre).toUpperCase();

  const [horasPrueba, ausPrueba, checPrueba] = await Promise.all([
    db.hora.findMany({
      where: { origen: "app", creadoEn: { gte: DESDE } },
      select: {
        fecha: true,
        persona: { select: { nombre: true, nombreUsuario: true } },
      },
    }),
    db.ausencia.findMany({
      where: { sheetSync: { not: "hoja" }, creadoEn: { gte: DESDE } },
      select: {
        tipo: true,
        personaId: true,
        fechaInicio: true,
        fechaFin: true,
        persona: { select: { nombre: true, nombreUsuario: true } },
      },
    }),
    db.checada.findMany({
      where: { creadoEn: { gte: DESDE } },
      select: {
        fecha: true,
        persona: { select: { nombre: true, nombreUsuario: true } },
      },
    }),
  ]);

  const claves = {
    actividad: new Set<string>(),
    permisos: new Set<string>(),
    checadas: new Set<string>(),
  };

  for (const h of horasPrueba) {
    claves.actividad.add(`${nombreHoja(h.persona)}|${diaDeFecha(h.fecha)}`);
  }
  for (const c of checPrueba) {
    claves.checadas.add(`${nombreHoja(c.persona)}|${diaDeFecha(c.fecha)}`);
  }
  for (const a of ausPrueba) {
    // Una ausencia ocupa una fila POR DÍA en las hojas: hay que cubrir todo
    // el rango, no solo el primer día.
    const d = new Date(a.fechaInicio);
    while (d <= a.fechaFin) {
      const clave = `${nombreHoja(a.persona)}|${diaDeFecha(d)}`;
      claves.permisos.add(clave);
      // Las aprobadas también bajan a la hoja de actividad.
      claves.actividad.add(clave);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  // ── La base ──────────────────────────────────────────────────────────────
  // Todo lo capturado desde la aplicación a partir del corte. Lo importado
  // lleva origen/sheet_sync "hoja" y no se toca.
  const [horas, ausencias, tickets, checadas, eventos] = await Promise.all([
    db.hora.count({ where: { origen: "app", creadoEn: { gte: DESDE } } }),
    db.ausencia.count({
      where: { sheetSync: { not: "hoja" }, creadoEn: { gte: DESDE } },
    }),
    db.ticket.count({
      where: { sheetSync: { not: "hoja" }, creadoEn: { gte: DESDE } },
    }),
    db.checada.count({ where: { creadoEn: { gte: DESDE } } }),
    db.ticketEvento.count({
      where: { ticket: { sheetSync: { not: "hoja" } }, creadoEn: { gte: DESDE } },
    }),
  ]);

  console.log("  \x1b[1mBase de datos\x1b[0m");
  console.log(`    horas capturadas aquí ....... ${horas}`);
  console.log(`    ausencias ................... ${ausencias}`);
  console.log(`    tickets ..................... ${tickets}`);
  console.log(`    entradas de bitácora ........ ${eventos}`);
  console.log(`    checadas .................... ${checadas}`);

  const total = horas + ausencias + tickets + checadas;
  if (total === 0) {
    console.log("    (nada que borrar)");
  } else if (APLICAR) {
    // Los eventos se van solos con su ticket (cascada).
    await db.hora.deleteMany({
      where: { origen: "app", creadoEn: { gte: DESDE } },
    });
    /*
     * DEVOLVER los días antes de borrar.
     *
     * Aprobar unas vacaciones descuenta del bloque de saldo. Si la ausencia de
     * prueba se borra sin más, ese descuento se queda: la persona acaba la
     * sesión de pruebas con menos días de los que tenía, y nada lo delata
     * porque las cifras de control no miran el saldo.
     *
     * Se devuelve lo mismo que se tomó: un día hábil por cada día de la
     * ausencia, empezando por el bloque que MENOS vence — el orden inverso al
     * del consumo, para dejar cada bloque como estaba.
     */
    const vacacionesPrueba = ausPrueba.filter((a) =>
      /vacacion/i.test(a.tipo),
    );

    for (const a of vacacionesPrueba) {
      let porDevolver = 0;
      const d = new Date(a.fechaInicio);
      while (d <= a.fechaFin) {
        const dia = d.getUTCDay();
        if (dia !== 0 && dia !== 6) porDevolver++;
        d.setUTCDate(d.getUTCDate() + 1);
      }
      if (porDevolver === 0) continue;

      const bloques = await db.saldoVacaciones.findMany({
        where: { personaId: a.personaId, usados: { gt: 0 } },
        orderBy: [{ venceEn: "desc" }, { periodo: "desc" }],
      });

      for (const b of bloques) {
        if (porDevolver <= 0) break;
        const suelta = Math.min(Number(b.usados), porDevolver);
        await db.saldoVacaciones.update({
          where: { id: b.id },
          data: { usados: { decrement: suelta } },
        });
        porDevolver -= suelta;
        console.log(
          `    \x1b[32m✓\x1b[0m devueltos ${suelta} día(s) al periodo ${b.periodo}`,
        );
      }
    }

    await db.ausencia.deleteMany({
      where: { sheetSync: { not: "hoja" }, creadoEn: { gte: DESDE } },
    });
    await db.ticket.deleteMany({
      where: { sheetSync: { not: "hoja" }, creadoEn: { gte: DESDE } },
    });
    await db.checada.deleteMany({ where: { creadoEn: { gte: DESDE } } });
    console.log(`    \x1b[32m✓\x1b[0m borradas ${total} filas`);
  }

  // ── Las hojas ────────────────────────────────────────────────────────────
  if (HOJAS) {
    console.log("\n  \x1b[1mHojas de cálculo\x1b[0m");
    // Cuánto creció cada una. Informativo: lo de más suele ser trabajo real
    // de otras personas, no de las pruebas.
    await informarHoja(BDD, "BDD ACTIVIDAD V02", MARCA_DE_AGUA.actividad);
    await informarHoja(BDD, "BDD PERMISOS", MARCA_DE_AGUA.permisos);
    await informarHoja(BDD, "BDD MANTENIMIENTO", MARCA_DE_AGUA.mantenimiento);

    console.log("\n  \x1b[1mFilas de prueba a quitar\x1b[0m");
    await limpiarPorIdentidad({
      libro: BDD,
      hoja: "BDD ACTIVIDAD V02",
      // A: fecha · B: colaborador
      columnaNombre: 1,
      columnaFecha: 0,
      claves: claves.actividad,
    });
    await limpiarPorIdentidad({
      libro: BDD,
      hoja: "BDD PERMISOS",
      // A: solicitante · C: fecha
      columnaNombre: 0,
      columnaFecha: 2,
      claves: claves.permisos,
    });
    await limpiarPorIdentidad({
      libro: LIBRO_CHECK_HO,
      hoja: "CHECK HO",
      // B: nombre · C: fecha
      columnaNombre: 1,
      columnaFecha: 2,
      claves: claves.checadas,
    });
    console.log(
      "    \x1b[33m!\x1b[0m BDD MANTENIMIENTO no lleva fecha por fila: si levantaste\n" +
        "      un ticket de prueba, quita su renglón a mano.",
    );
  } else {
    console.log(
      "\n  \x1b[33m!\x1b[0m Las hojas NO se tocan. Añade --hojas para limpiarlas también.",
    );
  }

  // ── Cómo queda ───────────────────────────────────────────────────────────
  const [h, a, t, c, s] = await Promise.all([
    db.hora.count(),
    db.ausencia.count(),
    db.ticket.count(),
    db.checada.count(),
    db.saldoVacaciones.count(),
  ]);

  console.log("\n  \x1b[1mEstado de la base\x1b[0m");
  console.log(`    horas ${h} · ausencias ${a} · tickets ${t} · checadas ${c} · saldos ${s}`);
  console.log(`    esperado: ${BASE.horas} · ${BASE.ausencias} · ${BASE.tickets} · 0 · ${BASE.saldos}`);

  const cuadra =
    h === BASE.horas && a === BASE.ausencias && t === BASE.tickets &&
    c === 0 && s === BASE.saldos;
  if (!APLICAR) {
    console.log("\n  \x1b[33m!\x1b[0m SIMULACRO: no se borró nada.\n");
  } else if (cuadra) {
    console.log("\n  \x1b[32m✓\x1b[0m Todo volvió a su sitio.\n");
  } else {
    console.log(
      "\n  \x1b[33m!\x1b[0m Las cifras no coinciden con la referencia. Revisa antes de desplegar.\n",
    );
  }
}

main()
  .catch((e) => {
    console.error("\n  \x1b[31m✗\x1b[0m", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
