"use server";

import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import { ausenciasDelEquipo, type DiaOcupado } from "./calendario";

/**
 * Las ausencias aprobadas del equipo en un mes.
 *
 * El calendario arranca con el mes actual ya cargado desde el servidor; esto
 * cubre la navegación, para no traer un año entero de ausencias que casi nadie
 * va a mirar.
 */
export async function ausenciasDelMes(
  mesISO: string,
): Promise<DiaOcupado[]> {
  // Exige sesión y permiso de la sección: es información de otras personas.
  await exigirSeccion("ausencias");

  // El mes, saneado: viene del cliente y solo puede ser AAAA-MM.
  if (!/^\d{4}-\d{2}$/.test(mesISO)) return [];

  const [a, m] = mesISO.split("-").map(Number);
  if (m < 1 || m > 12) return [];

  const primero = `${mesISO}-01`;
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);

  return ausenciasDelEquipo(primero, ultimo);
}
