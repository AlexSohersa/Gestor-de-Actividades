// Módulo Actividad · APLICACIÓN · Caso de uso: reportar horas.
//
// Orquesta dominio + ports. No conoce Prisma ni Next: recibe el repositorio por
// parámetro, así que en una prueba se le pasa uno falso.

import { esFinDeSemana } from "@/lib/fechas";
import { validarCaptura, type LineaNueva } from "../domain/hora.entity";
import type { HoraRepository } from "./ports";

export interface ResultadoCaptura {
  ok: boolean;
  error?: string;
  guardadas?: number;
}

export async function reportarHoras(
  repo: HoraRepository,
  args: {
    personaId: string;
    jornada: number;
    fecha: string;
    proyectoCodigo: string;
    lineas: LineaNueva[];
  },
): Promise<ResultadoCaptura> {
  const { personaId, jornada, fecha, proyectoCodigo, lineas } = args;

  // El tope se mide contra lo que YA hay ese día: si no, capturar en dos tandas
  // permitiría reportar el doble de la jornada.
  const yaReportadas = await repo.horasDelDia(personaId, fecha);

  const validacion = validarCaptura({
    fecha,
    proyecto: proyectoCodigo,
    lineas,
    esFinDeSemana: esFinDeSemana(fecha),
    jornada,
    horasYaReportadas: yaReportadas,
  });

  if (!validacion.ok) return { ok: false, error: validacion.error };

  const guardadas = await repo.crear({
    personaId,
    fecha,
    proyectoCodigo,
    lineas,
  });

  return { ok: true, guardadas };
}

export async function borrarHora(
  repo: HoraRepository,
  id: string,
  personaId: string,
): Promise<ResultadoCaptura> {
  const borrada = await repo.borrar(id, personaId);

  if (!borrada) {
    return {
      ok: false,
      error:
        "No se pudo borrar. O ya no existe, o es un registro importado del " +
        "gestor anterior, que no se edita desde aquí.",
    };
  }

  return { ok: true };
}
