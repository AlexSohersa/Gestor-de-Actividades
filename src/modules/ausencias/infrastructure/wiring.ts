// Módulo Ausencias · INFRAESTRUCTURA · Composición (wiring).

import "server-only";
import { prismaAusenciaRepository } from "./ausencia.repository";
import {
  cancelarAusencia,
  decidirAusencia,
  solicitarAusencia,
  verAusencias,
} from "../application/gestionar-ausencias";

export function verAusenciasWired(args: {
  personaId: string;
  jornada: number;
  puedeAprobar: boolean;
  hoyISO: string;
}) {
  return verAusencias(prismaAusenciaRepository, args);
}

export function solicitarAusenciaWired(args: {
  personaId: string;
  jornada: number;
  hoyISO: string;
  tipo: string;
  inicio: string;
  fin: string;
  horas: number | null;
  motivo: string | null;
}) {
  return solicitarAusencia(prismaAusenciaRepository, args);
}

export function decidirAusenciaWired(args: {
  id: string;
  decisorId: string;
  puedeAprobar: boolean;
  decision: "APROBADA" | "RECHAZADA";
  aCargo: string[];
}) {
  return decidirAusencia(prismaAusenciaRepository, args);
}

export function cancelarAusenciaWired(id: string, personaId: string) {
  return cancelarAusencia(prismaAusenciaRepository, id, personaId);
}
