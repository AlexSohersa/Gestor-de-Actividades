import "server-only";
import { google } from "googleapis";
import { credencialesGoogle } from "./credenciales";

/**
 * Envío de correo por Gmail, con la misma cuenta que escribe en las hojas.
 *
 * Réplica de `MailApp.sendEmail` del Apps Script. El permiso `gmail.send` ya
 * está concedido en el token de siempre, así que no hace falta autorizar nada
 * nuevo.
 *
 * Como en Dynamics: no lanza. Un correo que no sale no puede tumbar el ticket
 * —ya está guardado—, pero el motivo tiene que llegar a la pantalla.
 */

export type ResultadoCorreo =
  | { ok: true; destinatarios: string[] }
  | { ok: false; motivo: string };

/**
 * Gmail con la cuenta de QUIEN ESTÁ USANDO la herramienta.
 *
 * El aviso del ticket sale del correo de quien lo levantó, como en el Digital
 * Core: quien lo recibe ve de quién viene y puede responderle.
 */
async function cliente() {
  const auth = await credencialesGoogle();
  if (!auth) return null;
  return google.gmail({ version: "v1", auth });
}

/** ¿Se puede enviar correo? La pantalla lo usa para no prometer de más. */
export async function correoConfigurado(): Promise<boolean> {
  return (await cliente()) !== null;
}

/**
 * Un asunto con acentos necesita ir codificado.
 *
 * La cabecera de un correo es ASCII: sin esto, "Reparación" llega como
 * "ReparaciÃ³n" en el buzón de quien lo recibe.
 */
function asuntoCodificado(texto: string): string {
  return `=?UTF-8?B?${Buffer.from(texto, "utf-8").toString("base64")}?=`;
}

export async function enviarCorreo(datos: {
  para: string[];
  asunto: string;
  html: string;
}): Promise<ResultadoCorreo> {
  const gmail = await cliente();
  if (!gmail) {
    return { ok: false, motivo: "El correo no está configurado en este entorno." };
  }

  const destinatarios = datos.para
    .map((c) => c.trim())
    .filter((c) => c.includes("@"));

  if (destinatarios.length === 0) {
    return { ok: false, motivo: "No hay ninguna dirección a la que enviar." };
  }

  const mensaje = [
    `To: ${destinatarios.join(", ")}`,
    `Subject: ${asuntoCodificado(datos.asunto)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(datos.html, "utf-8").toString("base64"),
  ].join("\r\n");

  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        // Base64 de URL: la API rechaza los caracteres `+` y `/` del normal.
        raw: Buffer.from(mensaje, "utf-8").toString("base64url"),
      },
    });
    return { ok: true, destinatarios };
  } catch (e) {
    const m =
      e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    return { ok: false, motivo: m.split("\n")[0].slice(0, 200) };
  }
}
