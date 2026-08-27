// Módulo Actividad · APLICACIÓN · Ports (contratos).

import type { Hora, LineaNueva } from "../domain/hora.entity";

/// Un proyecto tal como se elige en el formulario de captura.
export interface ProyectoElegible {
  codigo: string;
  nombre: string;
  estado: string;
}

/// Un entregable del proyecto elegido, con su disciplina ya resuelta para que
/// el formulario la rellene solo (así lo hacía la hoja).
export interface EntregableElegible {
  id: string;
  nombre: string;
  disciplina: string | null;
  tipo: string | null;
}

/// Los catálogos que necesita la pantalla de captura.
export interface Catalogos {
  proyectos: ProyectoElegible[];
  /// Los tipos de actividad que ya se han usado, de más a menos frecuente: es
  /// mejor catálogo que una lista fija, porque refleja lo que la gente reporta.
  tipos: string[];
  esfuerzos: string[];
  disciplinas: string[];
}

export interface RangoFechas {
  desde: string; // AAAA-MM-DD
  hasta: string;
}

export interface HoraRepository {
  /// Horas de una persona en un rango. Es la consulta base de toda la pantalla.
  listar(personaId: string, rango: RangoFechas): Promise<Hora[]>;

  /// Cuántas horas tiene ya esa persona ese día. Sirve para el tope diario.
  horasDelDia(personaId: string, fecha: string): Promise<number>;

  /// Guarda varias líneas de un mismo día y proyecto, en una transacción.
  crear(args: {
    personaId: string;
    fecha: string;
    proyectoCodigo: string;
    lineas: LineaNueva[];
  }): Promise<number>;

  /// Borra una hora propia. Devuelve false si no existe, no es suya o vino de
  /// la hoja (histórico no editable).
  borrar(id: string, personaId: string): Promise<boolean>;

  catalogos(): Promise<Catalogos>;

  entregablesDe(proyectoCodigo: string): Promise<EntregableElegible[]>;
}
