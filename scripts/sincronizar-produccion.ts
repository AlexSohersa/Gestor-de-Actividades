/**
 * COPIA a producción lo que ya está probado en local.
 *
 *   npx tsx --env-file=.env.local scripts/sincronizar-produccion.ts            (simulacro)
 *   npx tsx --env-file=.env.local scripts/sincronizar-produccion.ts --aplicar
 *
 * Local es la referencia: ahí se hizo la ingesta de las hojas, se recuperaron
 * los entregables y los folios reales de los tickets, y se corrigieron los
 * saldos de vacaciones. Esto lleva ese resultado a Neon.
 *
 * Va por HTTP y no por el puerto 5432 porque desde esta máquina el puerto de
 * Postgres no completa el saludo. Es la misma base.
 *
 * Todo es IDEMPOTENTE: cada fila se identifica por su id y se usa
 * `ON CONFLICT DO UPDATE`, así que correrlo dos veces deja el mismo resultado.
 * No borra nada: lo que esté en producción y no en local se queda.
 */

import { PrismaClient } from "@prisma/client";
import { sql, servidor } from "./lib/neon-http";

const APLICAR = process.argv.includes("--aplicar");

const local = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL },
  },
});

/** Filas por sentencia. Suficientes para ir rápido sin pasarse de tamaño. */
const LOTE = 200;

const t = {
  titulo: (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`),
  ok: (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`),
  dato: (s: string) => console.log(`    ${s}`),
  aviso: (s: string) => console.log(`  \x1b[33m!\x1b[0m ${s}`),
};

/**
 * Inserta un lote con parámetros numerados ($1, $2…).
 *
 * Los valores viajan aparte del texto: es lo que impide que un comentario con
 * comillas rompa la sentencia o cambie lo que hace.
 */
async function insertar(
  tabla: string,
  columnas: string[],
  filas: unknown[][],
  actualizar: string[],
) {
  if (filas.length === 0) return;

  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const params: unknown[] = [];
    const grupos: string[] = [];

    for (const fila of lote) {
      const marcas = fila.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      grupos.push(`(${marcas.join(",")})`);
    }

    const set = actualizar
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");

    await sql(
      `INSERT INTO ${tabla} (${columnas.join(",")})
       VALUES ${grupos.join(",")}
       ON CONFLICT (id) DO UPDATE SET ${set}`,
      params,
    );

    process.stdout.write(`\r    ${Math.min(i + LOTE, filas.length)}/${filas.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Copiar local → PRODUCCIÓN                   │");
  console.log("╰──────────────────────────────────────────────╯");
  console.log(`  Servidor: ${servidor}`);
  console.log(`  Modo: ${APLICAR ? "\x1b[31mAPLICAR (escribe)\x1b[0m" : "simulacro"}`);

  // ── Horas ────────────────────────────────────────────────────────────────
  t.titulo("actividad.hora");
  const horas = await local.hora.findMany({
    select: {
      id: true,
      personaId: true,
      proyectoCodigo: true,
      entregableId: true,
      fecha: true,
      horas: true,
      disciplina: true,
      tipo: true,
      esfuerzo: true,
      comentario: true,
      pago: true,
      categoria: true,
      quincena: true,
      origen: true,
      proyectoTexto: true,
      entregableTexto: true,
      sheetSync: true,
      creadoEn: true,
      actualizadoEn: true,
    },
  });
  const enProd = (
    await sql<{ n: number }>(`select count(*)::int n from actividad.hora`)
  )[0].n;
  t.dato(`local ${horas.length} · producción ${enProd}`);

  // ── Ausencias ────────────────────────────────────────────────────────────
  t.titulo("actividad.ausencia");
  const ausencias = await local.ausencia.findMany();
  const ausProd = (
    await sql<{ n: number }>(`select count(*)::int n from actividad.ausencia`)
  )[0].n;
  t.dato(`local ${ausencias.length} · producción ${ausProd}`);

  // ── Tickets y su bitácora ────────────────────────────────────────────────
  t.titulo("actividad.ticket");
  const tickets = await local.ticket.findMany();
  const tickProd = (
    await sql<{ n: number }>(`select count(*)::int n from actividad.ticket`)
  )[0].n;
  t.dato(`local ${tickets.length} · producción ${tickProd}`);

  const eventos = await local.ticketEvento.findMany();
  t.dato(`bitácora: ${eventos.length} entrada(s)`);

  // ── Saldos ───────────────────────────────────────────────────────────────
  t.titulo("actividad.saldo_vacaciones");
  const saldos = await local.saldoVacaciones.findMany();
  const salProd = (
    await sql<{ n: number }>(
      `select count(*)::int n from actividad.saldo_vacaciones`,
    )
  )[0].n;
  t.dato(`local ${saldos.length} · producción ${salProd}`);

  if (!APLICAR) {
    console.log(
      "\n  \x1b[33m!\x1b[0m SIMULACRO: no se escribió nada. Añade --aplicar.\n",
    );
    await local.$disconnect();
    return;
  }

  // ── A escribir ───────────────────────────────────────────────────────────
  t.titulo("Escribiendo");

  console.log("  horas…");
  await insertar(
    "actividad.hora",
    [
      "id", "persona_id", "proyecto_codigo", "entregable_id", "fecha", "horas",
      "disciplina", "tipo", "esfuerzo", "comentario", "pago", "categoria",
      "quincena", "origen", "proyecto_texto", "entregable_texto", "sheet_sync",
      "creado_en", "actualizado_en",
    ],
    horas.map((h) => [
      h.id, h.personaId, h.proyectoCodigo, h.entregableId,
      h.fecha.toISOString().slice(0, 10), Number(h.horas),
      h.disciplina, h.tipo, h.esfuerzo, h.comentario, h.pago, h.categoria,
      h.quincena, h.origen, h.proyectoTexto, h.entregableTexto, h.sheetSync,
      h.creadoEn.toISOString(), h.actualizadoEn.toISOString(),
    ]),
    [
      "entregable_texto", "categoria", "sheet_sync", "pago", "esfuerzo",
      "comentario", "actualizado_en",
    ],
  );

  console.log("  ausencias…");
  await insertar(
    "actividad.ausencia",
    [
      "id", "persona_id", "tipo", "fecha_inicio", "fecha_fin", "medio_dia",
      "horas", "motivo", "estado", "periodo", "enviada_a", "decidida_por",
      "decidida_en", "sheet_sync", "creado_en",
    ],
    ausencias.map((a) => [
      a.id, a.personaId, a.tipo,
      a.fechaInicio.toISOString().slice(0, 10),
      a.fechaFin.toISOString().slice(0, 10),
      a.medioDia, a.horas === null ? null : Number(a.horas), a.motivo,
      a.estado, a.periodo, a.enviadaA, a.decididaPor,
      a.decididaEn?.toISOString() ?? null, a.sheetSync,
      a.creadoEn.toISOString(),
    ]),
    ["estado", "periodo", "enviada_a", "decidida_por", "decidida_en", "sheet_sync"],
  );

  console.log("  tickets…");
  await insertar(
    "actividad.ticket",
    [
      "id", "numero", "persona_id", "titulo", "detalle", "clase", "falla",
      "prioridad", "estado", "equipo", "anydesk", "dynamics_id",
      "atendido_por", "cerrado_en", "sheet_sync", "creado_en", "actualizado_en",
    ],
    tickets.map((k) => [
      k.id, k.numero, k.personaId, k.titulo, k.detalle, k.clase, k.falla,
      k.prioridad, k.estado, k.equipo, k.anydesk, k.dynamicsId,
      k.atendidoPor, k.cerradoEn?.toISOString() ?? null, k.sheetSync,
      k.creadoEn.toISOString(), k.actualizadoEn.toISOString(),
    ]),
    ["numero", "prioridad", "estado", "equipo", "anydesk", "dynamics_id", "sheet_sync"],
  );

  if (eventos.length > 0) {
    console.log("  bitácora…");
    await insertar(
      "actividad.ticket_evento",
      ["id", "ticket_id", "persona_id", "texto", "creado_en"],
      eventos.map((e) => [
        e.id, e.ticketId, e.personaId, e.texto, e.creadoEn.toISOString(),
      ]),
      ["texto"],
    );
  }

  console.log("  saldos…");
  await insertar(
    "actividad.saldo_vacaciones",
    [
      "id", "persona_id", "periodo", "dias", "usados", "corte",
      "liberado_en", "vence_en",
    ],
    saldos.map((s) => [
      s.id, s.personaId, s.periodo, Number(s.dias), Number(s.usados),
      s.corte?.toISOString().slice(0, 10) ?? null,
      s.liberadoEn?.toISOString().slice(0, 10) ?? null,
      s.venceEn?.toISOString().slice(0, 10) ?? null,
    ]),
    ["dias", "usados", "corte", "liberado_en", "vence_en"],
  );

  // La secuencia del folio, para que el siguiente ticket siga la numeración
  // de la hoja en vez de chocar con la que ya existe.
  const [{ mayor }] = await sql<{ mayor: number | null }>(
    `select max(numero) mayor from actividad.ticket`,
  );
  if (mayor !== null) {
    await sql(
      `select setval('actividad.ticket_numero_seq', ${mayor + 1}, false)`,
    );
    t.ok(`el siguiente ticket será el ${mayor + 1}`);
  }

  // ── Cómo quedó ───────────────────────────────────────────────────────────
  t.titulo("Producción ahora");
  for (const tb of ["hora", "ausencia", "ticket", "ticket_evento", "saldo_vacaciones"]) {
    const [{ n }] = await sql<{ n: number }>(
      `select count(*)::int n from actividad.${tb}`,
    );
    t.dato(`${tb.padEnd(18)} ${n}`);
  }

  console.log("");
  await local.$disconnect();
}

main().catch(async (e) => {
  console.error("\n  \x1b[31m✗\x1b[0m", e instanceof Error ? e.message : e, "\n");
  await local.$disconnect().catch(() => {});
  process.exitCode = 1;
});
