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
 * En producción hace falta además un dominio común, y eso es lo que aporta
 * AUTH_COOKIE_DOMAIN.
 */
const PREFIJO_COOKIE = "authjs";

/** En producción todo va por HTTPS, y las cookies lo dicen. */
const seguras = process.env.NODE_ENV === "production";

/**
 * El dominio con el que se emite la cookie de sesión.
 *
 * Sin esto la cookie vale solo para el host exacto que la puso
 * —`gestor-actividad.sohersabim.com`— y el navegador no se la enseña a las
 * demás herramientas: cada una vuelve a pedir la cuenta. Con
 * `.sohersabim.com` vale para todos los subdominios y la sesión viaja.
 *
 * Vacío en local: ahí las cookies ya se comparten por dominio —el puerto no
 * cuenta— y fijar uno lo rompería.
 */
const DOMINIO_COOKIE = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

/**
 * Opciones comunes. `domain` solo se pone si hay uno definido.
 *
 * Antes la cookie de sesión se declaraba solo con su nombre, sin prefijo
 * `__Secure-` en producción. El portal sí lo pone, así que los nombres no
 * coincidían y una sesión emitida allá no se reconocía aquí: justo lo que
 * el inicio de sesión único quiere evitar.
 */
const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: seguras,
  ...(DOMINIO_COOKIE ? { domain: DOMINIO_COOKIE } : {}),
};

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
          access_type: "offline",
          /*
           * El `prompt` lo decide cada entrada, no esta configuración.
           *
           * `app/login/actions.ts` pide `consent` a quien todavía no tiene su
           * `refresh_token` —es la ÚNICA forma de que Google lo entregue— y
           * `select_account` al resto, que ya no necesita ver esa pantalla.
           *
           * Aquí se deja el caso seguro: si alguien llega por otra vía, pide
           * consentimiento. Sobra una pantalla, no falta un token.
           */
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  pages: { signIn: "/login", error: "/login" },
  cookies: {
    sessionToken: {
      name: `${seguras ? "__Secure-" : ""}${PREFIJO_COOKIE}.session-token`,
      options: { ...baseCookie },
    },
    callbackUrl: {
      name: `${seguras ? "__Secure-" : ""}${PREFIJO_COOKIE}.callback-url`,
      options: { ...baseCookie, httpOnly: false },
    },
    /* `__Host-` PROHÍBE el atributo `domain` —esa es su garantía: atar la
       cookie a un host—. Con dominio compartido baja a `__Secure-`; dejarlo
       en `__Host-` haría que el navegador la descarte en silencio y el login
       daría vueltas sin error visible. */
    csrfToken: {
      name: `${seguras ? (DOMINIO_COOKIE ? "__Secure-" : "__Host-") : ""}${PREFIJO_COOKIE}.csrf-token`,
      options: { ...baseCookie },
    },
    pkceCodeVerifier: {
      name: `${seguras ? "__Secure-" : ""}${PREFIJO_COOKIE}.pkce.code_verifier`,
      options: { ...baseCookie, maxAge: 900 },
    },
    state: {
      name: `${seguras ? "__Secure-" : ""}${PREFIJO_COOKIE}.state`,
      options: { ...baseCookie, maxAge: 900 },
    },
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
  /*
   * Noventa días, y se renueva cada día que se usa.
   *
   * Tiene que ser el MISMO plazo en las cinco herramientas. Comparten la
   * cookie de sesión, así que la que la considere vencida antes echa a la
   * persona aunque las demás la sigan dando por buena: se cerraba la sesión
   * "de la nada" en unas herramientas y en otras no.
   *
   * El acceso a Google se renueva aparte, en silencio, así que alargar esto
   * no concede nada a nadie: solo evita pedir la cuenta a quien nunca dejó
   * de trabajar aquí.
   */
  session: {
    strategy: "jwt",
    maxAge: 90 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  trustHost: true,
};
