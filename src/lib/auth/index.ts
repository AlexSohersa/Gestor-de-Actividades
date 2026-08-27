import NextAuth from "next-auth";
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
      }

      // La foto de Google, si la persona no tiene una propia en el padrón.
      if (user.image) {
        await db.persona.updateMany({
          where: { id: persona.id, foto: null },
          data: { foto: user.image },
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
