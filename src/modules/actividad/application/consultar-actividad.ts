// Módulo Actividad · APLICACIÓN · Caso de uso: consultar la actividad.
//
// Arma lo que la pantalla necesita para una semana y para el tablero. La
// separación importa: la vista semanal trae siete días, el tablero trae un año.
// Cargar siempre el año haría esperar a todo el mundo por una pantalla que la
// mayoría no abre.

import { lunesDe, semanaDesde, sumarDias } from "@/lib/fechas";
import {
  horasPorDia,
  porMes,
  promedioPorDia,
  repartoPor,
  resumenQuincena,
  type Reparto,
  type ResumenQuincena,
} from "../domain/resumen.rules";
import { esTrabajo, sumarHoras, type Hora } from "../domain/hora.entity";
import type { HoraRepository } from "./ports";

export interface VistaSemana {
  lunes: string;
  dias: string[];
  horas: Hora[];
  /// Siete cifras, de lunes a domingo.
  porDia: number[];
  totalSemana: number;
  quincena: ResumenQuincena;
}

/**
 * La semana que se está mirando.
 *
 * El rango arranca en el inicio de la quincena cuando este cae antes del lunes,
 * porque el resumen quincenal necesita esas horas y traerlas aquí ahorra una
 * segunda consulta.
 */
export async function verSemana(
  repo: HoraRepository,
  personaId: string,
  semanaISO: string,
  hoyISO: string,
): Promise<VistaSemana> {
  const lunes = lunesDe(semanaISO);
  const dias = semanaDesde(lunes);
  const domingo = dias[6];

  const inicioQuincena = resumenQuincena([], hoyISO).inicio;
  const desde = inicioQuincena < lunes ? inicioQuincena : lunes;
  const hasta = domingo > hoyISO ? domingo : hoyISO;

  const todas = await repo.listar(personaId, { desde, hasta });

  const deLaSemana = todas.filter((h) => h.fecha >= lunes && h.fecha <= domingo);

  return {
    lunes,
    dias,
    horas: deLaSemana,
    porDia: horasPorDia(deLaSemana, dias),
    totalSemana: sumarHoras(deLaSemana),
    quincena: resumenQuincena(todas, hoyISO),
  };
}

export interface Tablero {
  desde: string;
  hasta: string;
  totalHoras: number;
  diasConRegistro: number;
  promedioDia: number;
  porProyecto: Reparto[];
  porTipo: Reparto[];
  porEsfuerzo: Reparto[];
  porMes: Array<{ mes: string; horas: number }>;
}

/**
 * El tablero del histórico.
 *
 * `meses` acota cuánto se trae: doce por omisión. Solo se calcula cuando la
 * persona abre esa vista.
 */
export async function verTablero(
  repo: HoraRepository,
  personaId: string,
  hoyISO: string,
  meses = 12,
): Promise<Tablero> {
  const desde = sumarDias(hoyISO, -Math.round(meses * 30.44));
  const horas = await repo.listar(personaId, { desde, hasta: hoyISO });

  // El tablero describe el TRABAJO: las vacaciones y los permisos se excluyen
  // para que el promedio diario no baje por los días que nadie trabajó.
  const trabajo = horas.filter(esTrabajo);

  return {
    desde,
    hasta: hoyISO,
    totalHoras: sumarHoras(trabajo),
    diasConRegistro: new Set(trabajo.map((h) => h.fecha)).size,
    promedioDia: promedioPorDia(horas),
    porProyecto: repartoPor(trabajo, (h) => h.proyectoNombre, 14),
    porTipo: repartoPor(trabajo, (h) => h.tipo, 8),
    porEsfuerzo: repartoPor(trabajo, (h) => h.esfuerzo, 6),
    porMes: porMes(horas, meses),
  };
}
