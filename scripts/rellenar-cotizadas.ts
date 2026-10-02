/**
 * Rellena las horas cotizadas que faltan, desde el Deal Engine.
 *
 * `actividad.hora_cotizada` se llenó en la migración y nadie la actualiza: son
 * 2 086 filas de 201 proyectos, congeladas desde entonces. Un proyecto
 * cotizado después —como «Arquitectónico Liverpool Nuevo Laredo»— aparece en
 * el radar con 81 h registradas contra 0 cotizadas, y la pantalla no puede
 * responder la única pregunta que se le hace: si alcanzan.
 *
 * El Deal Engine sí las tiene, en la cadena que ya conocemos:
 *
 *     Project → Quote (viva) → QuoteVersion (vigente) → WorkPackage
 *             → Deliverable → DeliverableRoleHours.hours
 *
 * RELLENA, NO SUSTITUYE. Donde la tabla ya tiene un presupuesto, se respeta:
 * son cifras que alguien curó a mano y que en doce proyectos el Deal Engine no
 * tiene —EMBA tiene 5 909 h ahí y ninguna allá—; reemplazarlas los dejaría en
 * cero. Solo se escriben los proyectos que hoy no tienen ni una fila.
 *
 * Es repetible: correrlo dos veces no duplica nada, porque solo mira los que
 * siguen vacíos. Pensado para ejecutarse cuando se cotice algo nuevo.
 *
 *   npx tsx --env-file=.env.local scripts/rellenar-cotizadas.ts            (ensayo)
 *   npx tsx --env-file=.env.local scripts/rellenar-cotizadas.ts --aplicar
 */
import { sql } from "./lib/neon-http";

const APLICAR = process.argv.includes("--aplicar");

type Fila = {
  codigo: string;
  nombre: string;
  entregable: string;
  disciplina: string | null;
  horas: string;
};

async function main() {
  /*
   * Los entregables cotizados de cada proyecto que hoy no tiene ni uno.
   *
   * Se suma por entregable porque un mismo entregable lleva varias filas de
   * `DeliverableRoleHours` —una por rol que participa—, y lo que interesa es
   * el total de horas presupuestadas para él.
   */
  const filas = await sql<Fila>(`
    SELECT p.proyecto_codigo                       AS codigo,
           cp.nombre                               AS nombre,
           trim(d.name)                            AS entregable,
           NULLIF(trim(COALESCE(d.specialty,'')),'') AS disciplina,
           sum(rh.hours)::text                     AS horas
      FROM deal."Project" p
      JOIN core.proyecto cp        ON cp.codigo = p.proyecto_codigo
      JOIN deal."Quote" q          ON q."projectId" = p.id AND q."archivedAt" IS NULL
      JOIN deal."QuoteVersion" v   ON v.id = q."currentVersionId"
      JOIN deal."WorkPackage" w    ON w."quoteVersionId" = v.id
      JOIN deal."Deliverable" d    ON d."workPackageId" = w.id
      JOIN deal."DeliverableRoleHours" rh ON rh."deliverableId" = d.id
     WHERE p.proyecto_codigo IS NOT NULL
       AND regexp_replace(COALESCE(d.name,''), '[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]', '', 'g') <> ''
       /*
        * Nada para los proyectos retirados.
        *
        * Al unir un duplicado, el código vacío queda CANCELADO aquí pero sigue
        * activo en el Deal Engine —allá no se unió nada—, así que entraba otra
        * vez por esta puerta y se le escribía un presupuesto que ya está en el
        * código bueno. Un proyecto que nadie puede elegir no necesita uno.
        */
       AND cp.estado <> 'CANCELADO'
       -- Solo los que no tienen NADA: lo curado a mano no se toca.
       AND NOT EXISTS (
         SELECT 1 FROM actividad.hora_cotizada hc
          WHERE hc.proyecto_codigo = p.proyecto_codigo
       )
     GROUP BY 1, 2, 3, 4
    HAVING sum(rh.hours) > 0
     ORDER BY 1, 3
  `);

  const porProyecto = new Map<string, Fila[]>();
  for (const f of filas) {
    porProyecto.set(f.codigo, [...(porProyecto.get(f.codigo) ?? []), f]);
  }

  console.log(`proyectos a rellenar: ${porProyecto.size} (${filas.length} entregables)\n`);
  for (const [codigo, suyas] of porProyecto) {
    const total = suyas.reduce((n, f) => n + Number(f.horas), 0);
    console.log(
      `   ${codigo.padEnd(20)} ${String(suyas.length).padStart(3)} entregables · ` +
        `${total.toFixed(2).padStart(10)} h · ${suyas[0].nombre.slice(0, 34)}`,
    );
  }

  if (!APLICAR) {
    console.log("\n(ensayo — usa --aplicar para escribir)");
    return;
  }

  for (const f of filas) {
    await sql(
      `INSERT INTO actividad.hora_cotizada
         (id, proyecto_codigo, entregable, disciplina, horas)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [f.codigo, f.entregable, f.disciplina, Number(f.horas)],
    );
  }

  const d = await sql<{ proyectos: number; filas: number }>(`
    SELECT count(DISTINCT proyecto_codigo)::int proyectos, count(*)::int filas
      FROM actividad.hora_cotizada`);
  console.log(`\n✓ escrito. La tabla tiene ahora ${d[0].filas} filas de ${d[0].proyectos} proyectos.`);
}

main();
