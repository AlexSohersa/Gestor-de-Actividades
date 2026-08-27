// Módulo Ausencias · APLICACIÓN · Ports (contratos).

import type { Ausencia, Estado } from "../domain/ausencia.entity";
import type { Bloque } from "../domain/saldo.rules";

export interface NuevaAusencia {
  personaId: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  medioDia: boolean;
  horas: number | null;
  motivo: string | null;
  periodo: number | null;
}

export interface AusenciaRepository {
  /// Las ausencias de una persona, de la más reciente a la más antigua.
  listarDe(personaId: string): Promise<Ausencia[]>;

  /// Las pendientes que le toca decidir a un coordinador: las de la gente que
  /// tiene a su cargo (core.persona.coordinador_id).
  pendientesDe(coordinadorId: string): Promise<Ausencia[]>;

  porId(id: string): Promise<Ausencia | null>;

  crear(datos: NuevaAusencia): Promise<string>;

  /// Cambia el estado. Devuelve false si ya no estaba pendiente (otra persona
  /// se adelantó), lo que evita decidir dos veces la misma solicitud.
  decidir(
    id: string,
    estado: Extract<Estado, "APROBADA" | "RECHAZADA">,
    decididaPor: string,
  ): Promise<boolean>;

  /// Cancela una solicitud propia todavía pendiente.
  cancelar(id: string, personaId: string): Promise<boolean>;

  /// Los bloques de vacaciones de una persona.
  bloquesDe(personaId: string): Promise<Bloque[]>;

  /**
   * Días ya consumidos de vacaciones: la suma de las ausencias APROBADAS cuyo
   * tipo descuenta saldo.
   *
   * Se calcula a partir de las ausencias en vez de guardarse en un contador,
   * para que cancelar o rechazar una devuelva los días sin intervención.
   */
  diasConsumidos(personaId: string, jornada: number): Promise<number>;
}
