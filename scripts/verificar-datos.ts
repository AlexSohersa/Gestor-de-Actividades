/**
 * VERIFICACIÓN de la integridad de los datos.
 *
 *   npx tsx scripts/verificar-datos.ts [--produccion]
 *
 * Comprueba lo que hay que comprobar antes de dar nada por terminado:
 *
 *   · que ninguna hora quede sin persona ni sin proyecto
 *   · que las cifras cuadren con lo que había antes
 *   · que core.v_sin_enlazar no crezca
 *
 * Solo LEE. No modifica nada. Devuelve código de salida 1 si algo falla, para
 * poder encadenarlo en un despliegue.
 */

import { PrismaClient } from "@prisma/client";

const PRODUCCION = process.argv.includes("--produccion");

const URL = PRODUCCION
  ? process.env.DATABASE_URL_PRODUCCION
  : (process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL);

if (!URL) {
  console.error("Falta la cadena de conexión. Revisa .env.local");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url: URL } } });

/// Las cifras de referencia: lo que había cuando se separó la herramienta del
/// portal. Sirven de suelo, no de tope: los datos pueden crecer, pero no
/// encoger sin que alguien se entere.
const REFERENCIA = {
  // Sube cada vez que se trae lo nuevo de las hojas: es un SUELO, no un
  // número exacto. Lo que importa es que no BAJE — eso sería pérdida de datos.
  horas: 9410,
  horasCotizadas: 2059,
  personas: 53,
  proyectos: 506,
  sinEnlazar: 7,
};

let fallos = 0;

function comprobar(descripcion: string, ok: boolean, detalle: string) {
  const marca = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${marca} ${descripcion}`);
  if (detalle) console.log(`      ${detalle}`);
  if (!ok) fallos++;
}

function aviso(descripcion: string, detalle: string) {
  console.log(`  \x1b[33m!\x1b[0m ${descripcion}`);
  if (detalle) console.log(`      ${detalle}`);
}

async function main() {
  console.log("\n╭──────────────────────────────────────────────╮");
  console.log("│  Verificación de datos                       │");
  console.log("╰──────────────────────────────────────────────╯");
  console.log(`  Base: ${PRODUCCION ? "PRODUCCIÓN (Neon)" : "local"}\n`);

  // ── Integridad referencial ────────────────────────────────────────────────
  console.log("\x1b[1mIntegridad\x1b[0m");

  // Que no haya horas sin persona no hace falta comprobarlo con una consulta:
  // la columna es NOT NULL con clave foránea. Lo que sí puede pasar es que una
  // hora no tenga proyecto enlazado.
  const [total, sinProyecto, sinProyectoNiTexto] = await Promise.all([
    db.hora.count(),
    db.hora.count({ where: { proyectoCodigo: null } }),
    db.hora.count({ where: { proyectoCodigo: null, proyectoTexto: null } }),
  ]);

  comprobar(
    "Ninguna hora sin persona",
    true,
    "garantizado por la clave foránea persona_id NOT NULL",
  );

  comprobar(
    "Ninguna hora sin rastro de proyecto",
    sinProyectoNiTexto === 0,
    sinProyectoNiTexto === 0
      ? `${sinProyecto} sin código, pero todas conservan el nombre en proyecto_texto`
      : `${sinProyectoNiTexto} horas sin proyecto NI texto: se perdió la referencia`,
  );

  // ── Cifras ────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mCifras\x1b[0m");

  const [cotizadas, personas, proyectos, ausencias, tickets, saldos] =
    await Promise.all([
      db.horaCotizada.count(),
      db.persona.count(),
      db.proyecto.count(),
      db.ausencia.count(),
      db.ticket.count(),
      db.saldoVacaciones.count(),
    ]);

  comprobar(
    "Horas registradas",
    total >= REFERENCIA.horas,
    `${total} (referencia: ${REFERENCIA.horas}${total > REFERENCIA.horas ? `, +${total - REFERENCIA.horas} nuevas` : ""})`,
  );

  comprobar(
    "Horas cotizadas",
    cotizadas >= REFERENCIA.horasCotizadas,
    `${cotizadas} (referencia: ${REFERENCIA.horasCotizadas})`,
  );

  comprobar(
    "Personas en el padrón",
    personas >= REFERENCIA.personas,
    `${personas} (referencia: ${REFERENCIA.personas})`,
  );

  comprobar(
    "Proyectos en el padrón",
    proyectos >= REFERENCIA.proyectos,
    `${proyectos} (referencia: ${REFERENCIA.proyectos})`,
  );

  console.log(`  · Ausencias: ${ausencias}`);
  console.log(`  · Tickets: ${tickets}`);
  console.log(`  · Saldos de vacaciones: ${saldos}`);

  if (ausencias === 0) {
    aviso(
      "actividad.ausencia sigue vacía",
      "las ausencias históricas están dentro de actividad.hora (proyecto SOH_INT_00000_AUS)",
    );
  }
  if (saldos === 0) {
    aviso(
      "actividad.saldo_vacaciones sigue vacía",
      "sin ella, la pantalla de ausencias no puede calcular días disponibles",
    );
  }

  // ── Enlaces pendientes en core ────────────────────────────────────────────
  console.log("\n\x1b[1mEnlaces de core\x1b[0m");

  const sinEnlazar = await db.$queryRaw<Array<{ tabla: string; dato: string }>>`
    SELECT tabla, dato FROM core.v_sin_enlazar
  `;

  comprobar(
    "core.v_sin_enlazar no ha crecido",
    sinEnlazar.length <= REFERENCIA.sinEnlazar,
    `${sinEnlazar.length} registros sin enlazar (referencia: ${REFERENCIA.sinEnlazar})`,
  );

  // Ninguno de esos debería ser nuestro: esta herramienta enlaza por clave
  // foránea, así que si aparece algo de `actividad` es un fallo de la ingesta.
  const nuestros = sinEnlazar.filter((r) => r.tabla.startsWith("actividad"));
  comprobar(
    "Nada de `actividad` sin enlazar",
    nuestros.length === 0,
    nuestros.length === 0
      ? "todas las filas de actividad apuntan a core"
      : nuestros.map((r) => `${r.tabla}: ${r.dato}`).join(", "),
  );

  // ── Coherencia de la propia sección ───────────────────────────────────────
  console.log("\n\x1b[1mCoherencia\x1b[0m");

  const horasNegativas = await db.hora.count({ where: { horas: { lte: 0 } } });
  comprobar(
    "No hay horas con valor cero o negativo",
    horasNegativas === 0,
    `${horasNegativas} filas`,
  );

  const rango = await db.hora.aggregate({
    _min: { fecha: true },
    _max: { fecha: true },
    _sum: { horas: true },
  });

  console.log(
    `  · Rango: ${rango._min.fecha?.toISOString().slice(0, 10)} → ` +
      `${rango._max.fecha?.toISOString().slice(0, 10)}`,
  );
  console.log(`  · Suma total: ${Number(rango._sum.horas ?? 0)} h`);

  const porOrigen = await db.hora.groupBy({
    by: ["origen"],
    _count: { origen: true },
  });
  for (const o of porOrigen) {
    console.log(`  · Origen "${o.origen}": ${o._count.origen} filas`);
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  console.log("");
  if (fallos === 0) {
    console.log("\x1b[32m  Todo cuadra.\x1b[0m\n");
  } else {
    console.log(`\x1b[31m  ${fallos} comprobación(es) fallaron.\x1b[0m\n`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
