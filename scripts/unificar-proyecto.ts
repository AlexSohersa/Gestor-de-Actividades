/**
 * Une dos proyectos que son el mismo trabajo con códigos distintos.
 *
 * Pasa cuando el mismo encargo entró por los dos lados: por las hojas, con el
 * código que la gente venía usando para reportar, y por el Deal Engine, con el
 * código que le tocó al cotizarlo. Quedan dos filas en el padrón, las horas en
 * una y el presupuesto en la otra, y el radar no puede cruzarlos: muestra 81 h
 * registradas contra 0 cotizadas.
 *
 * Todo se mueve al código QUE LA GENTE YA USA, nunca al revés: las horas ya
 * reportadas son el dato que no se puede tocar —están en la hoja, en la
 * nómina y en lo que cada quien ve en su semana—, mientras que el presupuesto
 * es un número que solo vive aquí.
 *
 * El código que queda vacío se marca CANCELADO con una nota, en vez de
 * borrarlo: borrarlo rompería cualquier referencia vieja, y dejar constancia
 * de a dónde se fue es lo que evita que alguien lo vuelva a crear.
 *
 *   npx tsx --env-file=.env.local scripts/unificar-proyecto.ts <se-queda> <se-absorbe>
 *   npx tsx --env-file=.env.local scripts/unificar-proyecto.ts <se-queda> <se-absorbe> --aplicar
 */
import { sql } from "./lib/neon-http";

const [, , QUEDA, ABSORBE] = process.argv;
const APLICAR = process.argv.includes("--aplicar");

async function foto(codigo: string) {
  const r = await sql<{
    nombre: string; estado: string; horas: string; cot: string; ent: number;
  }>(
    `SELECT cp.nombre, cp.estado,
       COALESCE((SELECT sum(h.horas)::text FROM actividad.hora h
                  WHERE h.proyecto_codigo = cp.codigo), '0') horas,
       COALESCE((SELECT sum(c.horas)::text FROM actividad.hora_cotizada c
                  WHERE c.proyecto_codigo = cp.codigo), '0') cot,
       (SELECT count(*)::int FROM actividad.hora_cotizada c
         WHERE c.proyecto_codigo = cp.codigo) ent
       FROM core.proyecto cp WHERE cp.codigo = $1`,
    [codigo],
  );
  return r[0] ?? null;
}

async function main() {
  if (!QUEDA || !ABSORBE || QUEDA === ABSORBE) {
    console.log("uso: unificar-proyecto.ts <código-que-queda> <código-que-se-absorbe> [--aplicar]");
    return;
  }

  const a = await foto(QUEDA);
  const b = await foto(ABSORBE);
  if (!a) return console.log(`✗ no existe en el padrón: ${QUEDA}`);
  if (!b) return console.log(`✗ no existe en el padrón: ${ABSORBE}`);

  console.log("ANTES:");
  console.log(`   QUEDA    ${QUEDA.padEnd(20)} ${a.estado.padEnd(11)} ${a.horas.padStart(9)} h · ${a.cot.padStart(9)} h cotizadas (${a.ent}) · ${a.nombre.slice(0, 34)}`);
  console.log(`   SE ABSORBE ${ABSORBE.padEnd(18)} ${b.estado.padEnd(11)} ${b.horas.padStart(9)} h · ${b.cot.padStart(9)} h cotizadas (${b.ent}) · ${b.nombre.slice(0, 34)}`);

  if (!APLICAR) {
    console.log("\n(ensayo — usa --aplicar para escribir)");
    return;
  }

  /*
   * 1. Las horas del absorbido pasan al que queda.
   *
   * NO se devuelven a la cola de la hoja: la sincronización ANEXA filas, no
   * las corrige, así que volver a mandarlas las escribiría una segunda vez. Y
   * no hace falta —los dos códigos se llaman igual, que es justo por lo que
   * se unen—, así que lo que la hoja ya tiene escrito sigue siendo correcto.
   */
  await sql(
    `UPDATE actividad.hora SET proyecto_codigo = $1 WHERE proyecto_codigo = $2`,
    [QUEDA, ABSORBE],
  );

  // 2. El presupuesto, solo si el que queda no tiene ya el suyo: si los dos
  //    tuvieran, sumarlos inventaría horas que nadie cotizó.
  if (a.ent === 0) {
    await sql(
      `UPDATE actividad.hora_cotizada SET proyecto_codigo = $1 WHERE proyecto_codigo = $2`,
      [QUEDA, ABSORBE],
    );
  } else {
    console.log(`\n   (el presupuesto de ${ABSORBE} se deja donde está: ${QUEDA} ya tenía el suyo)`);
  }

  // 3. Las horas extra pendientes también apuntan al proyecto.
  await sql(
    `UPDATE actividad.hora_extra SET proyecto_codigo = $1 WHERE proyecto_codigo = $2`,
    [QUEDA, ABSORBE],
  );

  // 4. El absorbido queda cancelado, con la nota de a dónde se fue.
  await sql(
    `UPDATE core.proyecto
        SET estado = 'CANCELADO',
            nombre = CASE WHEN nombre LIKE '[UNIDO%' THEN nombre
                          ELSE '[UNIDO a ' || $1 || '] ' || nombre END
      WHERE codigo = $2`,
    [QUEDA, ABSORBE],
  );

  const d = await foto(QUEDA);
  console.log("\nDESPUÉS:");
  console.log(`   ${QUEDA.padEnd(20)} ${d!.horas.padStart(9)} h reportadas · ${d!.cot.padStart(9)} h cotizadas (${d!.ent} entregables)`);
  console.log(`   ${ABSORBE} queda CANCELADO y ya no sale para reportar.`);
}

main();
