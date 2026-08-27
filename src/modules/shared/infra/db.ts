// Capa shared · infraestructura de datos.
//
// Los módulos del Gestor (actividad, ausencias, tickets, equipo, proyectos) NO
// crean su propio PrismaClient: reutilizan el cliente único para no abrir un
// segundo pool de conexiones contra Neon.
//
// Regla de arquitectura: SOLO la capa `infrastructure` de cada módulo importa
// esto. La capa `application` habla con la base a través de los "ports"
// (interfaces), nunca importando `db` directamente. La capa `domain` no conoce
// ni Prisma ni esta base — es lógica pura.
export { db } from "@/lib/db/client";
