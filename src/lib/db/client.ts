import { PrismaClient } from "@prisma/client";

/**
 * Cliente único de Prisma.
 *
 * Se guarda en `globalThis` porque el hot-reload de desarrollo vuelve a
 * evaluar este módulo en cada recarga; sin la caché se abriría una conexión
 * nueva cada vez hasta agotar el pool de Neon.
 *
 * Habla con DOS schemas —`actividad` (nuestro) y `core` (compartido)— sobre una
 * sola conexión. Ver prisma/schema.prisma.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
