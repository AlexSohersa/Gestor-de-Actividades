"use server";

import { revalidatePath } from "next/cache";
import {
  contarAdminsExceptoWired,
  cambiarPermisoWired,
  exigirAdmin,
} from "@/modules/identidad/infrastructure/wiring";
import {
  ROLES,
  SECCIONES,
  type Rol,
  type Seccion,
} from "@/modules/identidad/domain/persona.entity";

export interface Resultado {
  ok: boolean;
  error?: string;
}

export async function cambiarRol(
  personaId: string,
  rol: string,
): Promise<Resultado> {
  const yo = await exigirAdmin();

  if (!(ROLES as readonly string[]).includes(rol)) {
    return { ok: false, error: "Ese papel no existe." };
  }

  await cambiarPermisoWired(personaId, { rol: rol as Rol }, yo.id);
  revalidatePath("/equipo");
  // El menú se arma con los permisos, así que hay que rehacer el armazón.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cambiarCoordinador(
  personaId: string,
  coordinadorId: string | null,
): Promise<Resultado> {
  const yo = await exigirAdmin();

  if (coordinadorId === personaId) {
    return { ok: false, error: "Nadie puede aprobarse a sí mismo." };
  }

  await cambiarPermisoWired(personaId, { coordinadorId }, yo.id);
  revalidatePath("/equipo");
  return { ok: true };
}

export async function cambiarActivo(
  personaId: string,
  activo: boolean,
): Promise<Resultado> {
  const yo = await exigirAdmin();

  if (personaId === yo.id && !activo) {
    return { ok: false, error: "No puedes desactivarte a ti mismo." };
  }

  await cambiarPermisoWired(personaId, { activo }, yo.id);
  revalidatePath("/equipo");
  return { ok: true };
}

export async function cambiarAdmin(
  personaId: string,
  esAdmin: boolean,
): Promise<Resultado> {
  const yo = await exigirAdmin();

  // Dos salvaguardas que evitan quedarse fuera de la propia herramienta.
  if (personaId === yo.id && !esAdmin) {
    return { ok: false, error: "No puedes quitarte a ti mismo la administración." };
  }

  if (!esAdmin) {
    const quedan = await contarAdminsExceptoWired(personaId);
    if (quedan === 0) {
      return {
        ok: false,
        error:
          "Es la última persona con administración: si se la quitas, nadie " +
          "podría volver a dar permisos.",
      };
    }
  }

  await cambiarPermisoWired(personaId, { esAdmin }, yo.id);
  revalidatePath("/equipo");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cambiarSecciones(
  personaId: string,
  visibles: string[],
): Promise<Resultado> {
  const yo = await exigirAdmin();

  const validas = visibles.filter((s): s is Seccion =>
    (SECCIONES as readonly string[]).includes(s),
  );

  await cambiarPermisoWired(personaId, { seccionesVisibles: validas }, yo.id);
  revalidatePath("/equipo");
  revalidatePath("/", "layout");
  return { ok: true };
}
