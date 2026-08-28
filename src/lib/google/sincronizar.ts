import "server-only";
import { folioDeTicket } from "@/lib/trabajo/folio";

import { google } from "googleapis";
import { credencialesGoogle } from "./credenciales";
import { db } from "@/lib/db/client";
import { BDD_MAESTRA, HOJAS } from "./hojas";

/**
 * Copia a Google Sheets de lo que se captura aquí.
 *
 * La BASE es la fuente de verdad: se guarda ahí y la persona sigue trabajando
 * al instante. La subida a las hojas viene DESPUÉS y nunca bloquea: si Google
 * falla, la fila queda en `sheet_sync = "pendiente"` y se reintenta. El dato no
 * se pierde, que es lo que importa.
 *
 * Las hojas quedan como archivo histórico y copia de seguridad mientras
 * convivan con esta herramienta; los tableros y fórmulas que las leen siguen
 * funcionando sin tocarlos. Cuando se retiren, basta con dejar de llamar a
 * `sincronizarEnSegundoPlano()`: nada más depende de esto.
 *
 * Las columnas son las mismas del Apps Script original (ver docs/MAPA-HOJAS.md).
 */

/** Las checadas viven en su propio archivo, como en el script. */
const LIBRO_CHECK_HO = "1kESIhWsCT9NfFzk_yiSq_Mac8M7CyPl2QQWAOwAsH_w";
const HOJA_CHECK_HO = "CHECK HO";

const ZONA = "America/Mexico_City";

/**
 * "14/08/2026" — el DÍA, sin convertir de zona.
 *
 * Los días de calendario se guardan como medianoche UTC. Convertirlos a hora de
 * México retrocede seis horas y caen en el día anterior: un reporte del viernes
 * aparecía en la hoja como jueves. Se leen las partes en UTC, que es donde se
 * escribieron. Para INSTANTES —una checada— sí hace falta la zona: ver `horaMX`.
 */
function fechaMX(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "16:49" en hora de México. Vacío si no hay fecha. */
function horaMX(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Un día como número comparable (AAAAMMDD), venga en el formato que venga.
 *
 * La hoja devuelve "13/8/2026" aunque se escriba "13/08/2026", y a veces el
 * número de serie de Sheets. Comparar cadenas fallaba siempre y duplicaba la
 * checada cada día.
 */
function diaComparable(v: unknown): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;

  // "13/8/2026" o "13-08-2026".
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);

  // "2026-08-13", por si alguna fila quedó en ISO.
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return Number(iso[1]) * 10000 + Number(iso[2]) * 100 + Number(iso[3]);

  // El número de serie de Sheets: días desde el 30/12/1899.
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86_400_000);
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }

  return null;
}

/**
 * Escribe la checada del día: ACTUALIZA su fila si ya está, o la añade.
 *
 * La entrada sube en cuanto se marca, y la salida llega horas después sobre la
 * MISMA checada. Con `append` a secas salían dos filas del mismo día —una con
 * la entrada sola y otra con las dos horas—, que es justo lo que hay que
 * evitar.
 *
 * Si la fila no aparece, se añade al final: nunca se sobrescribe nada ajeno.
 */
async function escribirChecada(fila: (string | number)[]) {
  const s = await clienteEscritura();
  if (!s) throw new Error("Sin credenciales de Google para escribir.");

  const [numero, nombre, fecha] = fila;

  const actual = await s.spreadsheets.values.get({
    spreadsheetId: LIBRO_CHECK_HO,
    range: `${HOJA_CHECK_HO}!A:C`,
    // Los valores como se ven en la hoja, no la fórmula ni el número de serie.
    valueRenderOption: "FORMATTED_VALUE",
  });
  const filas = actual.data.values ?? [];

  const igual = (a: unknown, b: unknown) =>
    String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();

  const dia = diaComparable(fecha);

  /*
   * Se compara por número de colaborador cuando lo hay, y por nombre cuando
   * no: diez personas del equipo no tienen número, y compararlas solo por esa
   * columna vacía haría que se pisaran entre ellas el mismo día.
   *
   * De abajo hacia arriba: si un día quedó duplicado por algo anterior, se
   * actualiza el último, que es el que la gente ve como bueno.
   */
  const conNumero = String(numero ?? "").trim() !== "";
  let encontrada = -1;
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i] ?? [];
    if (dia === null || diaComparable(f[2]) !== dia) continue;
    const mismaPersona = conNumero
      ? igual(f[0], numero)
      : String(f[0] ?? "").trim() === "" && igual(f[1], nombre);
    if (mismaPersona) {
      encontrada = i;
      break;
    }
  }

  if (encontrada >= 0) {
    // `encontrada` es índice base 0; las filas de la hoja empiezan en 1.
    await s.spreadsheets.values.update({
      spreadsheetId: LIBRO_CHECK_HO,
      range: `${HOJA_CHECK_HO}!A${encontrada + 1}:E${encontrada + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [fila] },
    });
    return;
  }

  await anexar(LIBRO_CHECK_HO, HOJA_CHECK_HO, [fila]);
}

/**
 * El nombre con el que esa persona aparece EN LAS HOJAS.
 *
 * El padrón guarda el nombre legal completo ("ALEJANDRO OROZCO ALONSO") y las
 * hojas usan el corto de siempre ("ALEJANDRO OROZCO"). Son distintos en 30 de
 * las 34 personas con número.
 *
 * Escribir el largo rompe dos cosas: la gente ve un nombre que no es el suyo
 * de toda la vida, y las diez personas sin número —que se localizan por
 * nombre— dejarían de encontrar su propia fila, duplicándola cada día.
 *
 * `nombre` solo como último recurso: es mejor un nombre largo que ninguno.
 */
function nombreDeHoja(p: { nombre: string; nombreUsuario?: string | null }): string {
  return p.nombreUsuario?.trim() || p.nombre;
}

/** El día de un INSTANTE, en hora de México. */
function diaDeInstanteMX(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [a, m, dd] = partes.split("-");
  return `${dd}/${m}/${a}`;
}

/**
 * El cliente de Sheets con permiso de ESCRITURA.
 *
 * Usa la cuenta de QUIEN ESTÁ USANDO la herramienta, igual que el Digital
 * Core: la fila de la hoja sale a nombre de quien la creó, no de un tercero.
 *
 * Solo cuando no hay nadie detrás —un script de línea de comandos— se recurre
 * al respaldo, si está configurado.
 *
 * Distinto del de `hojas.ts`, que solo lee: la ingesta histórica no tiene por
 * qué poder escribir, y separarlos evita que un error ahí toque las hojas.
 */
async function clienteEscritura() {
  const auth = await credencialesGoogle();
  if (!auth) return null;
  return google.sheets({ version: "v4", auth });
}

/**
 * ¿Se puede escribir ahora mismo?
 *
 * Basta con que haya una sesión con permisos concedidos; el respaldo por
 * variable de entorno es opcional y solo cubre a los scripts.
 */
export async function sincronizacionActiva(): Promise<boolean> {
  return (await credencialesGoogle()) !== null;
}

async function anexar(
  libro: string,
  hoja: string,
  filas: (string | number)[][],
) {
  if (filas.length === 0) return;
  const sheets = await clienteEscritura();
  if (!sheets) throw new Error("Sin credenciales de Google para escribir.");

  const r = await sheets.spreadsheets.values.append({
    spreadsheetId: libro,
    range: `${hoja}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: filas },
  });

  /*
   * La columna de HORAS se deja como número.
   *
   * Al anexar, Google copia el formato de la fila de arriba, y en la hoja de
   * actividad eso hacía que las horas heredaran formato de FECHA: un 0.5 se
   * veía como "30/12/1899". El valor guardado era correcto, pero quien mira la
   * hoja veía fechas de 1899 en vez de horas, y al borrar una fila la búsqueda
   * por horas no la encontraba nunca.
   *
   * Solo en `BDD ACTIVIDAD V02`, que es donde la columna C son horas.
   */
  if (hoja !== HOJAS.actividad) return;

  const rango = r.data.updates?.updatedRange;
  if (!rango) return;

  // "BDD ACTIVIDAD V02!A1612:L1617" → las filas que acaba de escribir.
  const m = rango.match(/!A(\d+):[A-Z]+(\d+)$/);
  if (!m) return;

  const libroInfo = await sheets.spreadsheets.get({ spreadsheetId: libro });
  const props = libroInfo.data.sheets?.find(
    (h) => h.properties?.title === hoja,
  )?.properties;
  if (props?.sheetId === undefined || props.sheetId === null) return;

  await sheets.spreadsheets
    .batchUpdate({
      spreadsheetId: libro,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: props.sheetId,
                // La API cuenta desde 0 y el fin es exclusivo.
                startRowIndex: Number(m[1]) - 1,
                endRowIndex: Number(m[2]),
                startColumnIndex: 2, // columna C
                endColumnIndex: 3,
              },
              cell: {
                userEnteredFormat: {
                  // Un decimal, como quedó la hoja: así las medias horas se ven
                  // "0.5" y las enteras "8.0", todas con el mismo aspecto.
                  numberFormat: { type: "NUMBER", pattern: "0.0" },
                },
              },
              fields: "userEnteredFormat.numberFormat",
            },
          },
        ],
      },
    })
    // Que no se caiga la subida por esto: las filas ya están escritas y su
    // valor es correcto; lo único en juego es cómo se ven.
    .catch((e: unknown) => {
      console.error(
        "[sync] No se pudo dar formato a las horas:",
        e instanceof Error ? e.message : e,
      );
    });
}

/**
 * La etiqueta con la que se RESERVA un lote antes de subirlo.
 *
 * Sin ella, dos subidas simultáneas leerían las mismas filas pendientes y las
 * escribirían dos veces. Al marcarlas primero con una etiqueta única, la
 * segunda corrida ya no las ve.
 */
function etiqueta(): string {
  return `env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Filas cuya reserva quedó colgada de una corrida que murió a medias. */
const MINUTOS_HUERFANA = 10;

export interface ResultadoSync {
  ok: boolean;
  enviadas: number;
  error?: string;
}

/**
 * Sube lo que falte por subir.
 *
 * El ciclo de cada fila: `pendiente` → etiqueta de reserva → `ok`. Si algo
 * falla, la reserva se deshace y vuelve a `pendiente` para el siguiente
 * intento.
 */
export async function sincronizarPendientes(): Promise<ResultadoSync> {
  if (!(await sincronizacionActiva())) {
    return {
      ok: false,
      enviadas: 0,
      error: "Sin credenciales de Google: la cola queda pendiente.",
    };
  }

  const marca = etiqueta();
  let enviadas = 0;

  // Lo que se deshace si algo revienta a mitad.
  const aDevolver: Array<() => Promise<unknown>> = [];

  try {
    // Rescate: reservas de una corrida que murió sin terminar.
    const limite = new Date(Date.now() - MINUTOS_HUERFANA * 60_000);
    await Promise.all([
      db.hora.updateMany({
        where: { sheetSync: { startsWith: "env-" }, actualizadoEn: { lt: limite } },
        data: { sheetSync: "pendiente" },
      }),
      db.ausencia.updateMany({
        where: { sheetSync: { startsWith: "env-" }, actualizadoEn: { lt: limite } },
        data: { sheetSync: "pendiente" },
      }),
      db.ticket.updateMany({
        where: { sheetSync: { startsWith: "env-" }, actualizadoEn: { lt: limite } },
        data: { sheetSync: "pendiente" },
      }),
      db.checada.updateMany({
        where: { sheetSync: { startsWith: "env-" }, actualizadoEn: { lt: limite } },
        data: { sheetSync: "pendiente" },
      }),
    ]);

    // ── HORAS → BDD ACTIVIDAD V02 ──────────────────────────────────────────
    // `origen: "app"` es el cinturón: lo importado de la hoja no vuelve a ella
    // por mucho que su estado diga "pendiente".
    await db.hora.updateMany({
      where: { sheetSync: "pendiente", origen: "app" },
      data: { sheetSync: marca },
    });
    aDevolver.push(() =>
      db.hora.updateMany({
        where: { sheetSync: marca },
        data: { sheetSync: "pendiente" },
      }),
    );

    const horas = await db.hora.findMany({
      where: { sheetSync: marca },
      orderBy: { creadoEn: "asc" },
      take: 200,
      select: {
        id: true,
        fecha: true,
        horas: true,
        disciplina: true,
        tipo: true,
        esfuerzo: true,
        comentario: true,
        pago: true,
        categoria: true,
        entregableTexto: true,
        proyectoTexto: true,
        persona: { select: { nombre: true, nombreUsuario: true } },
        proyecto: { select: { nombre: true } },
        entregable: { select: { nombre: true } },
      },
    });

    if (horas.length > 0) {
      await anexar(
        BDD_MAESTRA,
        HOJAS.actividad,
        horas.map((h) => [
          // A..L, el orden del script de siempre.
          fechaMX(h.fecha),
          nombreDeHoja(h.persona),
          Number(h.horas),
          h.proyecto?.nombre ?? h.proyectoTexto ?? "",
          h.entregable?.nombre ?? h.entregableTexto ?? "",
          h.disciplina ?? "",
          h.tipo ?? "",
          h.comentario ?? "",
          h.pago ?? "PAGADO",
          h.categoria ?? "NORMAL",
          // K queda vacía (era el coordinador de las horas extra) y el
          // esfuerzo va en L, como en el reporte normal.
          "",
          h.esfuerzo ?? "",
        ]),
      );
      await db.hora.updateMany({
        where: { id: { in: horas.map((h) => h.id) } },
        data: { sheetSync: "ok" },
      });
      enviadas += horas.length;
    }

    /*
     * ── AUSENCIAS → BDD PERMISOS ─────────────────────────────────────────
     *
     * Solo las ya decididas: una pendiente todavía puede cambiar.
     *
     * Y solo las creadas DESPUÉS de la última fila importada. Es una
     * salvaguarda deliberada: si una ausencia que vino de la hoja se marca por
     * error como pendiente, se devolvería a su origen y quedaría duplicada
     * —pasó con 680 permisos—. El estado "hoja" ya lo evita; esto lo evita
     * también cuando el estado está mal.
     */
    await db.ausencia.updateMany({
      where: {
        sheetSync: "pendiente",
        estado: { in: ["APROBADA", "RECHAZADA"] },
      },
      data: { sheetSync: marca },
    });
    aDevolver.push(() =>
      db.ausencia.updateMany({
        where: { sheetSync: marca },
        data: { sheetSync: "pendiente" },
      }),
    );

    const ausencias = await db.ausencia.findMany({
      where: { sheetSync: marca },
      orderBy: { creadoEn: "asc" },
      take: 200,
      select: {
        id: true,
        tipo: true,
        fechaInicio: true,
        fechaFin: true,
        horas: true,
        motivo: true,
        estado: true,
        periodo: true,
        persona: { select: { nombre: true, nombreUsuario: true, horasDia: true } },
        destinatario: { select: { nombre: true, nombreUsuario: true } },
      },
    });

    if (ausencias.length > 0) {
      // UNA FILA POR DÍA HÁBIL, como la hoja de siempre: una ausencia de tres
      // días son tres renglones. Los tableros cuentan renglones, no rangos.
      const filas: (string | number)[][] = [];

      for (const a of ausencias) {
        const jornada = Number(a.persona.horasDia);
        const horas = a.horas === null ? jornada : Number(a.horas);
        const decision = a.estado === "APROBADA" ? "PAGADO" : "NO AUTORIZADO";

        for (const dia of diasHabilesEntre(a.fechaInicio, a.fechaFin)) {
          filas.push([
            nombreDeHoja(a.persona),
            a.tipo,
            fechaMX(dia),
            horas,
            a.motivo ?? "",
            decision,
            decision,
            a.destinatario ? nombreDeHoja(a.destinatario) : "",
            a.periodo === null ? "N/A" : String(a.periodo),
          ]);
        }
      }

      await anexar(BDD_MAESTRA, HOJAS.permisos, filas);

      /*
       * Las ausencias APROBADAS van TAMBIÉN a la hoja de actividad.
       *
       * Los tableros de la empresa cuentan renglones de `BDD ACTIVIDAD V02`
       * para saber cuántas horas tuvo cada quien. Si un permiso solo llega a
       * `BDD PERMISOS`, esos días desaparecen del total: la persona aparece
       * con menos horas de las que le corresponden.
       *
       * Ocupan el lugar del proyecto con la palabra "AUSENCIAS" y se marcan
       * como "AUSENCIA" en el esfuerzo, igual que hacía el script de siempre.
       * Las rechazadas no: no son horas de nadie.
       */
      const deActividad: (string | number)[][] = [];

      for (const a of ausencias) {
        if (a.estado !== "APROBADA") continue;

        const jornada = Number(a.persona.horasDia);
        const horas = a.horas === null ? jornada : Number(a.horas);

        for (const dia of diasHabilesEntre(a.fechaInicio, a.fechaFin)) {
          deActividad.push([
            fechaMX(dia),
            nombreDeHoja(a.persona),
            horas,
            "AUSENCIAS",
            "",
            "",
            a.tipo,
            a.motivo ?? "",
            a.estado,
            "AUSENCIA",
            a.destinatario ? nombreDeHoja(a.destinatario) : "",
            "",
          ]);
        }
      }

      if (deActividad.length > 0) {
        await anexar(BDD_MAESTRA, HOJAS.actividad, deActividad);
      }

      await db.ausencia.updateMany({
        where: { id: { in: ausencias.map((a) => a.id) } },
        data: { sheetSync: "ok" },
      });
      enviadas += ausencias.length;
    }

    // ── TICKETS → BDD MANTENIMIENTO ────────────────────────────────────────
    await db.ticket.updateMany({
      where: { sheetSync: "pendiente" },
      data: { sheetSync: marca },
    });
    aDevolver.push(() =>
      db.ticket.updateMany({
        where: { sheetSync: marca },
        data: { sheetSync: "pendiente" },
      }),
    );

    const tickets = await db.ticket.findMany({
      where: { sheetSync: marca },
      orderBy: { creadoEn: "asc" },
      take: 200,
      select: {
        id: true,
        numero: true,
        titulo: true,
        detalle: true,
        clase: true,
        falla: true,
        prioridad: true,
        creadoEn: true,
        persona: { select: { nombre: true, nombreUsuario: true } },
      },
    });

    if (tickets.length > 0) {
      await anexar(
        BDD_MAESTRA,
        HOJAS.mantenimiento,
        tickets.map((t) => [
          // A..G: fecha, código, colaborador, tipo, problema, detalle, urgencia.
          diaDeInstanteMX(t.creadoEn),
          // El código del gestor de siempre: AAMMDD_TIPO_NNNNN, como
          // "260611_HARD_26020". Es lo que Sistemas lee en la hoja; un
          // "TCK-001" no se parece a nada de lo que hay ahí.
          folioDeTicket(t.clase, t.numero, t.creadoEn),
          nombreDeHoja(t.persona),
          t.clase ?? "SOFTWARE",
          t.falla ?? t.titulo,
          t.detalle ?? t.titulo,
          t.prioridad,
        ]),
      );
      await db.ticket.updateMany({
        where: { id: { in: tickets.map((t) => t.id) } },
        data: { sheetSync: "ok" },
      });
      enviadas += tickets.length;
    }

    /*
     * ── CHECADAS → CHECK HO (otro libro) ──────────────────────────────────
     *
     * Sube en cuanto se marca la ENTRADA, no al cerrar el día: así la fila
     * aparece en la hoja al momento, como en el Gestor de siempre. La salida
     * llega horas después y ACTUALIZA esa misma fila (ver `escribirChecada`).
     */
    await db.checada.updateMany({
      where: { sheetSync: "pendiente" },
      data: { sheetSync: marca },
    });
    aDevolver.push(() =>
      db.checada.updateMany({
        where: { sheetSync: marca },
        data: { sheetSync: "pendiente" },
      }),
    );

    const checadas = await db.checada.findMany({
      where: { sheetSync: marca },
      orderBy: { creadoEn: "asc" },
      take: 200,
      select: {
        id: true,
        fecha: true,
        entrada: true,
        salida: true,
        persona: { select: { nombre: true, nombreUsuario: true, numero: true } },
      },
    });

    if (checadas.length > 0) {
      // Una por una, no en bloque: cada una busca su fila del día para
      // actualizarla, y un `append` masivo duplicaría las que ya están.
      for (const c of checadas) {
        await escribirChecada([
          c.persona.numero ?? "",
          nombreDeHoja(c.persona),
          fechaMX(c.fecha),
          horaMX(c.entrada),
          horaMX(c.salida),
        ]);
      }

      /*
       * Vuelve a "pendiente" mientras el día siga abierto.
       *
       * La fila ya está en la hoja con la entrada, pero al marcar la salida
       * hay que volver a escribirla. Marcarla "ok" ahora la sacaría de la cola
       * y la salida no llegaría nunca.
       */
      await db.checada.updateMany({
        where: {
          id: { in: checadas.filter((c) => c.salida !== null).map((c) => c.id) },
        },
        data: { sheetSync: "ok" },
      });
      await db.checada.updateMany({
        where: {
          id: { in: checadas.filter((c) => c.salida === null).map((c) => c.id) },
        },
        data: { sheetSync: "pendiente" },
      });
      enviadas += checadas.length;
    }

    return { ok: true, enviadas };
  } catch (e) {
    // Deshace las reservas para que el siguiente intento las vuelva a tomar.
    // Lo ya marcado "ok" no se toca: eso sí llegó a la hoja.
    for (const deshacer of aDevolver) {
      await deshacer().catch(() => null);
    }
    return {
      ok: false,
      enviadas,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Quita de `BDD ACTIVIDAD V02` la fila de un registro que se acaba de borrar.
 *
 * Sin esto, borrar una hora la quita de la aplicación pero la deja en la hoja
 * que alimentan los tableros de la empresa: la persona la ve desaparecer y
 * sigue contando en nómina.
 *
 * Se busca por lo que la identifica —día, persona, horas y entregable— porque
 * la hoja no guarda el id de la base. De abajo hacia arriba: si hay varias
 * iguales se quita la última, que es la que acaba de subir.
 *
 * Devuelve `false` si no la encuentra; entonces el borrado en la base sigue
 * adelante y se avisa, porque perder el registro es peor que dejar la fila.
 */
export async function quitarDeLaHoja(datos: {
  fecha: Date;
  nombre: string;
  horas: number;
  entregable: string;
}): Promise<boolean> {
  const s = await clienteEscritura();
  if (!s) return false;

  /*
   * Las HORAS se leen sin formato; la fecha, con él.
   *
   * Google puede tener la columna de horas con formato de fecha —lo arrastra
   * del `append`—, y entonces un 0.5 se lee como "30/12/1899" y la
   * comparación numérica no encuentra nunca la fila. El valor guardado sí es
   * correcto, así que se pide crudo.
   *
   * La fecha, en cambio, se necesita como se ve: "27/8/2026".
   */
  const [conFormato, sinFormato] = await Promise.all([
    s.spreadsheets.values.get({
      spreadsheetId: BDD_MAESTRA,
      range: `${HOJAS.actividad}!A:E`,
      valueRenderOption: "FORMATTED_VALUE",
    }),
    s.spreadsheets.values.get({
      spreadsheetId: BDD_MAESTRA,
      range: `${HOJAS.actividad}!C:C`,
      valueRenderOption: "UNFORMATTED_VALUE",
    }),
  ]);
  const filas = conFormato.data.values ?? [];
  const horasCrudas = sinFormato.data.values ?? [];

  const igual = (a: unknown, b: unknown) =>
    String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();

  const dia = diaComparable(fechaMX(datos.fecha));

  let encontrada = -1;
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i] ?? [];
    if (dia === null || diaComparable(f[0]) !== dia) continue;
    if (!igual(f[1], datos.nombre)) continue;
    // Las horas, del valor crudo: el formateado puede venir como fecha.
    const horasFila = Number(horasCrudas[i]?.[0] ?? NaN);
    if (horasFila !== datos.horas) continue;
    if (datos.entregable && !igual(f[4], datos.entregable)) continue;
    encontrada = i;
    break;
  }

  if (encontrada < 0) return false;

  const libro = await s.spreadsheets.get({ spreadsheetId: BDD_MAESTRA });
  const props = libro.data.sheets?.find(
    (h) => h.properties?.title === HOJAS.actividad,
  )?.properties;
  if (props?.sheetId === undefined || props.sheetId === null) return false;

  await s.spreadsheets.batchUpdate({
    spreadsheetId: BDD_MAESTRA,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: props.sheetId,
              dimension: "ROWS",
              startIndex: encontrada,
              endIndex: encontrada + 1,
            },
          },
        },
      ],
    },
  });

  return true;
}

/**
 * Lanza la subida sin esperarla.
 *
 * Se llama después de guardar: la persona no tiene por qué esperar a Google.
 * `waitUntil` de Vercel mantiene viva la tarea después de responder; fuera de
 * Vercel no existe y el `import` dinámico falla en silencio, que es correcto
 * porque en un servidor propio el proceso sigue vivo de todas formas.
 */
export function sincronizarEnSegundoPlano(): void {
  /*
   * El fallo se registra, no se traga.
   *
   * Si Google rechaza la escritura, las filas vuelven a "pendiente" y el
   * siguiente intento las recoge: no se pierde nada. Pero sin dejar rastro,
   * una credencial caducada haría que nada subiera durante días sin que
   * nadie se enterara. El contador de la pantalla lo delataría; esto dice
   * además POR QUÉ.
   */
  const tarea = sincronizarPendientes()
    .then((r) => {
      if (!r.ok) {
        console.error("[sync] Google rechazó la subida:", r.error);
      }
      return r;
    })
    .catch((e: unknown) => {
      console.error(
        "[sync] La subida falló:",
        e instanceof Error ? e.message : e,
      );
      return null;
    });

  import("@vercel/functions")
    .then(({ waitUntil }) => waitUntil(tarea))
    .catch(() => null);
}

/** Cuántas filas esperan subir. Para el aviso de la pantalla. */
export async function pendientesDeSync(): Promise<number> {
  /*
   * "hoja" NO está pendiente: son las filas importadas del gestor antiguo,
   * que ya viven en el spreadsheet. Contarlas dejaría el aviso de "pendientes
   * de subir" encendido para siempre con cientos de filas que no hay que
   * subir — y que además nunca deben volver a su propia fuente.
   */
  const noSubido = { sheetSync: { notIn: ["ok", "hoja"] } };
  const [h, a, t, c] = await Promise.all([
    db.hora.count({ where: { ...noSubido, origen: "app" } }),
    db.ausencia.count({
      where: { ...noSubido, estado: { in: ["APROBADA", "RECHAZADA"] } },
    }),
    db.ticket.count({ where: noSubido }),
    db.checada.count({ where: noSubido }),
  ]);
  return h + a + t + c;
}

/**
 * Los días hábiles entre dos fechas de columna `date`, ambos incluidos.
 *
 * Se calcula en UTC porque así se guardaron. Si el rango entero cae en fin de
 * semana devuelve el día de inicio: una ausencia de un sábado no debe
 * desaparecer de la hoja sin dejar rastro.
 */
function diasHabilesEntre(inicio: Date, fin: Date): Date[] {
  const dias: Date[] = [];
  const cursor = new Date(inicio);

  while (cursor <= fin) {
    const d = cursor.getUTCDay();
    if (d !== 0 && d !== 6) dias.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dias.length > 0 ? dias : [new Date(inicio)];
}
