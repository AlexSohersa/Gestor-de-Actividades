/**
 * RECUPERA el número real de cada ticket, el de `BDD MANTENIMIENTO`.
 *
 *   npx tsx --env-file=.env.local scripts/recuperar-folios-tickets.ts             (simulacro)
 *   npx tsx --env-file=.env.local scripts/recuperar-folios-tickets.ts --aplicar
 *   npx tsx --env-file=.env.local scripts/recuperar-folios-tickets.ts --produccion --aplicar
 *
 * La migración numeró los tickets desde 1, pero la hoja lleva su propia
 * secuencia —26020, 26022, 26023…— que es la que Sistemas conoce y la que
 * aparece en los correos y en Dynamics desde hace meses. Con la nuestra, el
 * mismo ticket tenía dos códigos según dónde se mirara.
 *
 * Se emparejan por FECHA + TIPO + COLABORADOR, que es lo que identifica una
 * fila de la hoja: no hay id común. Lo que no case sin ambigüedad se deja como
 * está y se informa; inventar un número sería peor que no tocarlo.
 *
 * Al final la secuencia se coloca por encima del mayor, para que el siguiente
 * ticket continúe la numeración de siempre en vez de chocar con ella.
 */

import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";

const APLICAR = process.argv.includes("--aplicar");
const PRODUCCION = process.argv.includes("--produccion");

const BDD = "18FrU-jbGkK-c0CeV7_xA0GLGKZS4pOeDLBS1K4XeTV4";
const HOJA = "BDD MANTENIMIENTO";

const URL = PRODUCCION
  ? process.env.DATABASE_URL_PRODUCCION
  : (process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL);

if (!URL) {
  console.error("Falta la cadena de conexión. Revisa .env.local");
  process.exit(1);
}
if (PRODUCCION && !URL.includes("neon.tech")) {
  console.error("--produccion pero la cadena no apunta a Neon. Abortando.");
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

/** El día de una fecha guardada, como AAAAMMDD. */
function dia(d: Date): number {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .split("-");
  return Number(p[0]) * 10000 + Number(p[1]) * 100 + Number(p[2]);
}

/** El día de la hoja (D/M/AAAA), como AAAAMMDD. */
function diaHoja(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : null;
}

const norm = (t: unknown) => String(t ?? "").trim().toUpperCase();

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Recuperar el número real de los tickets     │");
  console.log("╰──────────────────────────────────────────────╯");
  console.log(`  Base: ${PRODUCCION ? "\x1b[31mPRODUCCIÓN\x1b[0m" : "local"}`);
  console.log(`  Modo: ${APLICAR ? "\x1b[31mAPLICAR\x1b[0m" : "simulacro"}\n`);

  const r = await sheets().spreadsheets.values.get({
    spreadsheetId: BDD,
    range: `${HOJA}!A:G`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const filas = (r.data.values ?? []).slice(1);

  // De la hoja: día + tipo + colaborador → número real.
  const deLaHoja = new Map<string, number>();
  for (const f of filas) {
    const d = diaHoja(String(f[0] ?? ""));
    const codigo = String(f[1] ?? "").trim();
    const m = codigo.match(/_(\d+)$/);
    if (d === null || !m) continue;
    deLaHoja.set(`${d}|${norm(f[3])}|${norm(f[2])}`, Number(m[1]));
  }
  console.log(`  ${deLaHoja.size} código(s) distintos en la hoja`);

  const tickets = await db.ticket.findMany({
    select: {
      id: true,
      numero: true,
      clase: true,
      creadoEn: true,
      persona: { select: { nombre: true, nombreUsuario: true } },
    },
    orderBy: { numero: "asc" },
  });

  const cambios: { id: string; de: number; a: number }[] = [];
  const sinPareja: number[] = [];

  for (const t of tickets) {
    const nombre = norm(t.persona.nombreUsuario?.trim() || t.persona.nombre);
    const real = deLaHoja.get(`${dia(t.creadoEn)}|${norm(t.clase)}|${nombre}`);
    if (real === undefined) {
      sinPareja.push(t.numero);
      continue;
    }
    if (real !== t.numero) cambios.push({ id: t.id, de: t.numero, a: real });
  }

  console.log(`  ${cambios.length} ticket(s) cambian de número`);
  cambios.forEach((c) => console.log(`    ${c.de} → ${c.a}`));
  if (sinPareja.length > 0) {
    console.log(
      `  \x1b[33m!\x1b[0m ${sinPareja.length} sin pareja en la hoja: ${sinPareja.join(", ")}`,
    );
    console.log("     se quedan con el suyo; no se inventa ninguno");
  }

  if (!APLICAR) {
    console.log("\n  \x1b[33m!\x1b[0m SIMULACRO: no se cambió nada.\n");
    return;
  }

  /*
   * En dos pasos, por el índice único de `numero`.
   *
   * Pasar 2→26020 mientras otro aún tiene 26020 rompería la restricción. Se
   * apartan primero a negativos, que nadie usa, y luego se colocan.
   */
  for (const [i, c] of cambios.entries()) {
    await db.ticket.update({ where: { id: c.id }, data: { numero: -(i + 1) } });
  }
  for (const c of cambios) {
    await db.ticket.update({ where: { id: c.id }, data: { numero: c.a } });
  }
  console.log(`  \x1b[32m✓\x1b[0m ${cambios.length} número(s) recuperados`);

  // La secuencia sigue donde acaba la hoja: el siguiente ticket continúa la
  // numeración de siempre en vez de chocar con la que ya existe.
  const mayor = await db.ticket.aggregate({ _max: { numero: true } });
  const siguiente = (mayor._max.numero ?? 0) + 1;
  await db.$executeRawUnsafe(
    `SELECT setval('actividad.ticket_numero_seq', ${siguiente}, false)`,
  );
  console.log(`  \x1b[32m✓\x1b[0m el siguiente ticket será el ${siguiente}\n`);
}

main()
  .catch((e) => {
    console.error("\n  \x1b[31m✗\x1b[0m", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
