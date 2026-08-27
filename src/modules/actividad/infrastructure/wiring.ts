// Módulo Actividad · INFRAESTRUCTURA · Composición (wiring).
//
// Donde se juntan los casos de uso con el repositorio concreto. Las páginas y
// Server Actions importan de aquí, nunca del repositorio ni de los ports.

import "server-only";
import { prismaHoraRepository } from "./hora.repository";
import {
  borrarHora,
  reportarHoras,
  type ResultadoCaptura,
} from "../application/reportar-horas";
import { verSemana, verTablero } from "../application/consultar-actividad";
import type { LineaNueva } from "../domain/hora.entity";

export function verSemanaWired(
  personaId: string,
  semanaISO: string,
  hoyISO: string,
) {
  return verSemana(prismaHoraRepository, personaId, semanaISO, hoyISO);
}

export function verTableroWired(personaId: string, hoyISO: string, meses = 12) {
  return verTablero(prismaHoraRepository, personaId, hoyISO, meses);
}

export function reportarHorasWired(args: {
  personaId: string;
  jornada: number;
  fecha: string;
  proyectoCodigo: string;
  lineas: LineaNueva[];
}): Promise<ResultadoCaptura> {
  return reportarHoras(prismaHoraRepository, args);
}

export function borrarHoraWired(id: string, personaId: string) {
  return borrarHora(prismaHoraRepository, id, personaId);
}

export function catalogosWired() {
  return prismaHoraRepository.catalogos();
}

export function entregablesDeWired(proyectoCodigo: string) {
  return prismaHoraRepository.entregablesDe(proyectoCodigo);
}
