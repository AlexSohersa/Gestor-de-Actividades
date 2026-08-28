import "server-only";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";

/**
 * ¿Le dieron acceso a esta herramienta desde el Digital Core?
 *
 * El reparto de herramientas se hace en un solo sitio —la pantalla de
 * Permisos del portal— y se guarda en `public."TeamMember".hiddenApps`. Ahí
 * se apunta lo que se QUITA, no lo que se da: así una herramienta nueva la ve
 * todo el mundo desde el primer día, y quien nunca se ha tocado tiene la
 * lista vacía, que significa «ve todo».
 *
 * Esta herramienta lo consulta en vez de decidirlo por su cuenta. Tener
 * cuenta aquí no basta: si en el portal le quitaron el Gestor, no entra,
 * aunque su correo esté en el padrón y tenga horas registradas.
 *
 * Se consulta con SQL suelto y no con el modelo de Prisma a propósito:
 * `TeamMember` vive en el esquema `public`, que es del portal, y este
 * proyecto solo declara `actividad` y `core`. Añadir el modelo aquí crearía
 * dos dueños para la misma tabla —dos sitios desde donde escribirla— cuando
 * lo único que hace falta es leer un dato.
 */
const ID_HERRAMIENTA = "gestor-actividad";

/**
 * `true` si esa persona puede entrar.
 *
 * Ante la duda, deja pasar: si la consulta falla —la base no responde, la
 * tabla no está— la herramienta sigue funcionando. Un permiso es para repartir
 * el trabajo, no una barrera de seguridad; la barrera es el inicio de sesión,
 * que va antes. Cerrar el paso porque una consulta auxiliar falló dejaría a
 * todo el mundo fuera por un problema que no tiene que ver con ellos.
 */
export async function tieneAcceso(correo: string): Promise<boolean> {
  try {
    const filas = await db.$queryRaw<{ hiddenApps: string[] }[]>`
      select "hiddenApps" from public."TeamMember" where email = ${correo} limit 1
    `;
    const ocultas = filas[0]?.hiddenApps ?? [];
    return !ocultas.includes(ID_HERRAMIENTA);
  } catch {
    return true;
  }
}

/** La dirección del portal, para devolver ahí a quien no tiene acceso. */
export function urlDelPortal(): string {
  return process.env.NEXT_PUBLIC_URL_DIGITAL_CORE ?? "https://digital-core.sohersabim.com";
}

/**
 * Lo que necesita el layout: quién es y si puede pasar.
 *
 * Devuelve `null` cuando no hay sesión —de eso ya se encarga el middleware— y
 * `{ correo, puede: false }` cuando hay sesión pero le quitaron la herramienta.
 */
export async function estadoDeAcceso(): Promise<{ correo: string; puede: boolean } | null> {
  const sesion = await auth();
  const correo = sesion?.user?.email;
  if (!correo) return null;
  return { correo, puede: await tieneAcceso(correo) };
}
