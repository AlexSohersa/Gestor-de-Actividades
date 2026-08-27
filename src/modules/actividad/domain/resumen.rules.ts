// Módulo Actividad · DOMINIO · Reglas de resumen.
//
// Los cálculos que alimentan el tablero: cuánto llevas de la quincena, qué te
// falta, cómo se reparte tu tiempo. Todo puro: entra un arreglo de horas, sale
// un número. Sin base de datos de por medio.

import { diasHabiles, quincenaDe } from "@/lib/fechas";
import { esTrabajo, sumarHoras, type Hora } from "./hora.entity";

/**
 * La jornada con la que se calcula la META de la quincena.
 *
 * Deliberadamente 8 para todo el mundo, igual que en el gestor antiguo: la meta
 * quincenal es el estándar de la empresa, no la jornada contratada de cada
 * quien. La jornada individual (`persona.horasDia`) sí manda en el TOPE DIARIO
 * de captura — ahí sería injusto pedirle 8 h a quien trabaja 5.
 */
export const JORNADA_META = 8;

export interface ResumenQuincena {
  numero: 1 | 2;
  inicio: string;
  fin: string;
  /// Horas de trabajo reportadas dentro de la quincena.
  reportadas: number;
  /// Días hábiles × 8.
  meta: number;
  /// Lo que falta para la meta (nunca negativo).
  faltan: number;
  /// Porcentaje de avance, tope 100 para que la barra no se desborde.
  avance: number;
  /// Días hábiles ya transcurridos, para saber si el retraso es real o es que
  /// la quincena acaba de empezar.
  habilesTranscurridos: number;
  habilesTotales: number;
}

export function resumenQuincena(
  horas: Hora[],
  hoyISO: string,
): ResumenQuincena {
  const q = quincenaDe(hoyISO);

  const dentro = horas.filter(
    (h) => h.fecha >= q.inicio && h.fecha <= q.fin && esTrabajo(h),
  );
  const reportadas = sumarHoras(dentro);

  const habilesTotales = diasHabiles(q.inicio, q.fin);
  const meta = habilesTotales * JORNADA_META;

  // Hasta hoy, no hasta el final: sirve para decir "vas al día" a mitad de
  // quincena sin marcar en rojo lo que todavía no toca reportar.
  const corte = hoyISO < q.fin ? hoyISO : q.fin;
  const habilesTranscurridos = diasHabiles(q.inicio, corte);

  return {
    numero: q.numero,
    inicio: q.inicio,
    fin: q.fin,
    reportadas,
    meta,
    faltan: Math.max(0, Math.round((meta - reportadas) * 100) / 100),
    avance: meta > 0 ? Math.min(100, Math.round((reportadas / meta) * 100)) : 0,
    habilesTranscurridos,
    habilesTotales,
  };
}

/// Horas por día de una semana: siete cifras, en orden de lunes a domingo.
export function horasPorDia(horas: Hora[], dias: string[]): number[] {
  return dias.map((dia) =>
    sumarHoras(horas.filter((h) => h.fecha === dia)),
  );
}

export interface Reparto {
  clave: string;
  horas: number;
  /// Porcentaje sobre el total, para las barras.
  porcentaje: number;
}

/**
 * Reparto de horas por una dimensión (proyecto, tipo, esfuerzo…).
 *
 * `tope` corta la cola larga: con 200 proyectos, una lista completa no se lee.
 * Lo que queda fuera se agrupa en "Otros" para que los porcentajes sigan
 * sumando 100 y no parezca que faltan horas.
 */
export function repartoPor(
  horas: Hora[],
  dimension: (h: Hora) => string | null,
  tope = 12,
): Reparto[] {
  const acumulado = new Map<string, number>();

  for (const h of horas) {
    const clave = dimension(h)?.trim() || "SIN CLASIFICAR";
    acumulado.set(clave, (acumulado.get(clave) ?? 0) + h.horas);
  }

  const total = [...acumulado.values()].reduce((t, v) => t + v, 0);
  if (total === 0) return [];

  const ordenado = [...acumulado.entries()]
    .map(([clave, horas]) => ({ clave, horas: Math.round(horas * 100) / 100 }))
    .sort((a, b) => b.horas - a.horas);

  const visibles = ordenado.slice(0, tope);
  const resto = ordenado.slice(tope);

  if (resto.length > 0) {
    const suma = resto.reduce((t, r) => t + r.horas, 0);
    visibles.push({ clave: "Otros", horas: Math.round(suma * 100) / 100 });
  }

  return visibles.map((v) => ({
    ...v,
    porcentaje: Math.round((v.horas / total) * 100),
  }));
}

/**
 * Promedio de horas por día CON REGISTRO.
 *
 * Divide entre los días en que la persona reportó algo, no entre los días del
 * calendario: si estuvo de vacaciones dos semanas, el promedio debe seguir
 * describiendo cómo son sus días de trabajo.
 */
export function promedioPorDia(horas: Hora[]): number {
  const trabajo = horas.filter(esTrabajo);
  if (trabajo.length === 0) return 0;

  const dias = new Set(trabajo.map((h) => h.fecha));
  return Math.round((sumarHoras(trabajo) / dias.size) * 100) / 100;
}

/// Serie mensual (AAAA-MM → horas) para la gráfica del histórico.
export function porMes(horas: Hora[], ultimos = 12): Array<{ mes: string; horas: number }> {
  const acumulado = new Map<string, number>();

  for (const h of horas.filter(esTrabajo)) {
    const mes = h.fecha.slice(0, 7);
    acumulado.set(mes, (acumulado.get(mes) ?? 0) + h.horas);
  }

  return [...acumulado.entries()]
    .map(([mes, horas]) => ({ mes, horas: Math.round(horas * 100) / 100 }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-ultimos);
}
