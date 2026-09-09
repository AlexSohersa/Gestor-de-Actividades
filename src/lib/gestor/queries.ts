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

/**
 * Los tipos de ausencia que se pueden pedir HOY.
 *
 * Fijos y no del catálogo del portal: ahí quedaban once, con tres que ya no se
 * usan —"AUSENCIA" a secas, "CAMBIO DE HORARIO" y "OTRO"— y que solo servían
 * para que la gente eligiera mal. Los históricos con esos tipos se conservan;
 * lo que desaparece es la posibilidad de pedir uno nuevo.
 *
 * El orden es el de uso: las vacaciones arriba, lo excepcional abajo.
 */
const TIPOS_AUSENCIA = [
  "VACACIONES",
  "TIEMPO POR TIEMPO",
  "PERMISO CON GOCE DE SUELDO",
  "PERMISO SIN GOCE DE SUELDO",
  "INCAPACIDAD",
  "HOME OFFICE",
  "LLEGADA TARDE",
  "SALIDA TEMPRANO",
] as const;

export async function catalogoAusencias(): Promise<string[]> {
  return [...TIPOS_AUSENCIA];
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

/**
 * Todo el mundo activo, para elegir quién cubre una ausencia.
 *
 * No es `listaAprobadores`: ahí solo salen coordinadores y dirección, y a
 * quien te cubre casi nunca es tu jefe —es la persona de al lado que sabe
 * llevar tus pendientes—. Aquí sale la plantilla entera.
 *
 * Se devuelve el nombre de pila que usa cada quien (`nombre_usuario`) cuando
 * lo hay: es como se conocen entre ellos, y es lo que se teclea al buscar.
 */
export async function padronActivo(): Promise<
  { id: string; nombre: string }[]
> {
  const filas = await db.persona.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, nombreUsuario: true },
    orderBy: { nombre: "asc" },
  });

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombreUsuario ?? f.nombre,
  }));
}
