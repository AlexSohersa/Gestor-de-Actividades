// Módulo Proyectos · INFRAESTRUCTURA · Composición (wiring).

import "server-only";
import { calcularRadar, type Radar } from "../domain/radar.rules";
import {
  datosDeProyecto,
  horasDeProyecto,
  listarProyectos,
  type ProyectoEnLista,
} from "./proyecto.repository";

export type { ProyectoEnLista };

export function listarProyectosWired() {
  return listarProyectos();
}

export interface VistaProyecto {
  codigo: string;
  nombre: string;
  estado: string;
  cliente: string | null;
  lider: string | null;
  radar: Radar;
}

/**
 * El radar de un proyecto.
 *
 * `meses` acota el periodo; `null` trae toda la vida del proyecto, que es lo
 * que interesa para saber si el presupuesto alcanza.
 */
export async function verProyectoWired(
  codigo: string,
  meses: number | null,
  hoyISO: string,
): Promise<VistaProyecto | null> {
  const [datos, horas] = await Promise.all([
    datosDeProyecto(codigo),
    horasDeProyecto(codigo, meses, hoyISO),
  ]);

  if (!datos) return null;

  return {
    codigo: datos.codigo,
    nombre: datos.nombre,
    estado: datos.estado,
    cliente: datos.cliente?.nombre ?? null,
    lider: datos.lider?.nombre ?? null,
    radar: calcularRadar(horas.registradas, horas.cotizadas),
  };
}
