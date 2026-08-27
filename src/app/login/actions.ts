"use server";

import { cookies } from "next/headers";
import { signIn } from "@/lib/auth";

/**
 * Marca de "esta persona ya concedió los permisos".
 *
 * El login no sabe quién eres ANTES de entrar, así que no puede consultar el
 * padrón para decidir si hace falta la pantalla de consentimiento. Esta cookie
 * lo recuerda en el navegador: se pone cuando el `refresh_token` queda
 * guardado, y dura un año.
 *
 * Si se pierde —otro equipo, navegador limpio—, lo único que pasa es que se ve
 * la pantalla de permisos una vez más. Nada se rompe.
 */
const COOKIE = "soh.google-ok";

/**
 * Entrada normal.
 *
 * Sin la marca se pide consentimiento, porque es la ÚNICA forma de que Google
 * entregue un `refresh_token` —y sin él no se puede escribir en las hojas ni
 * mandar correo—. Con ella basta el selector de cuenta, que es más rápido y no
 * vuelve a preguntar nada.
 */
export async function entrarConGoogle(destino = "/actividad") {
  const yaConsintio = (await cookies()).get(COOKIE)?.value === "1";
  await signIn(
    "google",
    { redirectTo: destino },
    { prompt: yaConsintio ? "select_account" : "consent" },
  );
}

/**
 * Fuerza la pantalla de permisos.
 *
 * Para cuando alguien los concedió a medias, cuando Google revoca el token
 * guardado, o cuando la foto de perfil deja de cargar porque su enlace
 * caducó: todo eso se arregla volviendo a pasar por Google.
 */
export async function reconectarGoogle(destino = "/actividad") {
  await signIn("google", { redirectTo: destino }, { prompt: "consent" });
}
