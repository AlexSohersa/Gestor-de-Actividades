/**
 * AUTORIZACIÓN de Google para la ingesta.
 *
 *   npx tsx --env-file=.env.local scripts/autorizar-google.ts
 *
 * Obtiene un `refresh_token` de tu cuenta para que la ingesta pueda LEER las
 * hojas del gestor antiguo sin que tengas que estar presente cada vez.
 *
 * Cómo funciona: levanta un servidor en localhost, abre el navegador para que
 * autorices con tu cuenta de Google, recoge el código que Google devuelve y lo
 * canjea por un refresh_token. Ese token va a `.env.local`.
 *
 * El permiso que pide es de SOLO LECTURA sobre hojas de cálculo
 * (spreadsheets.readonly): la ingesta lee las hojas y escribe en la base de
 * datos, nunca al revés.
 *
 * REQUISITO: en Google Cloud Console, el cliente OAuth debe tener autorizado
 * el URI de redirección  http://localhost:53682/oauth2callback
 */

import { createServer } from "node:http";
import { google } from "googleapis";
import { spawn } from "node:child_process";

const PUERTO = 53682;
const REDIRECCION = `http://localhost:${PUERTO}/oauth2callback`;

const ID = process.env.AUTH_GOOGLE_ID;
const SECRETO = process.env.AUTH_GOOGLE_SECRET;

if (!ID || !SECRETO) {
  console.error(
    "Faltan AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET. Revisa .env.local.",
  );
  process.exit(1);
}

const cliente = new google.auth.OAuth2(ID, SECRETO, REDIRECCION);

const url = cliente.generateAuthUrl({
  access_type: "offline",
  // `consent` obliga a Google a devolver un refresh_token. Sin esto, si ya
  // habías autorizado antes, solo manda un access_token que caduca en una hora.
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

console.log("\n╭──────────────────────────────────────────────╮");
console.log("│  Autorización de Google para la ingesta      │");
console.log("╰──────────────────────────────────────────────╯\n");
console.log("Se abrirá el navegador. Entra con la cuenta que tenga acceso");
console.log("a la hoja «SOH-SI-BD_BASES DE DATOS» y acepta el permiso de");
console.log("lectura de hojas de cálculo.\n");
console.log("Si el navegador no se abre solo, entra a esta dirección:\n");
console.log(`  ${url}\n`);

const servidor = createServer(async (peticion, respuesta) => {
  if (!peticion.url?.startsWith("/oauth2callback")) {
    respuesta.writeHead(404).end();
    return;
  }

  const parametros = new URL(peticion.url, `http://localhost:${PUERTO}`)
    .searchParams;
  const codigo = parametros.get("code");
  const error = parametros.get("error");

  // La respuesta al navegador va en HTML para que la persona vea algo legible
  // y sepa que ya puede cerrar la pestaña.
  function responder(titulo: string, mensaje: string, color: string) {
    respuesta.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    respuesta.end(`<!doctype html><html lang="es"><meta charset="utf-8">
      <title>${titulo}</title>
      <body style="font-family:system-ui;background:#F4F6FA;color:#0A1A3C;
                   display:grid;place-items:center;height:100vh;margin:0">
        <div style="text-align:center;max-width:26rem;padding:2rem">
          <div style="width:44px;height:44px;border-radius:12px;background:#0A1526;
                      border:1.5px solid ${color};margin:0 auto 1.5rem"></div>
          <h1 style="font-size:1.25rem;margin:0 0 .5rem">${titulo}</h1>
          <p style="color:#44556E;line-height:1.6;margin:0">${mensaje}</p>
        </div>
      </body></html>`);
  }

  if (error) {
    responder(
      "No se autorizó",
      `Google devolvió: ${error}. Puedes cerrar esta pestaña e intentarlo de nuevo.`,
      "#E0364F",
    );
    console.error(`\n  ✗ Autorización cancelada: ${error}\n`);
    servidor.close();
    process.exitCode = 1;
    return;
  }

  if (!codigo) {
    respuesta.writeHead(400).end();
    return;
  }

  try {
    const { tokens } = await cliente.getToken(codigo);

    if (!tokens.refresh_token) {
      responder(
        "Falta el token de refresco",
        "Google no devolvió un refresh_token. Revoca el acceso de la aplicación " +
          "en tu cuenta de Google y vuelve a intentarlo.",
        "#E69500",
      );
      console.error(
        "\n  ✗ Google no devolvió refresh_token.\n" +
          "    Entra a https://myaccount.google.com/permissions, revoca el\n" +
          "    acceso de esta aplicación y vuelve a correr el script.\n",
      );
      servidor.close();
      process.exitCode = 1;
      return;
    }

    responder(
      "Listo",
      "Ya puedes cerrar esta pestaña y volver a la terminal.",
      "#5BBF21",
    );

    console.log("\n  ✓ Autorización concedida.\n");
    console.log("  Añade esta línea a tu .env.local:\n");
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log("  Después ya puedes correr:\n");
    console.log("    npm run ingesta:hojas          (simulacro)");
    console.log("    npm run ingesta:hojas -- --aplicar\n");

    servidor.close();
  } catch (e) {
    responder(
      "Error al canjear el código",
      "Mira la terminal para ver el detalle.",
      "#E0364F",
    );
    console.error("\n  ✗ ", e instanceof Error ? e.message : e, "\n");
    servidor.close();
    process.exitCode = 1;
  }
});

servidor.listen(PUERTO, () => {
  // `start` en Windows, `open` en macOS, `xdg-open` en Linux.
  const abridor =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  try {
    spawn(abridor[0] as string, abridor[1] as string[], {
      stdio: "ignore",
      detached: true,
    }).unref();
  } catch {
    // Si no se puede abrir el navegador no pasa nada: la dirección ya está
    // impresa arriba para copiarla a mano.
  }

  console.log("Esperando a que autorices…\n");
});
