import "server-only";
import { google } from "googleapis";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth";

/**
 * Las credenciales de Google DE LA PERSONA que está usando la herramienta.
 *
 * Es como lo hace el Digital Core: cada quien escribe en las hojas y manda
 * correo con su propia cuenta, no con la de un tercero. Así la fila de la hoja
 * y el correo salen a nombre de quien hizo la acción, que es lo correcto y lo
 * que ya funcionaba.
 *
 * Google entrega el `refresh_token` UNA sola vez, en el primer consentimiento.
 * Por eso se guarda en `core.persona.google_refresco` al entrar (ver
 * `lib/auth/index.ts`) y se recupera de ahí: una sesión abierta hace horas ya
 * no lo lleva encima, y sin él la escritura moriría en cuanto caduca el token
 * de acceso, que dura una hora.
 */

/** Nadie con sesión, o su cuenta sin permisos de Google todavía. */
export class SinCredenciales extends Error {}

/**
 * El cliente OAuth de quien tiene la sesión abierta.
 *
 * Lanza `SinCredenciales` si no hay sesión o si esa persona nunca concedió los
 * permisos: quien llama decide si eso es un error o algo que puede esperar.
 */
export async function clienteDeLaPersona() {
  const sesion = await auth();
  const correo = sesion?.user?.email?.toLowerCase();

  if (!correo) {
    throw new SinCredenciales("No hay sesión activa.");
  }

  const persona = await db.persona.findFirst({
    where: { correos: { some: { correo } } },
    select: { id: true, googleRefresco: true },
  });

  if (!persona?.googleRefresco) {
    throw new SinCredenciales(
      "Tu cuenta todavía no autorizó a Google. Cierra sesión y vuelve a entrar.",
    );
  }

  const oauth = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );

  // Solo el refresh token: la librería pide un acceso nuevo cuando lo necesita
  // y lo renueva sola. Es lo que sostiene el caso de alguien que lleva la
  // pestaña abierta desde la mañana y marca su salida por la tarde.
  oauth.setCredentials({ refresh_token: persona.googleRefresco });

  /*
   * Si Google entrega un refresh token NUEVO, se guarda.
   *
   * Al renovar el acceso, Google puede devolver también un refresh token
   * distinto y dar por caducado el anterior. Sin guardarlo, se seguiría usando
   * el viejo hasta que dejara de servir, y esa persona perdería la escritura
   * en las hojas sin que nada lo avisara —hasta que volviera a entrar.
   *
   * No se espera a que termine: es mantenimiento, y la escritura que lo
   * provocó no debe retrasarse por esto. Si falla, el token viejo sigue
   * sirviendo mientras tanto.
   */
  oauth.on("tokens", (t) => {
    if (!t.refresh_token) return;
    void db.persona
      .update({
        where: { id: persona.id },
        data: { googleRefresco: t.refresh_token },
      })
      .catch((e: unknown) => {
        console.error(
          "[google] No se pudo guardar el token renovado de",
          correo,
          e instanceof Error ? e.message : e,
        );
      });
  });

  return oauth;
}

/**
 * Credenciales de respaldo, para cuando NO hay una persona detrás.
 *
 * Los scripts de línea de comandos —la ingesta, la limpieza— corren sin sesión
 * y necesitan algo con lo que autenticarse. También cubre el caso de una tarea
 * en segundo plano que sobreviva a la petición que la lanzó.
 *
 * Devuelve `null` si no hay ninguna configurada, que es lo normal: en el uso
 * diario manda siempre la cuenta de la persona.
 */
export function clienteDeRespaldo() {
  const correo = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const llave = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (correo && llave) {
    return new google.auth.JWT({
      email: correo,
      key: llave.replace(/\\n/g, "\n"),
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    });
  }

  const refresco = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (refresco) {
    const oauth = new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET,
    );
    oauth.setCredentials({ refresh_token: refresco });
    return oauth;
  }

  return null;
}

/**
 * Lo primero que haya: la persona, y si no, el respaldo.
 *
 * Este es el orden que importa. Con sesión, la fila lleva el nombre de quien
 * la creó; sin ella —un script, una tarea suelta— se recurre al respaldo si
 * existe.
 */
export async function credencialesGoogle() {
  try {
    return await clienteDeLaPersona();
  } catch (e) {
    if (!(e instanceof SinCredenciales)) throw e;
    return clienteDeRespaldo();
  }
}
