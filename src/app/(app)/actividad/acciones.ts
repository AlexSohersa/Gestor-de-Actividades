"use server";

import { revalidatePath } from "next/cache";
import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import {
  borrarHoraWired,
  entregablesDeWired,
  reportarHorasWired,
} from "@/modules/actividad/infrastructure/wiring";
import type { LineaNueva } from "@/modules/actividad/domain/hora.entity";

/**
 * Las Server Actions de la pantalla de actividad.
 *
 * Cada una vuelve a exigir la sesión y el permiso de sección: una acción es un
 * punto de entrada HTTP como cualquier otro, y que la página ya lo haya
 * comprobado no impide llamarla directamente.
 *
 * La identidad NUNCA llega desde el cliente. Se resuelve aquí, en el servidor,
 * a partir de la sesión: si el `personaId` viniera en el formulario, cualquiera
 * podría reportar horas a nombre de otro.
 */

export async function reportarHoras(datos: {
  fecha: string;
  proyectoCodigo: string;
  lineas: LineaNueva[];
}) {
  const persona = await exigirSeccion("actividad");

  const resultado = await reportarHorasWired({
    personaId: persona.id,
    jornada: persona.horasDia,
    fecha: datos.fecha,
    proyectoCodigo: datos.proyectoCodigo,
    lineas: datos.lineas,
  });

  if (resultado.ok) revalidatePath("/actividad");
  return resultado;
}

export async function borrarHora(id: string) {
  const persona = await exigirSeccion("actividad");

  const resultado = await borrarHoraWired(id, persona.id);
  if (resultado.ok) revalidatePath("/actividad");
  return resultado;
}

/// Los entregables del proyecto elegido. Se piden al vuelo al cambiar el
/// selector: cargar los de los 506 proyectos por adelantado sería absurdo.
export async function entregablesDe(proyectoCodigo: string) {
  await exigirSeccion("actividad");
  return entregablesDeWired(proyectoCodigo);
}
