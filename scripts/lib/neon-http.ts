/**
 * Consultas a Neon por HTTP, sin el puerto 5432.
 *
 * Desde esta máquina el puerto de Postgres no llega al servidor —el TCP abre
 * pero el saludo nunca termina—, mientras que el endpoint SQL sobre HTTPS
 * responde al instante. Es la misma base y el mismo motor: solo cambia por
 * dónde entra la consulta.
 *
 * Se usa en los scripts de despliegue para no depender de una red que aquí no
 * funciona. La aplicación en Vercel sí usa el puerto normal a través de
 * Prisma; esto es solo para operar desde aquí.
 */

const CADENA = process.env.DATABASE_URL_PRODUCCION;

if (!CADENA || !CADENA.includes("neon.tech")) {
  throw new Error("DATABASE_URL_PRODUCCION no apunta a Neon.");
}

const partes = CADENA.match(
  /postgresql:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)/,
);
if (!partes) throw new Error("No se pudo leer DATABASE_URL_PRODUCCION.");

const [, usuario, clave, hostCrudo, bd] = partes;

// El endpoint HTTP vive en el host SIN "-pooler".
const HOST = hostCrudo.replace("-pooler", "");
const CONEXION = `postgresql://${usuario}:${clave}@${HOST}/${bd}?sslmode=require`;

export const servidor = HOST;

/**
 * Lanza una sentencia y devuelve sus filas.
 *
 * `params` viaja aparte para que los valores no se peguen al texto: es lo que
 * impide que un nombre con comillas rompa la consulta.
 */
export async function sql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const r = await fetch(`https://${HOST}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": CONEXION,
    },
    body: JSON.stringify({ query, params }),
    signal: AbortSignal.timeout(120_000),
  });

  const texto = await r.text();

  if (!r.ok) {
    let detalle = texto.slice(0, 300);
    try {
      const j = JSON.parse(texto) as { message?: string };
      if (j.message) detalle = j.message;
    } catch {
      /* si no es JSON, se queda el texto crudo */
    }
    throw new Error(`Neon respondió ${r.status}: ${detalle}`);
  }

  return (JSON.parse(texto) as { rows: T[] }).rows;
}

/** Para sentencias que no devuelven filas (ALTER, UPDATE, CREATE…). */
export async function ejecutar(query: string, params: unknown[] = []) {
  await sql(query, params);
}
