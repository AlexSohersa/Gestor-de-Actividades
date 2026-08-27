"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db/client";
import { OCULTABLES } from "@/lib/sections";
import { exigirPersona } from "@/modules/identidad/infrastructure/wiring";
import {
  HERRAMIENTA,
  ROLES as ROLES_VALIDOS,
  veToda,
} from "@/modules/identidad/domain/persona.entity";

/**
 * Quién aprueba a quién, y quién ve qué.
 *
 * En el Gestor de Sheets esto vivía escrito a mano dentro del script —el
 * aprobador final estaba puesto como texto, `'MATEO CAÑOLA'`— y cambiarlo
 * exigía editar código. Aquí son filas de `core.persona` y `core.persona_rol`.
 *
 * ⚠️ El primer parámetro se sigue llamando `email` porque `EquipoScreen` viene
 * copiada de la plataforma sin retocar y allá la identidad era el correo. AQUÍ
 * RECIBE EL ID DE `core.persona`: la pantalla lo alimenta desde el `email` de
 * `MiembroVista`, que la página rellena con el id. El correo nunca fue clave
 * fiable —la misma persona entra con su Gmail en una herramienta y con el de
 * empresa en otra—, así que se dejó el nombre del parámetro y se cambió lo que
 * viaja dentro.
 */

export type ResultadoEquipo = { ok: boolean; error?: string };

/**
 * Un rechazo de regla de negocio, no un fallo de la base.
 *
 * Se lanza desde dentro de la transacción —es la única forma de abortarla— y
 * se atrapa fuera para devolverlo como `{ok:false}` en vez de reventar la
 * pantalla con un error de servidor.
 */
class ErrorEquipo extends Error {}

/** Envuelve una transacción y traduce `ErrorEquipo` a un resultado. */
async function conRegla(
  trabajo: () => Promise<void>,
): Promise<ResultadoEquipo> {
  try {
    await trabajo();
  } catch (e) {
    if (e instanceof ErrorEquipo) return { ok: false, error: e.message };
    throw e;
  }
  return { ok: true };
}

/**
 * Quien está administrando, si de verdad puede.
 *
 * Devuelve el error en vez de redirigir: estas son Server Actions llamadas
 * desde un `useTransition`, y un `redirect()` a media transición deja la
 * pantalla sin decir por qué no pasó nada. Por eso no se usa `exigirAdmin`.
 */
async function administrador(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const persona = await exigirPersona();
  if (!veToda(persona)) {
    return { ok: false, error: "No tienes permiso para cambiar permisos." };
  }
  return { ok: true, id: persona.id };
}

/**
 * El papel de alguien en ESTA herramienta.
 *
 * Se escribe en `core.persona_rol`, no en `core.persona`: la misma persona
 * puede ser COORDINADOR aquí y COLABORADOR en otra herramienta, y por eso el
 * papel cuelga del par (persona, herramienta).
 */
export async function cambiarRol(
  email: string,
  rol: string,
): Promise<ResultadoEquipo> {
  const quien = await administrador();
  if (!quien.ok) return { ok: false, error: quien.error };

  if (!(ROLES_VALIDOS as readonly string[]).includes(rol)) {
    return { ok: false, error: "Ese rol no existe." };
  }

  await db.$transaction(async (tx) => {
    const previo = await tx.personaRol.findUnique({
      where: {
        personaId_herramientaClave: {
          personaId: email,
          herramientaClave: HERRAMIENTA,
        },
      },
      select: { rolClave: true, seccionesOcultas: true },
    });

    await tx.personaRol.upsert({
      where: {
        personaId_herramientaClave: {
          personaId: email,
          herramientaClave: HERRAMIENTA,
        },
      },
      // Quien nunca tuvo fila arranca sin nada oculto: se guarda lo escondido y
      // no lo permitido, así que el estado neutro es "lo ve todo".
      create: {
        personaId: email,
        herramientaClave: HERRAMIENTA,
        rolClave: rol,
        asignadoPor: quien.id,
      },
      update: { rolClave: rol, asignadoPor: quien.id },
    });

    // Un cambio de permisos sin rastro es indistinguible de un error de la
    // base: quién lo hizo y desde qué papel es justo lo que se pregunta después.
    await tx.bitacoraPermiso.create({
      data: {
        personaId: email,
        herramientaClave: HERRAMIENTA,
        rolAntes: previo?.rolClave ?? null,
        rolDespues: rol,
        hechoPor: quien.id,
      },
    });
  });

  revalidatePath("/equipo");
  revalidatePath("/ausencias");
  return { ok: true };
}

/**
 * A qué coordinador le toca esta persona.
 *
 * Es a quien se le proponen sus solicitudes por omisión; la persona todavía
 * puede elegir a otro al mandar, igual que en la hoja.
 */
export async function cambiarAprobador(
  email: string,
  aprobadorEmail: string,
): Promise<ResultadoEquipo> {
  const quien = await administrador();
  if (!quien.ok) return { ok: false, error: quien.error };

  // Ser coordinador de uno mismo dejaría sus solicitudes en un bucle: nadie las
  // recibiría más que quien las pidió.
  if (aprobadorEmail === email) {
    return { ok: false, error: "Nadie puede aprobarse a sí mismo." };
  }

  await db.$transaction(async (tx) => {
    await tx.persona.update({
      where: { id: email },
      data: { coordinadorId: aprobadorEmail || null },
    });
  });

  revalidatePath("/equipo");
  return { ok: true };
}

/** Da de baja a alguien sin borrar su historial de horas. */
export async function cambiarActivo(
  email: string,
  activo: boolean,
): Promise<ResultadoEquipo> {
  const quien = await administrador();
  if (!quien.ok) return { ok: false, error: quien.error };

  const r = await conRegla(() =>
    db.$transaction(async (tx) => {
      // Dar de baja al último administrador activo deja la plataforma sin quien
      // reparta permisos, igual que quitarle el `es_admin`.
      if (!activo) {
        const objetivo = await tx.persona.findUnique({
          where: { id: email },
          select: { esAdmin: true },
        });
        if (objetivo?.esAdmin) {
          const quedan = await tx.persona.count({
            where: { esAdmin: true, activo: true, id: { not: email } },
          });
          if (quedan === 0) {
            throw new ErrorEquipo(
              "Es la única persona que administra. Nombra a otra antes.",
            );
          }
        }
      }

      await tx.persona.update({ where: { id: email }, data: { activo } });
    }),
  );
  if (!r.ok) return r;

  revalidatePath("/equipo");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Qué secciones ve esta persona.
 *
 * Llega la lista de las VISIBLES y aquí se guarda su contrario, que es lo que
 * vive en la base. Guardar lo oculto hace que una sección nueva la vea todo el
 * mundo desde el primer día, sin repasar a las 45 personas para concedérsela.
 */
export async function cambiarSecciones(
  email: string,
  visibles: string[],
): Promise<ResultadoEquipo> {
  const quien = await administrador();
  if (!quien.ok) return { ok: false, error: quien.error };

  /*
   * Solo se guardan ids reales: uno inventado escondería una sección que no
   * existe, y nadie entendería por qué la lista no cuadra.
   *
   * Se complementa contra `OCULTABLES` y no contra `SECTIONS` entera porque es
   * lo que la pantalla ofrece marcar. Las `soloAdmin` no aparecen en esa lista,
   * así que al invertir contra `SECTIONS` acabarían ocultas siempre — un dato
   * falso en la base para una sección que el código ya filtra por su cuenta.
   */
  const ocultas = OCULTABLES.filter((s) => !visibles.includes(s.id)).map(
    (s) => s.id,
  );

  await db.$transaction(async (tx) => {
    const previo = await tx.personaRol.findUnique({
      where: {
        personaId_herramientaClave: {
          personaId: email,
          herramientaClave: HERRAMIENTA,
        },
      },
      select: { rolClave: true },
    });

    await tx.personaRol.upsert({
      where: {
        personaId_herramientaClave: {
          personaId: email,
          herramientaClave: HERRAMIENTA,
        },
      },
      // Sin fila previa hay que darle un papel para poder guardarle las
      // secciones: COLABORADOR es el mínimo y no concede nada.
      create: {
        personaId: email,
        herramientaClave: HERRAMIENTA,
        rolClave: previo?.rolClave ?? "COLABORADOR",
        seccionesOcultas: ocultas,
        asignadoPor: quien.id,
      },
      update: { seccionesOcultas: ocultas, asignadoPor: quien.id },
    });
  });

  // El menú se arma en el layout, así que hay que refrescar toda la
  // plataforma y no solo esta pantalla.
  revalidatePath("/equipo");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Quién administra la plataforma.
 *
 * Da acceso a Permisos y ve las cifras de toda la empresa. Antes solo se podía
 * cambiar corriendo un script contra la base.
 */
export async function cambiarAdmin(
  email: string,
  esAdmin: boolean,
): Promise<ResultadoEquipo> {
  const quien = await administrador();
  if (!quien.ok) return { ok: false, error: quien.error };

  // Quitarse el permiso a uno mismo deja la plataforma sin quien reparta
  // permisos, y sin manera de recuperarlo desde la pantalla.
  if (!esAdmin && quien.id === email) {
    return {
      ok: false,
      error: "No puedes quitarte a ti mismo la administración.",
    };
  }

  const r = await conRegla(() =>
    db.$transaction(async (tx) => {
      if (!esAdmin) {
        // Se cuenta DENTRO de la transacción: entre leer y escribir, otra
        // sesión podría estar quitándole el admin al que aquí se da por bueno.
        const quedan = await tx.persona.count({
          where: { esAdmin: true, activo: true, id: { not: email } },
        });
        if (quedan === 0) {
          throw new ErrorEquipo(
            "Es la única persona que administra. Nombra a otra antes.",
          );
        }
      }

      await tx.persona.update({ where: { id: email }, data: { esAdmin } });
    }),
  );
  if (!r.ok) return r;

  revalidatePath("/equipo");
  revalidatePath("/", "layout");
  return { ok: true };
}
