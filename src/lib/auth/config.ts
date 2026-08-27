import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

/**
 * Scopes de Google.
 *
 * Además de identificar, se pide permiso de Sheets porque la sincronización con
 * el gestor antiguo escribe en la BDD maestra a nombre de quien está usando la
 * herramienta (no hay cuenta de servicio).
 *
 * Son los MISMOS que piden el portal y Deal Engine: Google concede permisos por
 * cuenta, no por aplicación, así que pedir la misma lista evita que aparezca
 * una segunda pantalla de consentimiento al saltar entre herramientas.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

/**
 * Prefijo de cookie COMPARTIDO — esta es la pieza que hace el inicio de sesión
 * único con el portal (:3000), Deal Engine (:3001) y Evaluación 360 (:3003).
 *
 * En localhost las cookies se comparten por dominio (el puerto no cuenta), así
 * que la sesión que emite una la reconocen las otras. Requisitos:
 *   1. Mismo AUTH_SECRET en todas.
 *   2. Que el callback de sesión busque a la persona por CORREO, no por id:
 *      cada app tiene sus propios ids y no coinciden.
 *
 * En producción hace falta además un dominio común (.sohersa.com).
 */
const PREFIJO_COOKIE = "authjs";

/**
 * Configuración base — SIN el adaptador de Prisma, para que pueda evaluarse en
 * el runtime Edge del middleware. La configuración completa vive en index.ts.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES.join(" "),
          // offline + el refresh_token guardado en core.persona: sin esto no se
          // puede escribir en Sheets cuando la persona no está mirando.
          access_type: "offline",
          prompt: "select_account",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  pages: { signIn: "/login", error: "/login" },
  cookies: {
    sessionToken: { name: `${PREFIJO_COOKIE}.session-token` },
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // Lógica invertida (más segura): TODO exige sesión salvo estas rutas.
      // Así una sección nueva queda protegida sin tener que acordarse de
      // añadirla a una lista blanca.
      const p = nextUrl.pathname;
      const esPublica =
        p.startsWith("/login") || p.startsWith("/api/auth");

      if (esPublica) return true;

      // Con el atajo de desarrollo activo la identidad no viene de la cookie,
      // así que este guardia rebotaría al login. Solo fuera de producción.
      if (
        process.env.NODE_ENV !== "production" &&
        process.env.DEV_CORREO_SIMULADO
      ) {
        return true;
      }

      return !!auth?.user;
    },
  },
  session: { strategy: "jwt" },
  trustHost: true,
};
