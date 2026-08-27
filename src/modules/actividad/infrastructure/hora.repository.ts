// Módulo Actividad · INFRAESTRUCTURA · Repositorio Prisma.
//
// La única capa que conoce Prisma. Traduce entre las filas de actividad.hora y
// la entidad de dominio.

import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/modules/shared/infra/db";
import { aFechaDia, deFechaDia, quincenaDe } from "@/lib/fechas";
import type { Hora } from "../domain/hora.entity";
import type {
  Catalogos,
  EntregableElegible,
  HoraRepository,
} from "../application/ports";

/// Lo que se trae de la base para armar una `Hora`.
const SELECCION = {
  id: true,
  personaId: true,
  proyectoCodigo: true,
  proyectoTexto: true,
  entregableId: true,
  entregableTexto: true,
  fecha: true,
  horas: true,
  disciplina: true,
  tipo: true,
  esfuerzo: true,
  comentario: true,
  quincena: true,
  origen: true,
  proyecto: { select: { nombre: true } },
  entregable: { select: { nombre: true } },
} as const;

type Fila = {
  id: string;
  personaId: string;
  proyectoCodigo: string | null;
  proyectoTexto: string | null;
  entregableId: string | null;
  entregableTexto: string | null;
  fecha: Date;
  horas: unknown;
  disciplina: string | null;
  tipo: string | null;
  esfuerzo: string | null;
  comentario: string | null;
  quincena: number | null;
  origen: string;
  proyecto: { nombre: string } | null;
  entregable: { nombre: string } | null;
};

function aDominio(f: Fila): Hora {
  return {
    id: f.id,
    personaId: f.personaId,
    proyectoCodigo: f.proyectoCodigo,
    proyectoTexto: f.proyectoTexto,
    // El nombre del padrón manda; si la fila vino de la hoja con un proyecto
    // que no existe en el padrón, se muestra el texto original para no perder
    // la referencia.
    proyectoNombre:
      f.proyecto?.nombre ?? f.proyectoTexto ?? f.proyectoCodigo ?? "SIN PROYECTO",
    entregableId: f.entregableId,
    // El nombre del padrón manda; si no hay enlace, el texto que traía la hoja.
    entregable: f.entregable?.nombre ?? f.entregableTexto ?? null,
    fecha: deFechaDia(f.fecha),
    horas: Number(f.horas),
    disciplina: f.disciplina,
    tipo: f.tipo,
    esfuerzo: f.esfuerzo,
    comentario: f.comentario,
    quincena: f.quincena,
    origen: f.origen,
  };
}

export const prismaHoraRepository: HoraRepository = {
  async listar(personaId, rango) {
    const filas = await db.hora.findMany({
      where: {
        personaId,
        fecha: { gte: aFechaDia(rango.desde), lte: aFechaDia(rango.hasta) },
      },
      select: SELECCION,
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
    });
    return filas.map((f) => aDominio(f as Fila));
  },

  async horasDelDia(personaId, fecha) {
    // Se suma en la base y no en memoria: con año y medio de histórico, traer
    // las filas para sumarlas sería mover datos sin motivo.
    const r = await db.hora.aggregate({
      where: { personaId, fecha: aFechaDia(fecha) },
      _sum: { horas: true },
    });
    return Number(r._sum.horas ?? 0);
  },

  async crear({ personaId, fecha, proyectoCodigo, lineas }) {
    const dia = aFechaDia(fecha);
    const quincena = quincenaDe(fecha).numero;

    // Los entregables se resuelven de una vez: la hoja guardaba el nombre y
    // aquí hace falta el id para la clave foránea.
    const entregables = await db.entregable.findMany({
      where: {
        proyectoCodigo,
        nombre: { in: lineas.map((l) => l.entregable) },
      },
      select: { id: true, nombre: true },
    });
    const idPorNombre = new Map(entregables.map((e) => [e.nombre, e.id]));

    const datos = lineas
      .filter((l) => l.entregable && l.horas > 0)
      .map((l) => ({
        id: randomUUID(),
        personaId,
        proyectoCodigo,
        entregableId: idPorNombre.get(l.entregable) ?? null,
        // Se guarda siempre el nombre: si mañana alguien da de alta ese
        // entregable en el padrón, la hora ya sabe con cuál emparejarse.
        entregableTexto: l.entregable,
        fecha: dia,
        horas: l.horas,
        disciplina: l.disciplina || null,
        tipo: l.tipo || null,
        esfuerzo: l.esfuerzo || null,
        comentario: l.comentario.trim() || null,
        quincena,
        origen: "app",
      }));

    if (datos.length === 0) return 0;

    const r = await db.hora.createMany({ data: datos });
    return r.count;
  },

  async borrar(id, personaId) {
    // El `deleteMany` con las tres condiciones evita dos consultas y, sobre
    // todo, evita la carrera entre comprobar y borrar. `origen: "app"` es lo
    // que protege el histórico importado.
    const r = await db.hora.deleteMany({
      where: { id, personaId, origen: "app" },
    });
    return r.count > 0;
  },

  async catalogos(): Promise<Catalogos> {
    // Los proyectos que admiten captura y los valores ya usados, en paralelo:
    // son cuatro consultas independientes.
    const [proyectos, tipos, esfuerzos, disciplinas] = await Promise.all([
      db.proyecto.findMany({
        where: { estado: { in: ["ACTIVO", "EN_PAUSA", "COTIZACION"] } },
        select: { codigo: true, nombre: true, estado: true },
        orderBy: { nombre: "asc" },
      }),
      db.hora.groupBy({
        by: ["tipo"],
        where: { tipo: { not: null } },
        _count: { tipo: true },
        orderBy: { _count: { tipo: "desc" } },
      }),
      db.hora.groupBy({
        by: ["esfuerzo"],
        where: { esfuerzo: { not: null } },
        _count: { esfuerzo: true },
        orderBy: { _count: { esfuerzo: "desc" } },
      }),
      db.hora.groupBy({
        by: ["disciplina"],
        where: { disciplina: { not: null } },
        _count: { disciplina: true },
        orderBy: { _count: { disciplina: "desc" } },
      }),
    ]);

    return {
      proyectos,
      tipos: tipos.map((t) => t.tipo!).filter(Boolean),
      esfuerzos: esfuerzos.map((e) => e.esfuerzo!).filter(Boolean),
      disciplinas: disciplinas.map((d) => d.disciplina!).filter(Boolean),
    };
  },

  async entregablesDe(proyectoCodigo): Promise<EntregableElegible[]> {
    // Tres fuentes, porque ninguna basta sola:
    //
    //  · core.entregable    el padrón. Hoy está vacío, pero es el destino.
    //  · hora_cotizada      lo que se cotizó por entregable: la lista real de
    //                       trabajo previsto de cada proyecto.
    //  · lo ya reportado    entregables sobre los que alguien trabajó aunque
    //                       nadie los cotizara.
    //
    // Sin las dos últimas, el selector saldría vacío y no se podría capturar
    // nada, que es exactamente lo que pasaría hoy.
    const [padron, cotizados, usados] = await Promise.all([
      db.entregable.findMany({
        where: { proyectoCodigo },
        select: { id: true, nombre: true, disciplina: true, tipo: true },
      }),
      db.horaCotizada.findMany({
        where: { proyectoCodigo },
        select: { entregable: true, disciplina: true },
      }),
      db.hora.groupBy({
        by: ["entregableTexto", "disciplina"],
        where: { proyectoCodigo, entregableTexto: { not: null } },
        _count: { entregableTexto: true },
      }),
    ]);

    // Se unen por nombre. El primero en llegar gana, y el orden de las fuentes
    // es el de fiabilidad: padrón, luego cotizado, luego uso real.
    const porNombre = new Map<string, EntregableElegible>();

    for (const e of padron) porNombre.set(e.nombre, e);

    for (const c of cotizados) {
      if (!porNombre.has(c.entregable)) {
        porNombre.set(c.entregable, {
          // Sin id: la hora se guardará con `entregableTexto` y quedará lista
          // para enlazarse el día que exista en el padrón.
          id: "",
          nombre: c.entregable,
          disciplina: c.disciplina,
          tipo: null,
        });
      }
    }

    for (const u of usados) {
      const nombre = u.entregableTexto!;
      if (!porNombre.has(nombre)) {
        porNombre.set(nombre, {
          id: "",
          nombre,
          disciplina: u.disciplina,
          tipo: null,
        });
      }
    }

    return [...porNombre.values()].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es"),
    );
  },
};
