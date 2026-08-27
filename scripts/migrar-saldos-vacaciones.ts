/**
 * MIGRACIÓN de los saldos de vacaciones.
 *
 *   npx tsx --env-file=.env.local scripts/migrar-saldos-vacaciones.ts [--produccion] [--aplicar]
 *
 * Lleva `public.VacationBlock` (los bloques del portal antiguo) a
 * `actividad.saldo_vacaciones`, resolviendo el correo contra core.persona_correo.
 *
 * Sin esto, la pantalla de ausencias no puede decir cuántos días le quedan a
 * nadie: es la única pieza que falta para que esa sección funcione completa.
 *
 * Qué respeta:
 *
 *  · NO TOCA `public`. Solo lee. El portal sigue usándola mientras esta
 *    herramienta no lo sustituya.
 *  · No inventa personas: un correo que no esté en core.persona_correo se
 *    reporta y se queda fuera.
 *  · Es idempotente. La clave es (persona, periodo), así que volver a correrlo
 *    actualiza en vez de duplicar.
 *
 * Sobre el modelo: `VacationBlock` guardaba `used` (días ya tomados) en cada
 * bloque. Aquí NO se migra ese campo, a propósito: en la herramienta nueva los
 * días consumidos se derivan de las ausencias aprobadas cada vez que se
 * consultan (ver saldo.rules.ts). Así cancelar una ausencia devuelve los días
 * solos, en vez de dejar un contador desincronizado para siempre.
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

interface FilaOrigen {
  id: string;
  email: string;
  days: number;
  used: number;
  releasedAt: Date | null;
  expiresAt: Date;
  period: string | null;
}

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Saldos de vacaciones → actividad            │");
  console.log("╰──────────────────────────────────────────────╯");
  console.log(`  Destino: ${PRODUCCION ? "PRODUCCIÓN (Neon)" : "local"}`);
  console.log(`  Modo:    ${APLICAR ? "APLICAR (escribe)" : "simulacro"}\n`);

  // Se lee con SQL crudo porque `public.VacationBlock` es del portal y no está
  // —ni debe estar— en nuestro schema de Prisma.
  const origen = await db.$queryRaw<FilaOrigen[]>`
    SELECT id, email, days, used, "releasedAt", "expiresAt", period
    FROM public."VacationBlock"
    ORDER BY email, "expiresAt"
  `;

  console.log(`  ${origen.length} bloques leídos de public.VacationBlock`);

  // El correo se resuelve contra el padrón. Una persona puede tener varios
  // correos y el bloque puede venir con cualquiera de ellos.
  const correos = await db.personaCorreo.findMany({
    select: { correo: true, personaId: true },
  });
  const personaPorCorreo = new Map(correos.map((c) => [c.correo, c.personaId]));

  interface Registro {
    id: string;
    personaId: string;
    periodo: number;
    dias: number;
    usados: number;
    corte: Date;
    liberadoEn: Date | null;
    venceEn: Date | null;
  }

  /*
   * UNA FILA DEL ORIGEN = UN BLOQUE.
   *
   * No se acumulan por periodo: una persona puede tener varios bloques del
   * mismo periodo con fechas distintas —10 días al entrar y 7 más al cumplir
   * el año—, y sumarlos borraba la diferencia entre lo ya liberado y lo que
   * todavía no toca. Ese fallo hacía que alguien con 10 días disponibles
   * viera 32.
   */
  const registros: Registro[] = [];
  const sinPersona = new Map<string, number>();
  let sinPeriodo = 0;

  for (const fila of origen) {
    const personaId = personaPorCorreo.get(fila.email.trim().toLowerCase());

    if (!personaId) {
      sinPersona.set(fila.email, (sinPersona.get(fila.email) ?? 0) + 1);
      continue;
    }

    // El periodo venía como texto ("1", "2", "3"). Sin él no se puede saber a
    // qué año de antigüedad corresponde el bloque.
    const periodo = Number(fila.period);
    if (!Number.isFinite(periodo)) {
      sinPeriodo++;
      continue;
    }

    registros.push({
      // El id del origen: así volver a correrlo actualiza en vez de duplicar.
      id: fila.id,
      personaId,
      periodo,
      dias: Number(fila.days),
      // Lo ya consumido, tal como venía. `days` es lo que QUEDA: el portal ya
      // descontó las ausencias al calcularlo.
      usados: Number(fila.used ?? 0),
      // Todo lo anterior a hoy ya está reflejado en `dias`; solo lo que se
      // pida a partir de ahora vuelve a descontar.
      corte: new Date(),
      liberadoEn: fila.releasedAt ?? null,
      venceEn: fila.expiresAt ?? null,
    });
  }

  console.log(`  ${registros.length} bloques listos`);
  console.log(
    `  ${new Set(registros.map((r) => r.personaId)).size} personas afectadas`,
  );

  if (sinPersona.size > 0) {
    console.log(`\n  \x1b[33m!\x1b[0m ${sinPersona.size} correos sin persona en core:`);
    for (const [correo, veces] of sinPersona) {
      console.log(`      · ${correo} — ${veces} bloque(s)`);
    }
  }
  if (sinPeriodo > 0) {
    console.log(`  \x1b[33m!\x1b[0m ${sinPeriodo} bloques sin periodo válido (se omiten)`);
  }

  // Resumen de días por persona, para poder contrastarlo a ojo antes de aplicar.
  const totalDias = registros.reduce((t, r) => t + r.dias, 0);
  console.log(`\n  Total de días a registrar: ${Math.round(totalDias * 100) / 100}`);

  if (!APLICAR) {
    console.log(
      "\n  \x1b[33m!\x1b[0m SIMULACRO: no se escribió nada. Añade --aplicar.\n",
    );
    return;
  }

  // El upsert por (persona, periodo) es lo que hace la operación repetible: si
  // el saldo cambia en el origen, la segunda corrida lo actualiza.
  let escritos = 0;
  for (const r of registros) {
    await db.saldoVacaciones.upsert({
      where: { id: r.id },
      create: r,
      update: {
        dias: r.dias,
        usados: r.usados,
        // El corte se refresca en cada corrida: lo que trae el origen ya está
        // descontado hasta HOY, así que lo anterior no vuelve a restar.
        corte: r.corte,
        periodo: r.periodo,
        liberadoEn: r.liberadoEn,
        venceEn: r.venceEn,
      },
    });
    escritos++;
  }

  console.log(`\n  \x1b[32m✓\x1b[0m ${escritos} saldos escritos en actividad.saldo_vacaciones\n`);
}

main()
  .catch((e) => {
    console.error("\n  \x1b[31m✗\x1b[0m", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
