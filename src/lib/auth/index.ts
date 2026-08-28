import NextAuth from "next-auth";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { authConfig } from "./config";
import { esCorreoPermitido } from "./dominio";

/**
 * Autenticación del Gestor de Actividad.
 *
 * Decisión de arquitectura: NO hay tabla de usuarios propia ni adaptador de
 * Prisma. El padrón de personas es `core.persona` y ya existe; crear un
 * `Usuario` aquí sería un segundo padrón que se desincroniza con el primero,
 * justo lo que la regla de `core` prohíbe.
 *
 * Lo que sí se guarda en core.persona es el `refresh_token` de Google, porque
 * Google solo lo entrega en el primer consentimiento y hace falta para escribir
 * en las hojas de cálculo en nombre de la persona.
 *
 * La sesión es JWT: sin tabla de sesiones, y compatible con el SSO por cookie
 * compartida con el portal y Deal Engine (ver config.ts).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

        /**
     * A dónde se vuelve después de iniciar sesión.
     *
     * Sin esto, NextAuth usa la dirección de `AUTH_URL`/`NEXTAUTH_URL`, y en
     * Vercel esa variable puede traer la dirección `.vercel.app` del proyecto
     * aunque la persona haya entrado por el subdominio propio. El resultado es
     * que entra bien pero acaba en otra dirección, y ahí su cookie —emitida
     * para `.sohersabim.com`— no vale: la siguiente herramienta le vuelve a
     * pedir la cuenta.
     *
     * `baseUrl` es el sitio desde el que se pidió el inicio de sesión. Se
     * respeta, y así la persona termina donde empezó.
     */
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // Una ruta relativa —"/hub"— se cuelga del sitio actual.
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      /* Una dirección absoluta solo se acepta si es del mismo sitio o de un
         subdominio hermano: así el salto entre herramientas sigue funcionando
         y nadie puede usar esto para mandar a la gente fuera. */
      try {
        const destino = new URL(url);
        const propio = new URL(baseUrl);
        const raiz = process.env.AUTH_COOKIE_DOMAIN?.trim();

        if (destino.host === propio.host) return url;
        if (raiz && destino.hostname.endsWith(raiz.replace(/^\./, ""))) return url;
      } catch {
        // Si no es una dirección válida, se cae al caso seguro de abajo.
      }

      return baseUrl;
    },

async signIn({ user, account }) {
      if (account?.provider !== "google") return false;
      if (!user.email) return false;
      if (!esCorreoPermitido(user.email)) return false;

      const correo = user.email.toLowerCase();

      // ¿Está en el padrón? Quien no esté NO entra: las tablas de `actividad`
      // exigen persona_id con clave foránea a core.persona, así que dejarle
      // pasar solo produciría errores al primer intento de reportar horas.
      // Dar de alta a alguien es tarea del padrón, no de esta pantalla.
      const persona = await db.persona.findFirst({
        where: { correos: { some: { correo } } },
        select: { id: true, activo: true },
      });

      if (!persona) return false;
      if (!persona.activo) return false;

      // Guardar el refresh_token si Google mandó uno nuevo. Si no llega, se
      // conserva el anterior: sobrescribir con null dejaría la sincronización
      // sin credenciales.
      if (account.refresh_token) {
        await db.persona.update({
          where: { id: persona.id },
          data: { googleRefresco: account.refresh_token },
        });

        /*
         * Marca en el navegador que esta persona ya concedió los permisos.
         *
         * El login no sabe quién eres antes de entrar, así que no puede mirar
         * el padrón para decidir si enseñar la pantalla de consentimiento.
         * Con esta cookie, la siguiente entrada es directa.
         */
        (await cookies()).set("soh.google-ok", "1", {
          maxAge: 60 * 60 * 24 * 365,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
        });
      }

      /*
       * La foto de perfil, pedida a Google en cada entrada.
       *
       * La que trae `user.image` caduca: al probarla, las direcciones
       * guardadas de dos personas distintas devolvían el MISMO monigote gris
       * de 1 124 bytes. Google no da error, simplemente sirve el avatar por
       * defecto, así que el fallo no se ve —y quien tenía la foto en la caché
       * del navegador la seguía viendo mientras los demás no.
       *
       * Pedida con el token de la persona, llega la de verdad (unos 8 KB).
       * Se guarda solo si vino algo: si Google no responde, se conserva la
       * anterior en vez de dejar a alguien sin ninguna.
       */
      const foto = account.access_token
        ? await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${account.access_token}` },
            signal: AbortSignal.timeout(8000),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => (j as { picture?: string } | null)?.picture ?? null)
            .catch(() => null)
        : null;

      if (foto ?? user.image) {
        await db.persona.update({
          where: { id: persona.id },
          data: { foto: foto ?? user.image },
        });
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },

    async session({ session, token }) {
      // Se resuelve por CORREO, no por id: es lo que permite que la cookie
      // emitida por el portal (con sus propios ids) sirva aquí.
      if (token.email) session.user.email = token.email as string;
      return session;
    },
  },
});
