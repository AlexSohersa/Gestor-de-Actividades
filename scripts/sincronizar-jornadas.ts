/**
 * Pone en el padrón las horas diarias que diga la hoja de contratos.
 *
 * La jornada de cada quien vive en «S2 DATOS CONTRATO Y PRESTACIONES DE LEY»,
 * columna G, y cambia: alguien pasa de media jornada a completa y la hoja se
 * corrige, pero el padrón se queda con lo viejo. De ahí salen las metas del
 * día y de la quincena, y a partir de cuántas horas lo reportado cuenta como
 * extra, así que una jornada desfasada le pide a alguien el doble de lo que
 * firmó —o le cuenta como extra lo que es su jornada normal—.
 *
 * Es repetible y no destruye nada: solo escribe a quien difiere, y a quien no
 * aparece en la hoja lo deja como está.
 *
 *   npx tsx --env-file=.env.local scripts/sincronizar-jornadas.ts            (ensayo)
 *   npx tsx --env-file=.env.local scripts/sincronizar-jornadas.ts --aplicar
 */
import { leerRango, aTexto, aNumero } from "../src/lib/google/hojas";
import { sql } from "./lib/neon-http";

const LIBRO = "1jVZcVV3knVzU3bgT2dzRkBoawS3VJONvB8ev5kw5rEY";
const HOJA = "S2 DATOS CONTRATO Y PRESTACIONES DE LEY";
const APLICAR = process.argv.includes("--aplicar");

/** Nombres con espacios de más, acentos y mayúsculas distintas sí casan. */
const N = (t: string) => t.trim().toUpperCase().replace(/\s+/g, " ");

async function main() {
  const filas = await leerRango(LIBRO, `${HOJA}!A4:H`);

  // La hoja se indexa por nombre completo Y por nombre de usuario: el padrón
  // usa a veces uno y a veces otro.
  const hoja = new Map<string, number>();
  for (const f of filas) {
    const completo = aTexto(f[0]);
    const usuario = aTexto(f[1]);
    const horas = aNumero(f[6]);
    if (!completo || horas === null || horas <= 0) continue;
    hoja.set(N(completo), horas);
    if (usuario) hoja.set(N(usuario), horas);
  }

  const bd = await sql<{
    id: string;
    nombre: string;
    usuario: string | null;
    horas: string;
  }>(`SELECT id, nombre, nombre_usuario usuario, horas_dia::text horas
        FROM core.persona WHERE activo ORDER BY nombre`);

  const cambios: { id: string; nombre: string; de: number; a: number }[] = [];
  const sinFila: string[] = [];

  for (const p of bd) {
    const h =
      hoja.get(N(p.nombre)) ?? (p.usuario ? hoja.get(N(p.usuario)) : undefined);
    if (h === undefined) {
      sinFila.push(p.nombre);
      continue;
    }
    if (Number(p.horas) !== h) {
      cambios.push({ id: p.id, nombre: p.nombre, de: Number(p.horas), a: h });
    }
  }

  console.log(`personas en la hoja: ${new Set(hoja.values()).size > 0 ? filas.length : 0}`);
  console.log(`a cambiar: ${cambios.length} · sin fila en la hoja: ${sinFila.length}\n`);
  for (const c of cambios) {
    console.log(`   ${c.nombre.slice(0, 32).padEnd(34)} ${c.de} → ${c.a} h/día`);
  }
  for (const s of sinFila) {
    console.log(`   ⚠ sin dato en la hoja, se deja igual: ${s}`);
  }

  if (!APLICAR) {
    console.log("\n(ensayo — usa --aplicar para escribir)");
    return;
  }

  for (const c of cambios) {
    await sql(`UPDATE core.persona SET horas_dia = $1 WHERE id = $2`, [c.a, c.id]);
  }

  const d = await sql<{ horas: string; n: number }>(
    `SELECT horas_dia::text horas, count(*)::int n
       FROM core.persona WHERE activo GROUP BY 1 ORDER BY 1`,
  );
  console.log(`\n✓ jornadas: ${d.map((x) => `${x.n} × ${x.horas} h`).join("  ·  ")}`);
}

main();
