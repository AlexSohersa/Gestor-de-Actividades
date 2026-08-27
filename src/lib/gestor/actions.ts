"use server";

/**
 * Las acciones de la pantalla de actividad.
 *
 * Conservan la firma que tenían en la plataforma porque las pantallas se
 * copiaron sin tocar: son el diseño aprobado y adaptarlas a otra forma solo
 * abriría la puerta a que las dos versiones se separen.
 *
 * Por dentro trabajan sobre `actividad.hora` y resuelven la identidad contra
 * `core.persona`, en vez de las tablas de `public`.
 */

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  quitarDeLaHoja,
  sincronizarEnSegundoPlano,
} from "@/lib/google/sincronizar";
import { exigirSeccion } from "@/modules/identidad/infrastructure/wiring";
import {
  aFechaDia,
  deFechaDia,
  diasHabilesEntre,
  esFinDeSemana,
  quincenaDe,
} from "@/lib/fechas";

export type ResultadoAccion = {
  ok: boolean;
  error?: string;
  /** Algo salió bien pero con una salvedad que conviene contar. */
  aviso?: string;
};

export type LineaActividad = {
  deliverable: string;
  discipline: string;
  kind: string;
  effort: string;
  hours: number;
  comment: string;
  /** Fuera de la jornada: va a aprobación en vez de guardarse de una vez. */
  extra?: boolean;
};

/**
 * Reporta las horas de un día sobre un mismo proyecto.
 *
 * Las validaciones son las del Gestor de siempre, en el mismo orden: que haya
 * algo que reportar, que cada línea esté completa, que el día sea laborable y
 * que no se pase de la jornada de esa persona.
 */
/**
 * ¿Se permite que alguien se mande y apruebe su propia solicitud?
 *
 * NO en producción: nadie se autoriza a sí mismo sus propias vacaciones.
 *
 * Sí en desarrollo, para poder probar el circuito completo —pedir, aprobar,
 * ver el descuento— sin necesitar una segunda persona conectada. Es la misma
 * puerta que `DEV_CORREO_SIMULADO`, y se cierra igual: mirando `NODE_ENV`.
 */
function permiteAutoAprobacion(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTO_APROBACION === "1"
  );
}

/**
 * ¿Es un día real en formato AAAA-MM-DD?
 *
 * Estas funciones son Server Actions: el navegador puede llamarlas con lo que
 * sea, no solo con lo que manda el formulario. Sin esta comprobación, una
 * fecha imposible como "2026-02-31" o un texto suelto llegan a `aFechaDia`,
 * que devuelve una fecha inválida y acaba guardando una fila corrupta.
 */
function esDiaValido(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00.000Z`);
  // El ida y vuelta descarta los días que no existen: el 31 de febrero se
  // normaliza al 3 de marzo y deja de coincidir consigo mismo.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export async function reportarHoras(
  fecha: string,
  proyecto: string,
  lineas: LineaActividad[],
  aprobadorExtra?: string | null,
): Promise<ResultadoAccion> {
  const persona = await exigirSeccion("actividad");

  const validas = lineas.filter((l) => l.deliverable && l.hours > 0);
  if (validas.length === 0) {
    return { ok: false, error: "Estás intentando reportar cero horas." };
  }
  if (!fecha || !proyecto) {
    return { ok: false, error: "Falta la fecha o el proyecto." };
  }
  if (!esDiaValido(fecha)) {
    return { ok: false, error: "Esa fecha no es válida." };
  }

  for (const l of validas) {
    if (!l.kind) {
      return { ok: false, error: "Falta el tipo de actividad en alguna línea." };
    }
    if (!l.comment.trim()) {
      return { ok: false, error: "Falta el comentario en alguna línea." };
    }
  }

  const normales = validas.filter((l) => !l.extra);
  const extras = validas.filter((l) => l.extra);

  if (extras.length > 0 && !aprobadorExtra) {
    return { ok: false, error: "Elige a quién le mandas las horas extra." };
  }

  // El fin de semana no se reporta por la vía normal; como horas extra sí.
  if (normales.length > 0 && esFinDeSemana(fecha)) {
    return {
      ok: false,
      error: "Ese día no es laboral. Repórtalo como horas extra.",
    };
  }

  /*
   * El tope se mide contra lo que YA hay ese día: si no, capturar en dos
   * tandas permitiría reportar el doble de la jornada.
   *
   * Solo cuentan las horas NORMALES. Las de una ausencia aprobada ya ocupan
   * la jornada entera y dejarían a la persona sin poder reportar nada el día
   * que vuelve a trabajar media jornada; las extra son, por definición, las
   * que van por encima del tope.
   *
   * `fecha` es una columna `date` sin hora, así que la igualdad exacta basta.
   */
  if (normales.length > 0) {
    const yaHay = await db.hora.aggregate({
      where: {
        personaId: persona.id,
        fecha: aFechaDia(fecha),
        categoria: "NORMAL",
      },
      _sum: { horas: true },
    });
    const previas = Number(yaHay._sum.horas ?? 0);
    const suma = normales.reduce((t, l) => t + l.hours, 0);

    if (previas + suma > persona.horasDia) {
      const restan = Math.max(0, persona.horasDia - previas);
      return {
        ok: false,
        error:
          `Estás intentando reportar ${suma} h y solo te quedan ${restan} h ` +
          `de tu jornada de ${persona.horasDia} h. Lo que exceda va como horas extra.`,
      };
    }
  }

  const codigo = await codigoDeProyecto(proyecto);
  const dia = aFechaDia(fecha);
  const quincena = quincenaDe(fecha).numero;

  if (normales.length > 0) {
    await db.hora.createMany({
      data: normales.map((l) => ({
        id: randomUUID(),
        personaId: persona.id,
        proyectoCodigo: codigo,
        // Si el proyecto no está en el padrón se conserva su nombre, para no
        // perder el dato ni romper la clave foránea.
        proyectoTexto: codigo ? null : proyecto,
        entregableTexto: l.deliverable,
        fecha: dia,
        horas: l.hours,
        disciplina: l.discipline || null,
        tipo: l.kind || null,
        esfuerzo: l.effort || null,
        comentario: l.comment.trim() || null,
        pago: "PAGADO",
        categoria: "NORMAL",
        quincena,
        origen: "app",
      })),
    });
  }

  // La copia a la hoja va después y sin esperarla: la persona ya tiene su
  // registro guardado y no debe esperar a Google.
  if (normales.length > 0) sincronizarEnSegundoPlano();

  revalidatePath("/actividad");

  if (extras.length > 0) {
    return {
      ok: true,
      aviso:
        "Las horas normales quedaron registradas. Las horas extra todavía no " +
        "se pueden enviar a aprobación desde aquí.",
    };
  }

  return { ok: true };
}

/**
 * Borra un registro propio.
 *
 * Las tres condiciones van dentro del `deleteMany` a propósito: además de
 * ahorrar una consulta, evita la carrera entre comprobar y borrar. El filtro
 * por `origen: "app"` es lo que protege el histórico importado de las hojas.
 */
export async function borrarActividad(id: string): Promise<ResultadoAccion> {
  const persona = await exigirSeccion("actividad");

  // Se lee antes de borrar: hace falta saber si ya subió y con qué datos, para
  // poder quitar esa misma fila de la hoja.
  const fila = await db.hora.findFirst({
    where: { id, personaId: persona.id, origen: "app" },
    select: {
      fecha: true,
      horas: true,
      sheetSync: true,
      entregableTexto: true,
      entregable: { select: { nombre: true } },
    },
  });

  if (!fila) {
    return {
      ok: false,
      error:
        "No se pudo borrar. O ya no existe, o viene del Gestor anterior y su " +
        "origen es la hoja de actividad.",
    };
  }

  /*
   * Si ya subió, se quita también de la hoja.
   *
   * Sin esto la fila se queda ahí para siempre: la persona la ve desaparecer
   * de la aplicación y sigue contando en los tableros de la empresa.
   *
   * Si no se encuentra, el borrado sigue adelante y se avisa: perder el
   * registro sería peor que dejar una fila suelta que se puede quitar a mano.
   */
  let aviso: string | undefined;
  if (fila.sheetSync === "ok") {
    const quitada = await quitarDeLaHoja({
      fecha: fila.fecha,
      // El nombre CORTO: es el que la hoja lleva en su columna B. Con el
      // largo del padrón no encontraría nunca la fila que hay que quitar.
      nombre: persona.nombreUsuario?.trim() || persona.nombre,
      horas: Number(fila.horas),
      entregable: fila.entregable?.nombre ?? fila.entregableTexto ?? "",
    }).catch(() => false);

    if (!quitada) {
      aviso = "No se encontró la fila en la hoja de actividad; revísala por si acaso.";
    }
  }

  await db.hora.delete({ where: { id } });

  revalidatePath("/actividad");
  return { ok: true, aviso };
}

/**
 * Solicita horas extra.
 *
 * Pendiente: el circuito de aprobación de horas extra todavía no se migra. En
 * los datos de la hoja no aparece ninguna fila con envío EXTRA, así que no
 * había nada que traer; cuando se decida si sigue vivo, se implementa aquí.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- la firma se conserva
   para que la pantalla copiada compile; el circuito no está implementado. */
export async function solicitarExtra(
  form: FormData,
): Promise<ResultadoAccion> {
  await exigirSeccion("actividad");
  return {
    ok: false,
    error:
      "Las horas extra todavía no están disponibles en esta herramienta. " +
      "Repórtalas por el canal de siempre mientras tanto.",
  };
}

/** Decide una solicitud de horas extra. Ver la nota de `solicitarExtra`. */
export async function decidirExtra(
  id: string,
  decision: "APROBADO" | "RECHAZADO",
): Promise<ResultadoAccion> {
  await exigirSeccion("actividad");
  return {
    ok: false,
    error: "La aprobación de horas extra todavía no está disponible aquí.",
  };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * El código de un proyecto a partir de su nombre.
 *
 * Las pantallas y las hojas manejan NOMBRES; la base referencia `core.proyecto`
 * por CÓDIGO. Devuelve null cuando el nombre no está en el padrón, y entonces
 * la hora se guarda con `proyectoTexto`.
 */
async function codigoDeProyecto(nombre: string): Promise<string | null> {
  const p = await db.proyecto.findFirst({
    where: { nombre: { equals: nombre.trim(), mode: "insensitive" } },
    select: { codigo: true },
  });
  return p?.codigo ?? null;
}

/* ============================== AUSENCIAS ============================== */

/**
 * Pide una ausencia.
 *
 * Recibe `FormData` porque así la manda la pantalla, que viene copiada del
 * portal. Los campos son los suyos: `type`, `start`, `end`, `hours`, `detail`
 * y `sentTo`.
 *
 * Las vacaciones se piden por días completos: media jornada de vacaciones no
 * existe, y aceptarla descuadraría el saldo, que se lleva en días.
 */
export async function solicitarAusencia(
  form: FormData,
): Promise<ResultadoAccion> {
  const persona = await exigirSeccion("ausencias");

  const tipo = String(form.get("type") ?? "").trim();
  const inicio = String(form.get("start") ?? "").trim();
  const finCrudo = String(form.get("end") ?? "").trim();
  const motivo = String(form.get("detail") ?? "").trim();
  const horasCrudas = Number(form.get("hours"));
  // A quién se le manda. La pantalla envía el id de la persona elegida.
  const enviadaA = String(form.get("sentTo") ?? "").trim();

  if (!tipo) return { ok: false, error: "Elige un tipo de ausencia." };
  if (!enviadaA) {
    return { ok: false, error: "Elige a quién le mandas la solicitud." };
  }
  if (enviadaA === persona.id && !permiteAutoAprobacion()) {
    return { ok: false, error: "No puedes mandarte la solicitud a ti mismo." };
  }
  if (!inicio) return { ok: false, error: "Falta la fecha de inicio." };

  // Un solo día se pide dejando el fin vacío.
  const fin = finCrudo || inicio;

  // Antes de compararlas: la comparación de abajo es entre textos y solo
  // ordena bien si las dos son AAAA-MM-DD de verdad.
  if (!esDiaValido(inicio) || !esDiaValido(fin)) {
    return { ok: false, error: "Esa fecha no es válida." };
  }

  if (fin < inicio) {
    return { ok: false, error: "La fecha de fin es anterior a la de inicio." };
  }

  const jornada = persona.horasDia;
  const esVacaciones = /vacacion/i.test(tipo);
  const horas =
    esVacaciones || !Number.isFinite(horasCrudas) || horasCrudas <= 0
      ? jornada
      : horasCrudas;
  const medioDia = !esVacaciones && horas < jornada;

  if (esVacaciones) {
    // El saldo se comprueba aquí y no en la pantalla: el cliente puede mandar
    // lo que quiera, y unas vacaciones sin días detrás descuadran la nómina.
    const { saldoVacaciones } = await import("@/lib/trabajo/queries");
    const saldo = await saldoVacaciones(persona.id, jornada);
    const pide = diasHabilesEntre(inicio, fin).length;

    if (pide > saldo.disponibles) {
      return {
        ok: false,
        error:
          `Pides ${pide} día(s) y solo tienes ${saldo.disponibles} disponible(s).`,
      };
    }
  }

  await db.ausencia.create({
    data: {
      id: randomUUID(),
      personaId: persona.id,
      tipo,
      fechaInicio: aFechaDia(inicio),
      fechaFin: aFechaDia(fin),
      medioDia,
      horas: medioDia ? horas : null,
      motivo: motivo || null,
      estado: "PENDIENTE",
      enviadaA,
    },
  });

  revalidatePath("/ausencias");
  return { ok: true };
}

/** Cancela una solicitud propia que siga pendiente. */
export async function cancelarAusencia(id: string): Promise<ResultadoAccion> {
  const persona = await exigirSeccion("ausencias");

  const r = await db.ausencia.deleteMany({
    where: { id, personaId: persona.id, estado: "PENDIENTE" },
  });

  if (r.count === 0) {
    return {
      ok: false,
      error: "Ya fue decidida: pídele el cambio a quien la aprobó.",
    };
  }

  revalidatePath("/ausencias");
  return { ok: true };
}

/**
 * Aprueba o rechaza una solicitud ajena.
 *
 * Dos comprobaciones, y las dos importan: que quien decide tenga el papel, y
 * que la solicitud sea de alguien a su cargo. Tener el papel no basta — si no,
 * un coordinador podría decidir sobre gente de otro equipo.
 *
 * La pantalla manda "APROBADO"/"RECHAZADO"; la base guarda "APROBADA"/
 * "RECHAZADA" (restricción CHECK). La traducción se hace aquí.
 */
/**
 * Descuenta días de vacaciones de los bloques de saldo y dice de qué periodo
 * salieron.
 *
 * Se consume del bloque que ANTES vence, para que no se pierdan días por
 * caducar teniendo otros más nuevos sin tocar. Solo entran bloques ya
 * liberados: los de fecha futura están otorgados pero aún no son de nadie.
 *
 * El periodo que se devuelve es el del primer bloque del que se tomó — es lo
 * que va a la columna I de `BDD PERMISOS`, que hasta ahora recibía siempre
 * "N/A" porque nadie lo calculaba.
 *
 * Devuelve `null` si no eran vacaciones o no había de dónde tomar.
 */
async function consumirVacaciones(
  personaId: string,
  dias: number,
  ausenciaId: string,
): Promise<number | null> {
  if (dias <= 0) return null;

  const hoy = new Date();

  const bloques = await db.saldoVacaciones.findMany({
    where: {
      personaId,
      OR: [{ venceEn: null }, { venceEn: { gte: hoy } }],
      AND: [{ OR: [{ liberadoEn: null }, { liberadoEn: { lte: hoy } }] }],
    },
    orderBy: [{ venceEn: "asc" }, { periodo: "asc" }],
  });

  let restan = dias;
  let periodo: number | null = null;

  for (const b of bloques) {
    if (restan <= 0) break;

    /*
     * `dias` YA es lo que queda: la hoja oficial descuenta sola lo tomado, y
     * `usados` es el histórico de esa persona, no una reserva sobre el bloque.
     *
     * Restarlo aquí impedía aprobar nada a quien tuviera muchos días en su
     * historial: un bloque con 4 días libres y 38 tomados daba "0 libres", y
     * esa persona no podía tomar vacaciones aunque las tuviera.
     */
    const libres = Number(b.dias);
    if (libres <= 0) continue;

    const toma = Math.min(libres, restan);

    /*
     * Los días salen de `dias` y se anotan en `usados`.
     *
     * Los dos a la vez: `dias` es lo que queda —y es de donde se descuenta— y
     * `usados` lo tomado, que es lo que permite enseñar "10 de 12". Tocar solo
     * uno descuadraría el total.
     */
    await db.saldoVacaciones.update({
      where: { id: b.id },
      data: {
        dias: { decrement: toma },
        usados: { increment: toma },
      },
    });

    /*
     * Queda constancia de CUÁNTO salió de ESTE bloque.
     *
     * La ausencia sola solo puede apuntar un periodo, y unas vacaciones se
     * reparten entre varios: con 7 días en un bloque y 3 en otro, pedir 8 toma
     * 7 del primero y 1 del segundo. Sin esta fila, el segundo se perdía.
     *
     * Es lo que permitirá reconstruir de qué año salieron unos días cuando las
     * hojas ya no estén.
     */
    await db.ausenciaBloque.create({
      data: {
        id: randomUUID(),
        ausenciaId,
        saldoId: b.id,
        periodo: b.periodo,
        dias: toma,
        venceEn: b.venceEn,
      },
    });

    // El que se devuelve es el PRIMERO, para la columna I de la hoja, que solo
    // admite uno. El detalle completo está en `ausencia_bloque`.
    periodo ??= b.periodo;
    restan -= toma;
  }

  return periodo;
}

export async function decidirAusencia(
  id: string,
  decision: "APROBADO" | "RECHAZADO",
): Promise<ResultadoAccion> {
  const persona = await exigirSeccion("ausencias");

  const puede =
    persona.rol === "COORDINADOR" ||
    persona.rol === "ADMIN" ||
    persona.rol === "DIRECCION";
  if (!puede) {
    return { ok: false, error: "No tienes permiso para aprobar ausencias." };
  }

  const ausencia = await db.ausencia.findUnique({
    where: { id },
    select: {
      personaId: true,
      enviadaA: true,
      tipo: true,
      fechaInicio: true,
      fechaFin: true,
    },
  });

  if (!ausencia) return { ok: false, error: "Esa solicitud ya no existe." };
  if (ausencia.personaId === persona.id && !permiteAutoAprobacion()) {
    return { ok: false, error: "No puedes decidir sobre tu propia solicitud." };
  }

  /*
   * SOLO DECIDE A QUIEN SE LE ENVIÓ.
   *
   * Tener el papel de coordinador no basta, ni serlo de esa persona: la
   * solicitud se dirige a alguien concreto y es esa persona quien responde.
   * Si no, dos coordinadores del mismo equipo podrían resolver lo que le
   * mandaron al otro.
   *
   * Las importadas de la hoja no llevan destinatario y NO se deciden aquí.
   * Son solicitudes que nadie resolvió en el gestor antiguo —algunas de 2024—
   * y aprobar hoy unas vacaciones de hace dos años descontaría saldo real por
   * algo que ya pasó. Se quedan como historial.
   */
  if (ausencia.enviadaA === null) {
    return {
      ok: false,
      error:
        "Esa solicitud viene del gestor anterior y ya no se decide aquí. " +
        "Si sigue haciendo falta, pídela de nuevo.",
    };
  }

  if (ausencia.enviadaA !== persona.id) {
    return {
      ok: false,
      error: "Esa solicitud está dirigida a otra persona.",
    };
  }

  // El filtro por estado dentro del propio update es lo que impide que dos
  // personas decidan a la vez: la segunda no encuentra fila.
  //
  // Se marca ANTES de tocar el saldo: si se consumieran los días primero y
  // otro coordinador ganara la carrera, se habrían descontado dos veces.
  const r = await db.ausencia.updateMany({
    where: { id, estado: "PENDIENTE" },
    data: {
      estado: decision === "APROBADO" ? "APROBADA" : "RECHAZADA",
      decididaPor: persona.id,
      decididaEn: new Date(),
    },
  });

  if (r.count === 0) {
    return { ok: false, error: "Esa solicitud ya había sido decidida." };
  }

  /*
   * Al aprobar VACACIONES se descuenta el saldo y se anota de qué periodo
   * salieron: es la columna I de `BDD PERMISOS`, que sin esto queda en "N/A"
   * y deja a Recursos Humanos sin saber a qué año imputar los días.
   *
   * Solo al aprobar: una solicitud rechazada no consume nada.
   */
  if (decision === "APROBADO" && ausencia.tipo === "VACACIONES") {
    const dias = diasHabilesEntre(
      deFechaDia(ausencia.fechaInicio),
      deFechaDia(ausencia.fechaFin),
    ).length;

    const periodo = await consumirVacaciones(ausencia.personaId, dias, id);
    if (periodo !== null) {
      await db.ausencia.update({ where: { id }, data: { periodo } });
    }
  }

  revalidatePath("/ausencias");

  /*
   * Y AHORA a las hojas.
   *
   * Sin esto la decisión se queda en la base con `sheet_sync = "pendiente"` y
   * no llega nunca a `BDD PERMISOS` ni a `BDD ACTIVIDAD V02`: la persona ve su
   * permiso aprobado en la pantalla y Recursos Humanos no lo ve por ningún
   * lado.
   */
  sincronizarEnSegundoPlano();

  return { ok: true };
}
