// Módulo Identidad · INFRAESTRUCTURA · Repositorio Prisma.
//
// La ÚNICA capa que conoce Prisma y los nombres de las tablas. Convierte filas
// de core.persona en la entidad de dominio `Persona`.

import "server-only";
import { db } from "@/modules/shared/infra/db";
import {
  HERRAMIENTA,
  normalizarCorreo,
  type Persona,
  type Rol,
  type Seccion,
  SECCIONES,
} from "../domain/persona.entity";
import type { MiembroEquipo, PersonaRepository } from "../application/ports";

/// Lo que hay que traer de la base para armar una `Persona`. Se define una vez
/// para que las tres consultas devuelvan exactamente lo mismo.
const SELECCION = {
  id: true,
  nombre: true,
  nombreUsuario: true,
  numero: true,
  puesto: true,
  area: true,
  horasDia: true,
  fechaIngreso: true,
  foto: true,
  coordinadorId: true,
  activo: true,
  esAdmin: true,
  correos: { where: { principal: true }, select: { correo: true }, take: 1 },
  roles: {
    where: { herramientaClave: HERRAMIENTA },
    select: { rolClave: true, seccionesOcultas: true },
    take: 1,
  },
} as const;

type FilaPersona = {
  id: string;
  nombre: string;
  nombreUsuario: string | null;
  numero: string | null;
  puesto: string | null;
  area: string | null;
  horasDia: unknown;
  fechaIngreso: Date | null;
  foto: string | null;
  coordinadorId: string | null;
  activo: boolean;
  esAdmin: boolean;
  correos: { correo: string }[];
  roles: { rolClave: string; seccionesOcultas: string[] }[];
};

/// Filtra a los valores que el dominio reconoce: la base guarda texto libre y
/// una sección retirada del código no debe romper la pantalla.
function soloSecciones(valores: string[]): Seccion[] {
  return valores.filter((s): s is Seccion =>
    (SECCIONES as readonly string[]).includes(s),
  );
}

/**
 * De fila de Prisma a entidad de dominio.
 *
 * Quien no tenga papel asignado en ESTA herramienta entra como COLABORADOR:
 * puede reportar sus horas y pedir permisos, que es el mínimo razonable. No se
 * le niega el acceso porque falte una fila en core.persona_rol.
 */
function aDominio(f: FilaPersona): Persona {
  const asignacion = f.roles[0];
  return {
    id: f.id,
    nombre: f.nombre,
    nombreUsuario: f.nombreUsuario,
    numero: f.numero,
    puesto: f.puesto,
    area: f.area,
    horasDia: Number(f.horasDia),
    fechaIngreso: f.fechaIngreso,
    foto: f.foto,
    coordinadorId: f.coordinadorId,
    activo: f.activo,
    esAdmin: f.esAdmin,
    correo: f.correos[0]?.correo ?? null,
    rol: (asignacion?.rolClave as Rol) ?? "COLABORADOR",
    seccionesOcultas: soloSecciones(asignacion?.seccionesOcultas ?? []),
  };
}

export const prismaPersonaRepository: PersonaRepository = {
  async porCorreo(correo) {
    // La búsqueda por la tabla de correos, no por un campo `email` en persona:
    // es lo que permite que alguien entre con su Gmail y siga siendo la misma
    // persona que reportó horas con el correo de empresa.
    const fila = await db.persona.findFirst({
      where: { correos: { some: { correo: normalizarCorreo(correo) } } },
      select: SELECCION,
    });
    return fila ? aDominio(fila as FilaPersona) : null;
  },

  async porId(id) {
    const fila = await db.persona.findUnique({ where: { id }, select: SELECCION });
    return fila ? aDominio(fila as FilaPersona) : null;
  },

  async listarEquipo() {
    const filas = await db.persona.findMany({
      where: { tipo: { not: "SISTEMA" } },
      select: {
        ...SELECCION,
        coordinador: { select: { nombre: true } },
        accesos: {
          where: { herramientaClave: HERRAMIENTA },
          select: { ultimaVez: true, visitas: true },
          take: 1,
        },
      },
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    });

    return filas.map((f) => {
      const acceso = f.accesos[0];
      return {
        ...aDominio(f as unknown as FilaPersona),
        coordinadorNombre: f.coordinador?.nombre ?? null,
        ultimaVez: acceso?.ultimaVez ?? null,
        visitas: acceso?.visitas ?? 0,
      };
    }) satisfies MiembroEquipo[];
  },

  async listarAprobadores() {
    // Un aprobador es quien tiene papel de coordinador (o más) EN ESTA
    // herramienta. Se listan para poblar el selector de "enviar a".
    const filas = await db.persona.findMany({
      where: {
        activo: true,
        roles: {
          some: {
            herramientaClave: HERRAMIENTA,
            rolClave: { in: ["COORDINADOR", "ADMIN", "DIRECCION"] },
          },
        },
      },
      select: {
        id: true,
        nombre: true,
        correos: { where: { principal: true }, select: { correo: true }, take: 1 },
      },
      orderBy: { nombre: "asc" },
    });

    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      correo: f.correos[0]?.correo ?? null,
    }));
  },

  async aCargoDe(coordinadorId) {
    const filas = await db.persona.findMany({
      where: { coordinadorId, activo: true },
      select: { id: true },
    });
    return filas.map((f) => f.id);
  },

  async cambiarPermiso(personaId, cambio, hechoPor) {
    // Todo en una transacción: si falla la bitácora, no queda un cambio de
    // permisos sin rastro.
    await db.$transaction(async (tx) => {
      const antes = await tx.personaRol.findUnique({
        where: {
          personaId_herramientaClave: {
            personaId,
            herramientaClave: HERRAMIENTA,
          },
        },
        select: { rolClave: true },
      });

      // Lo que vive en core.persona (no depende de la herramienta).
      if (
        cambio.activo !== undefined ||
        cambio.esAdmin !== undefined ||
        cambio.coordinadorId !== undefined
      ) {
        await tx.persona.update({
          where: { id: personaId },
          data: {
            ...(cambio.activo !== undefined ? { activo: cambio.activo } : {}),
            ...(cambio.esAdmin !== undefined ? { esAdmin: cambio.esAdmin } : {}),
            ...(cambio.coordinadorId !== undefined
              ? { coordinadorId: cambio.coordinadorId }
              : {}),
          },
        });
      }

      // Lo que vive en core.persona_rol (papel y secciones EN ESTA herramienta).
      if (cambio.rol !== undefined || cambio.seccionesVisibles !== undefined) {
        // Se guarda el COMPLEMENTO de lo visible: así una sección que se agregue
        // mañana la ve todo el mundo por omisión, sin tener que tocar 53 filas.
        const ocultas =
          cambio.seccionesVisibles !== undefined
            ? SECCIONES.filter((s) => !cambio.seccionesVisibles!.includes(s))
            : undefined;

        await tx.personaRol.upsert({
          where: {
            personaId_herramientaClave: {
              personaId,
              herramientaClave: HERRAMIENTA,
            },
          },
          create: {
            personaId,
            herramientaClave: HERRAMIENTA,
            rolClave: cambio.rol ?? "COLABORADOR",
            seccionesOcultas: ocultas ?? [],
            asignadoPor: hechoPor,
          },
          update: {
            ...(cambio.rol !== undefined ? { rolClave: cambio.rol } : {}),
            ...(ocultas !== undefined ? { seccionesOcultas: ocultas } : {}),
            asignadoPor: hechoPor,
          },
        });
      }

      if (cambio.rol !== undefined && cambio.rol !== antes?.rolClave) {
        await tx.bitacoraPermiso.create({
          data: {
            personaId,
            herramientaClave: HERRAMIENTA,
            rolAntes: antes?.rolClave ?? null,
            rolDespues: cambio.rol,
            hechoPor,
          },
        });
      }
    });
  },

  async contarAdminsExcepto(personaId) {
    return db.persona.count({
      where: { esAdmin: true, activo: true, id: { not: personaId } },
    });
  },

  async registrarVisita(personaId) {
    const ahora = new Date();
    await db.acceso.upsert({
      where: {
        personaId_herramientaClave: { personaId, herramientaClave: HERRAMIENTA },
      },
      create: {
        personaId,
        herramientaClave: HERRAMIENTA,
        primeraVez: ahora,
        ultimaVez: ahora,
        visitas: 1,
      },
      update: { ultimaVez: ahora, visitas: { increment: 1 } },
    });
  },
};
