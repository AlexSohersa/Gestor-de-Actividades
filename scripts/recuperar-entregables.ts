/**
 * RECUPERA el entregable de las horas ya migradas.
 *
 *   npx tsx --env-file=.env.local scripts/recuperar-entregables.ts [--produccion] [--aplicar]
 *
 * La migración anterior a `actividad.hora` no conservó el NOMBRE del
 * entregable: dejó `entregable_id` apuntando a `core.entregable`, que está
 * vacía, y no guardó ningún texto de respaldo. Resultado: el radar de proyectos
 * no puede cruzar lo registrado con lo cotizado —que se guarda POR NOMBRE— y
 * todos los entregables salen al 0 %.
 *
 * El dato sigue en `public.HistoricHours`, y cruza por id con las 9 236 filas.
 * Este script lo copia a `actividad.hora.entregable_texto`.
 *
 * Qué respeta:
 *
 *  · Solo LEE de `public`. El portal la sigue usando.
 *  · Solo escribe `entregable_texto`, y solo donde está vacío: no pisa lo que
 *    ya se haya capturado en la aplicación.
 *  · Es idempotente: correrlo dos veces deja la base igual.
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const PRODUCCION = args.includes("--produccion");

const URL = PRODUCCION
  ? process.env.DATABASE_URL_PRODUCCION
  : (process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL);

if (!URL) {
  console.error("Falta la cadena de conexión. Revisa .env.local");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url: URL } } });

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Recuperar el entregable de las horas        │");
  console.log("╰──────────────────────────────────────────────╯");
  console.log(`  Destino: ${PRODUCCION ? "PRODUCCIÓN (Neon)" : "local"}`);
  console.log(`  Modo:    ${APLICAR ? "APLICAR (escribe)" : "simulacro"}\n`);

  const [antes] = await db.$queryRaw<{ total: bigint; con: bigint }[]>`
    SELECT count(*) total, count(entregable_texto) con FROM actividad.hora
  `;
  console.log(
    `  ${antes.total} horas · ${antes.con} ya tienen entregable`,
  );

  // Cuántas se pueden recuperar. El cruce es por id: la migración conservó el
  // identificador original de la hoja, así que el emparejamiento es exacto y no
  // hace falta adivinar por nombre y fecha.
  const [posibles] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) n
    FROM actividad.hora h
    JOIN public."HistoricHours" hh ON hh.id = h.id
    WHERE h.entregable_texto IS NULL
      AND hh.deliverable IS NOT NULL
      AND btrim(hh.deliverable) <> ''
  `;
  console.log(`  ${posibles.n} se pueden recuperar de public."HistoricHours"`);

  // La disciplina viaja en la misma fila y también se perdió; se aprovecha el
  // viaje para rellenarla donde falte.
  const [conDisciplina] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) n
    FROM actividad.hora h
    JOIN public."HistoricHours" hh ON hh.id = h.id
    WHERE h.disciplina IS NULL
      AND hh.discipline IS NOT NULL
      AND btrim(hh.discipline) <> ''
  `;
  console.log(`  ${conDisciplina.n} recuperarían además su disciplina`);

  if (!APLICAR) {
    console.log(
      "\n  \x1b[33m!\x1b[0m SIMULACRO: no se escribió nada. Añade --aplicar.\n",
    );
    return;
  }

  const tocadas = await db.$executeRaw`
    UPDATE actividad.hora h
       SET entregable_texto = btrim(hh.deliverable),
           disciplina = COALESCE(h.disciplina, NULLIF(btrim(hh.discipline), ''))
      FROM public."HistoricHours" hh
     WHERE hh.id = h.id
       AND h.entregable_texto IS NULL
       AND hh.deliverable IS NOT NULL
       AND btrim(hh.deliverable) <> ''
  `;

  console.log(`\n  \x1b[32m✓\x1b[0m ${tocadas} horas recuperaron su entregable`);

  // Lo que importa de verdad: cuántas cruzan ahora con lo cotizado. Si el
  // nombre no coincide con ningún entregable cotizado, el radar las agrupa
  // igual pero no puede compararlas contra un presupuesto.
  const [cruce] = await db.$queryRaw<{ conCotizada: bigint; sin: bigint }[]>`
    SELECT
      count(*) FILTER (WHERE hc.entregable IS NOT NULL) AS "conCotizada",
      count(*) FILTER (WHERE hc.entregable IS NULL)     AS sin
    FROM actividad.hora h
    LEFT JOIN actividad.hora_cotizada hc
           ON hc.proyecto_codigo = h.proyecto_codigo
          AND upper(btrim(hc.entregable)) = upper(btrim(h.entregable_texto))
    WHERE h.entregable_texto IS NOT NULL
  `;
  console.log(
    `  ${cruce.conCotizada} cruzan con un entregable cotizado · ${cruce.sin} no (trabajo sin presupuestar)\n`,
  );
}

main()
  .catch((e) => {
    console.error("\n  \x1b[31m✗\x1b[0m", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
