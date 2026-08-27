import "server-only";

/**
 * Los tipos y consultas que esperan las pantallas migradas.
 *
 * Las pantallas (`ActividadScreen`, `AusenciasScreen`, `DashboardHoras`…) vienen
 * tal cual de la plataforma y se dejan intactas a propósito: son el diseño
 * aprobado, y tocarlas para adaptarlas a otra forma de datos solo abriría la
 * puerta a que las dos versiones se separen.
 *
 * Este archivo es el ADAPTADOR: mantiene la misma firma que tenían allá y por
 * dentro consulta los módulos de esta herramienta, que leen de `actividad` y
 * `core` en vez de `public`.
 */

import { db } from "@/lib/db/client";

/** Una opción de catálogo, tal como la consumen los combos de las pantallas. */
export type Opcion = { value: string; parent: string; extra: string | null };

/**
 * Los catálogos de la pantalla de captura.
 *
 * Salen de `public.Catalog`, que es el MISMO catálogo que usa el Digital Core:
 * 215 proyectos y 2 092 entregables, curados a mano. Reconstruirlos desde
 * `core.proyecto` ofrecía 371 proyectos —todos los del padrón, incluidos los
 * cerrados y los que nadie reporta— y el buscador devolvía cosas que no vienen
 * a cuento.
 *
 * `parent` enlaza cada entregable con su proyecto; `extra` trae la disciplina,
 * que el formulario rellena solo al elegir entregable. Es la misma tabla
 * lookup que tenían las hojas.
 *
 * Nota: `Catalog` vive en `public`, que es del portal. Aquí solo se LEE, nunca
 * se escribe. Cuando el portal se retire habrá que traer esta tabla a `core`.
 */
export async function catalogosActividad(): Promise<{
  proyectos: Opcion[];
  entregables: Opcion[];
  tipos: Opcion[];
  esfuerzos: Opcion[];
}> {
  const filas = await db.$queryRaw<
    { kind: string; value: string; parent: string; extra: string | null }[]
  >`
    SELECT kind, value, parent, extra
    FROM public."Catalog"
    WHERE active AND kind IN ('proyecto', 'entregable', 'tipo', 'esfuerzo')
    ORDER BY kind, position, value
  `;

  const de = (kind: string): Opcion[] =>
    filas
      .filter((f) => f.kind === kind)
      .map((f) => ({ value: f.value, parent: f.parent, extra: f.extra }));

  return {
    proyectos: de("proyecto"),
    entregables: de("entregable"),
    tipos: de("tipo"),
    esfuerzos: de("esfuerzo"),
  };
}

/** Los tipos de ausencia, del mismo catálogo. */
export async function catalogoAusencias(): Promise<string[]> {
  const filas = await db.$queryRaw<{ value: string }[]>`
    SELECT value FROM public."Catalog"
    WHERE active AND kind = 'ausencia'
    ORDER BY position, value
  `;
  return filas.map((f) => f.value);
}

/** Las fallas de mantenimiento, agrupadas por SOFTWARE / HARDWARE. */
export async function catalogoFallas(): Promise<
  { value: string; parent: string }[]
> {
  const filas = await db.$queryRaw<{ value: string; parent: string }[]>`
    SELECT value, parent FROM public."Catalog"
    WHERE active AND kind = 'falla'
    ORDER BY parent, position, value
  `;
  return filas;
}

/** El saldo de vacaciones, con la forma que espera la pantalla de ausencias. */
export type SaldoVacaciones = {
  /** Días que se pueden tomar hoy: bloques ya liberados y sin vencer. */
  disponibles: number;
  /** Días ya consumidos. */
  usados: number;
  /** Bloques disponibles, del que vence antes al que vence después. */
  bloques: {
    dias: number;
    usados: number;
    vence: string;
    periodo: string | null;
  }[];
  /** Bloques que todavía no se liberan, con la fecha en que lo harán. */
  liberaciones: { dias: number; fecha: string; periodo: string | null }[];
};

/** Quién puede recibir una solicitud. */
export async function listaAprobadores(): Promise<
  { email: string; userName: string; correo: string | null }[]
> {
  const filas = await db.persona.findMany({
    where: {
      activo: true,
      roles: {
        some: {
          herramientaClave: "actividad",
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

  /*
   * `email` lleva el ID de la persona: es la identidad real y lo que viaja al
   * servidor. Se llama así por la pantalla del portal, que lo nombraba de esa
   * forma cuando la identidad SÍ era el correo.
   *
   * `correo` es el correo de verdad, solo para que se lea debajo del nombre.
   * Antes se mostraba el id ("a-orozco"), que no le dice nada a nadie.
   */
  return filas.map((f) => ({
    email: f.id,
    userName: f.nombre,
    correo: f.correos[0]?.correo ?? null,
  }));
}
