"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronRight,
  Info,
  Plus,
  X,
} from "lucide-react";
import {
  cancelarAusencia,
  decidirAusencia,
  solicitarAusencia,
} from "@/lib/gestor/actions";
import type { AbsenceView } from "@/lib/trabajo/queries";
import type { SaldoVacaciones } from "@/lib/gestor/queries";
import { CvPortal } from "@/components/conexion/CvPortal";

/**
 * Ausencias — saldo, calendario del mes y solicitudes reales.
 *
 * El saldo sale de los bloques de vacaciones de la persona, con su fecha de
 * vencimiento: los días caducados no cuentan. Es la misma regla del Gestor,
 * donde cada bloque vivía en una celda con su vencimiento al lado.
 */

const ST_UI: Record<
  string,
  { edge: string; soft: string; ink: string; label: string }
> = {
  pendiente: {
    edge: "#F5B843",
    soft: "#FDF3DC",
    ink: "#B07C10",
    label: "Pendiente",
  },
  APROBADO: {
    edge: "#32D66B",
    soft: "#E4F8EB",
    ink: "#178A49",
    label: "Aprobada",
  },
  RECHAZADO: {
    edge: "#E95E64",
    soft: "#FCE9EA",
    ink: "#B23A40",
    label: "Rechazada",
  },
};

/**
 * "17 de agosto" — el día tal como se pidió.
 *
 * `timeZone: "UTC"` es imprescindible: las fechas se guardan como medianoche
 * UTC, y sin fijarla `Intl` las lee en la zona del navegador —seis horas
 * antes en México— y muestra el día anterior.
 */
function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

function rango(a: AbsenceView): string {
  const s = new Date(a.startDate);
  const e = new Date(a.endDate);
  if (s.getTime() === e.getTime()) return fechaCorta(a.startDate);
  return `${fechaCorta(a.startDate).split(" de ")[0]} – ${fechaCorta(a.endDate)}`;
}

/** "Agosto 2026", para agrupar las solicitudes por mes. */
function mesDe(iso: string): string {
  const t = new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function AusenciasScreen({
  lista,
  usados,
  disponibles,
  saldo,
  liberaciones,
  tipos,
  aprobadores,
  porAprobar,
  puedoAprobar,
}: {
  lista: AbsenceView[];
  usados: number;
  disponibles: number;
  /// Bloques con su vencimiento, para el panel lateral.
  saldo: SaldoVacaciones;
  /// Lo que aún no se libera, con su fecha.
  liberaciones: { dias: number; fecha: string }[];
  /// Tipos del catálogo real, no una lista escrita a mano.
  tipos: string[];
  /// Quiénes pueden recibir la solicitud: el "Enviar a" del Gestor.
  aprobadores: { email: string; userName: string; correo?: string | null }[];
  porAprobar: AbsenceView[];
  puedoAprobar: boolean;
}) {
  const [solicitando, setSolicitando] = useState(false);
  const [pestana, setPestana] = useState<"mias" | "aprobar">("mias");
  // La solicitud abierta en el panel: se puede revisar lo que se mandó.
  const [detalle, setDetalle] = useState<AbsenceView | null>(null);
  const [, startTransition] = useTransition();

  const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

  const pendientes = lista.filter((a) => a.status === "pendiente").length;

  // `hoy` fijado al montar: el calendario no necesita reaccionar al cambio de
  // día en vivo, y así el useMemo de las celdas no se recalcula por gusto.
  const [hoy] = useState(() => new Date());
  const [mes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));

  const nombreMes = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(mes);

  // Celdas del calendario: 35 huecos empezando en lunes.
  const celdas = useMemo(() => {
    const primerDow = (mes.getDay() + 6) % 7; // lunes=0
    const diasDelMes = new Date(
      mes.getFullYear(),
      mes.getMonth() + 1,
      0,
    ).getDate();

    /*
     * El día del calendario que cubre una ausencia.
     *
     * Las fechas se guardan como medianoche UTC —un permiso del 17 es
     * `2026-08-17T00:00:00Z`—, así que hay que leerlas en UTC. Con
     * `getFullYear()`, que responde en hora local, se retrocedían seis horas
     * y todo el calendario quedaba corrido un día: el permiso del 17 pintaba
     * el 16.
     *
     * Se comparan como número —20260817— para no depender de husos.
     */
    const comoNumero = (a: number, m: number, dia: number) =>
      a * 10000 + m * 100 + dia;

    const enAusencia = (d: Date): AbsenceView | undefined => {
      const dia = comoNumero(d.getFullYear(), d.getMonth() + 1, d.getDate());
      return lista.find((a) => {
        if (a.status === "RECHAZADO") return false;
        const s = new Date(a.startDate);
        const e = new Date(a.endDate);
        return (
          dia >= comoNumero(s.getUTCFullYear(), s.getUTCMonth() + 1, s.getUTCDate()) &&
          dia <= comoNumero(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate())
        );
      });
    };

    return Array.from({ length: 35 }, (_, i) => {
      const n = i - primerDow + 1;
      if (n < 1 || n > diasDelMes) return { n: "", tipo: "fuera" as const };
      const d = new Date(mes.getFullYear(), mes.getMonth(), n);
      const aus = enAusencia(d);
      const esHoy =
        n === hoy.getDate() &&
        mes.getMonth() === hoy.getMonth() &&
        mes.getFullYear() === hoy.getFullYear();
      return {
        n: String(n),
        tipo: aus
          ? aus.status === "APROBADO"
            ? ("aprobada" as const)
            : ("pendiente" as const)
          : esHoy
            ? ("hoy" as const)
            : ("normal" as const),
        tip: aus
          ? `${aus.type} (${ST_UI[aus.status]?.label.toLowerCase()})`
          : esHoy
            ? "Hoy"
            : "",
      };
    });
  }, [lista, mes, hoy]);

  const CELDA_UI = {
    fuera: { bg: "transparent", c: "var(--cv-faint)", ring: "none", w: 500 },
    normal: {
      bg: "#fff",
      c: "var(--cv-ink-2)",
      ring: "inset 0 0 0 1px var(--cv-line-soft)",
      w: 500,
    },
    hoy: {
      bg: "#E4F8EB",
      c: "#178A49",
      ring: "inset 0 0 0 1.5px var(--cv-green)",
      w: 700,
    },
    pendiente: {
      bg: "#FDF3DC",
      c: "#B07C10",
      ring: "inset 0 0 0 1px #F0D9A0",
      w: 700,
    },
    aprobada: {
      bg: "#E4F8EB",
      c: "#178A49",
      ring: "inset 0 0 0 1px #BEE8CC",
      w: 700,
    },
  };

  /* ------------------------------ el anillo ---------------------------- */
  // El total otorgado es lo disponible más lo ya usado: sin eso el anillo no
  // tendría contra qué comparar.
  const totalOtorgado = disponibles + usados;
  const CIRCUNFERENCIA = 2 * Math.PI * 40;
  const anilloUsado =
    totalOtorgado > 0 ? (disponibles / totalOtorgado) * CIRCUNFERENCIA : 0;

  // El chip muestra SOLO la siguiente liberación: sumar los tres decía "22
  // se liberan pronto" cuando el último bloque está a 15 meses.
  const proximaLib = liberaciones.length > 0 ? liberaciones[0] : null;

  // En UTC, como el resto: son días de calendario, no instantes.
  const fechaLarga = (iso: string) =>
    new Intl.DateTimeFormat("es-MX", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));

  /** "en 3 meses", "en 12 d" — la distancia dice más que la fecha sola. */
  const relativo = (iso: string) => {
    const dias = Math.ceil(
      (new Date(iso).getTime() - hoy.getTime()) / 86400000,
    );
    if (dias <= 0) return "hoy";
    if (dias < 30) return `en ${dias} d`;
    const meses = Math.round(dias / 30);
    return `en ${meses} ${meses === 1 ? "mes" : "meses"}`;
  };

  /* --------------------------- vencimientos ---------------------------- */
  const vencimientos = useMemo(
    () =>
      saldo.bloques
        .filter((b) => new Date(b.vence) >= hoy)
        .map((b) => {
          const faltan = Math.ceil(
            (new Date(b.vence).getTime() - hoy.getTime()) / 86400000,
          );
          // Menos de 60 días es urgente: son días que se pierden si nadie los
          // toma a tiempo.
          const tono =
            faltan <= 60
              ? {
                  bg: "#FDF0F1",
                  border: "#F5C6C9",
                  dotBg: "#FCE9EA",
                  dotC: "#B23A40",
                  relC: "#B23A40",
                }
              : faltan <= 150
                ? {
                    bg: "#FFFDF7",
                    border: "#F0D9A0",
                    dotBg: "#FDF3DC",
                    dotC: "#B07C10",
                    relC: "#B07C10",
                  }
                : {
                    bg: "var(--cv-faint)",
                    border: "var(--cv-line-soft)",
                    dotBg: "#E9F1FB",
                    dotC: "#31677F",
                    relC: "var(--cv-ink-3)",
                  };
          return {
            dias: Math.max(0, b.dias - b.usados),
            fecha: fechaLarga(b.vence),
            periodo: b.periodo ? `Periodo ${b.periodo}` : "Periodo en curso",
            rel: relativo(b.vence),
            ...tono,
          };
        }),
    // `hoy` queda fijo al montar, así que la lista no se recalcula sola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saldo.bloques, hoy],
  );

  /** El bloque más cercano decide el tono del encabezado. */
  const urgencia = useMemo(() => {
    const proximos = saldo.bloques
      .filter((b) => new Date(b.vence) >= hoy)
      .map((b) =>
        Math.ceil((new Date(b.vence).getTime() - hoy.getTime()) / 86400000),
      )
      .sort((a, b) => a - b);
    if (proximos.length === 0)
      return {
        soft: "var(--cv-faint)",
        ink: "var(--cv-ink-3)",
        label: "Sin días",
      };
    if (proximos[0] <= 60)
      return { soft: "#FCE9EA", ink: "#B23A40", label: "Urgente" };
    if (proximos[0] <= 150)
      return { soft: "#FDF3DC", ink: "#B07C10", label: "Pronto" };
    return { soft: "#E4F8EB", ink: "#178A49", label: "Con tiempo" };
  }, [saldo.bloques, hoy]);

  /* ------------------------ próximas liberaciones ---------------------- */
  const COLORES_LIB = [
    {
      dot: "var(--cv-green)",
      halo: "rgba(50,214,107,.18)",
      relC: "#178A49",
      relBg: "#E4F8EB",
    },
    {
      dot: "var(--cv-teal)",
      halo: "rgba(57,184,180,.18)",
      relC: "#22726F",
      relBg: "#DDF7F4",
    },
    {
      dot: "#C8D6E2",
      halo: "rgba(200,214,226,.3)",
      relC: "var(--cv-ink-3)",
      relBg: "var(--cv-faint)",
    },
  ];
  const libsVista = liberaciones.map((l, i) => ({
    dias: l.dias,
    fecha: fechaLarga(l.fecha),
    rel: relativo(l.fecha),
    ...COLORES_LIB[Math.min(i, COLORES_LIB.length - 1)],
  }));

  /**
   * Los días que descuenta, con la fracción real de una ausencia parcial.
   *
   * Se recorre en UTC porque las fechas se guardan como medianoche UTC: con
   * `getDay()`, que responde en hora local, el sábado se leería como viernes y
   * los fines de semana dejarían de saltarse bien.
   */
  const diasDeAusencia = (a: AbsenceView) => {
    const ini = new Date(a.startDate);
    const fin = new Date(a.endDate);
    let n = 0;
    const d = new Date(ini);
    while (d <= fin) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) n++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    // Parcial: la fracción sale de las horas, no de media jornada fija.
    if (a.halfDay && a.hours && a.hours > 0) return (n * a.hours) / 8;
    return n;
  };

  /** Cuántos días naturales cubre una solicitud. */
  const diasDe = (a: AbsenceView) => {
    const ini = new Date(a.startDate);
    const fin = new Date(a.endDate);
    const n = Math.max(
      1,
      Math.round((fin.getTime() - ini.getTime()) / 86400000) + 1,
    );
    return `${n} ${n === 1 ? "día" : "días"}`;
  };

  /**
   * Las solicitudes agrupadas por mes, de la más reciente a la más antigua.
   *
   * Un listado plano de un año entero no se recorre: agrupado, se localiza el
   * mes que interesa de un vistazo. El total de días por mes va en el
   * encabezado, que es la pregunta que se hace al mirarlo.
   */
  /*
   * Qué meses se ven desplegados.
   *
   * Solo el más reciente empieza abierto: con un año de historia, tenerlo todo
   * extendido obliga a bajar por decenas de tarjetas para llegar a lo de
   * siempre, que es lo último. Los demás se abren con un clic.
   *
   * `null` significa "aún no se ha tocado nada": en cuanto la persona abre o
   * cierra algo, manda su elección y se respeta.
   */
  const [mesesAbiertos, setMesesAbiertos] = useState<Set<string> | null>(null);

  const porMes = useMemo(() => {
    const grupos = new Map<string, AbsenceView[]>();
    for (const a of lista) {
      const k = mesDe(a.startDate);
      (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(a);
    }
    return [...grupos.entries()].map(([mes, items]) => ({
      mes,
      items,
      // Solo lo que cuenta como ausencia real: lo rechazado no descuenta nada.
      dias: items
        .filter((a) => a.status !== "RECHAZADO")
        .reduce((n, a) => n + diasDeAusencia(a), 0),
    }));
  }, [lista]);

  // El primero de la lista es el más reciente: ese es el que se ve abierto
  // mientras la persona no diga otra cosa.
  const mesAbierto = (mes: string) =>
    mesesAbiertos === null ? mes === porMes[0]?.mes : mesesAbiertos.has(mes);

  const alternarMes = (mes: string) =>
    setMesesAbiertos((previo) => {
      const base = previo ?? new Set(porMes[0] ? [porMes[0].mes] : []);
      const siguiente = new Set(base);
      if (siguiente.has(mes)) siguiente.delete(mes);
      else siguiente.add(mes);
      return siguiente;
    });

  return (
    <div style={{ padding: "24px 28px 40px" }}>
      {/* ------------------------------------------------------- cabecera -- */}
      <div
        className="cv-rise"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 14,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 250 }}>
          <h1
            className="soh-display"
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.028em",
              color: "var(--cv-ink)",
              margin: 0,
            }}
          >
            Ausencias
          </h1>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--cv-ink-3)",
              margin: "4px 0 0",
            }}
          >
            Solicita permisos y consulta tus días disponibles
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSolicitando(true)}
          className="cv-btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            border: "none",
            background: "var(--cv-green-ink)",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 700,
            padding: "10px 16px",
            borderRadius: 11,
            boxShadow: "0 8px 18px rgba(25,153,80,.25)",
          }}
        >
          <Plus size={14} strokeWidth={2.6} />
          Solicitar ausencia
        </button>
      </div>

      {/* ------------------------------------------------------- pestañas -- */}
      {puedoAprobar && (
        <div
          className="cv-rise"
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          {(
            [
              ["mias", "Mis ausencias"],
              ["aprobar", "Por aprobar"],
            ] as const
          ).map(([t, txt]) => {
            const on = pestana === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setPestana(t)}
                aria-current={on ? "page" : undefined}
                className="cv-btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  border: `1px solid ${on ? "var(--cv-navy)" : "var(--cv-line)"}`,
                  background: on ? "var(--cv-navy)" : "#fff",
                  color: on ? "#fff" : "var(--cv-ink-2)",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "8px 14px",
                  borderRadius: 11,
                }}
              >
                {txt}
                {t === "aprobar" && porAprobar.length > 0 && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 20,
                      background: on ? "rgba(245,184,67,.22)" : "#FDF3DC",
                      color: on ? "#F5B843" : "#B07C10",
                    }}
                  >
                    {porAprobar.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════ MIS AUSENCIAS ════════ */}
      {pestana === "mias" && (
        <div className="cv-aus-grid">
          {/* ───────────── izquierda: saldo, vencimientos, liberaciones ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              className="cv-chrome-dots cv-rise"
              style={{
                position: "relative",
                borderRadius: 18,
                background:
                  "linear-gradient(150deg, var(--cv-navy), var(--cv-deep))",
                padding: "18px 20px",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: -70,
                  right: -50,
                  width: 230,
                  height: 230,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(50,214,107,.16), transparent 66%)",
                  filter: "blur(22px)",
                }}
              />
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 17,
                }}
              >
                <span
                  style={{
                    position: "relative",
                    width: 86,
                    height: 86,
                    flexShrink: 0,
                  }}
                >
                  <svg
                    viewBox="0 0 100 100"
                    style={{
                      width: 86,
                      height: 86,
                      transform: "rotate(-90deg)",
                    }}
                    aria-hidden="true"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="rgba(255,255,255,.11)"
                      strokeWidth="9"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="var(--cv-green)"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray={`${anilloUsado} ${CIRCUNFERENCIA}`}
                    />
                  </svg>
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      className="soh-display"
                      style={{
                        fontSize: 27,
                        fontWeight: 700,
                        color: "#fff",
                        lineHeight: 1,
                      }}
                    >
                      {fmt(disponibles)}
                    </span>
                    <span
                      className="soh-mono"
                      style={{
                        fontSize: 8.5,
                        color: "var(--cv-dk-3)",
                        letterSpacing: ".06em",
                      }}
                    >
                      DE {fmt(totalOtorgado)}
                    </span>
                  </span>
                </span>

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="soh-mono"
                    style={{
                      display: "block",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".14em",
                      textTransform: "uppercase",
                      color: "var(--cv-dk-3)",
                    }}
                  >
                    Días de vacaciones
                  </span>
                  <span
                    className="soh-display"
                    style={{
                      display: "block",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      marginTop: 4,
                      letterSpacing: "-.02em",
                    }}
                  >
                    {disponibles === 0
                      ? "No tienes días disponibles"
                      : `Tienes ${fmt(disponibles)} ${disponibles === 1 ? "día" : "días"} disponibles`}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: "var(--cv-dk-2)",
                      lineHeight: 1.5,
                      marginTop: 5,
                    }}
                  >
                    Se descuentan primero los días que vencen antes.
                    {usados > 0 ? ` ${fmt(usados)} usados.` : ""}
                  </span>
                </span>
              </div>

              <div
                style={{
                  position: "relative",
                  display: "flex",
                  gap: 8,
                  marginTop: 15,
                }}
              >
                {(
                  [
                    [fmt(usados), "utilizados", "#fff"],
                    [String(pendientes), "por aprobar", "#F5B843"],
                    [
                      proximaLib ? fmt(proximaLib.dias) : "—",
                      proximaLib
                        ? `se liberan ${relativo(proximaLib.fecha)}`
                        : "sin liberaciones",
                      "var(--cv-teal)",
                    ],
                  ] as const
                ).map(([valor, label, color]) => (
                  <span
                    key={label}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,.05)",
                      border: "1px solid rgba(255,255,255,.08)",
                      borderRadius: 11,
                      padding: "9px 11px",
                    }}
                  >
                    <span
                      className="soh-display"
                      style={{
                        display: "block",
                        fontSize: 16,
                        fontWeight: 700,
                        color,
                        lineHeight: 1,
                      }}
                    >
                      {valor}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 9.5,
                        color: "var(--cv-dk-3)",
                        marginTop: 2,
                      }}
                    >
                      {label}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* ─────────────────────────────── fechas de vencimiento ── */}
            <div
              className="cv-card cv-rise"
              style={{
                borderRadius: 16,
                padding: "15px 17px",
                animationDelay: ".05s",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 11,
                }}
              >
                <span
                  className="soh-display"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "var(--cv-ink)",
                  }}
                >
                  Fechas de vencimiento
                </span>
                {vencimientos.length > 0 && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: urgencia.soft,
                      color: urgencia.ink,
                    }}
                  >
                    {urgencia.label}
                  </span>
                )}
              </span>

              {vencimientos.length === 0 ? (
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--cv-ink-4)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  No tienes días por vencer. Los que se otorguen aparecerán aquí
                  con su fecha límite.
                </p>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 9 }}
                >
                  {vencimientos.map((v, i) => (
                    <span
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        border: `1px solid ${v.border}`,
                        background: v.bg,
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          background: v.dotBg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          className="soh-display"
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: v.dotC,
                          }}
                        >
                          {fmt(v.dias)}
                        </span>
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: "var(--cv-ink)",
                          }}
                        >
                          {v.dias === 1 ? "día vence" : "días vencen"} el{" "}
                          {v.fecha}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 10,
                            color: "var(--cv-ink-3)",
                            marginTop: 1,
                          }}
                        >
                          {v.periodo}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: v.relC,
                          flexShrink: 0,
                        }}
                      >
                        {v.rel}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {vencimientos.length > 0 && (
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--cv-ink-4)",
                    margin: "9px 0 0",
                    lineHeight: 1.5,
                  }}
                >
                  Si no los usas antes de esa fecha se pierden.
                </p>
              )}
            </div>

            {/* ───────────────────────────────── próximas liberaciones ── */}
            {liberaciones.length > 0 && (
              <div
                className="cv-card cv-rise"
                style={{
                  borderRadius: 16,
                  padding: "15px 17px",
                  animationDelay: ".1s",
                }}
              >
                <span
                  className="soh-display"
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "var(--cv-ink)",
                    marginBottom: 12,
                  }}
                >
                  Próximas liberaciones
                </span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {libsVista.map((l, i) => (
                    <span key={i} style={{ display: "flex", gap: 12 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          flexShrink: 0,
                          width: 12,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: l.dot,
                            boxShadow: `0 0 0 3px ${l.halo}`,
                            marginTop: 4,
                          }}
                        />
                        {i < libsVista.length - 1 && (
                          <span
                            style={{
                              width: 2,
                              flex: 1,
                              background: "var(--cv-line-soft)",
                              margin: "3px 0",
                            }}
                          />
                        )}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 6,
                          }}
                        >
                          <span
                            className="soh-display"
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: "var(--cv-ink)",
                              lineHeight: 1,
                            }}
                          >
                            +{fmt(l.dias)}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--cv-ink-2)",
                              fontWeight: 600,
                            }}
                          >
                            {l.dias === 1 ? "día" : "días"}
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              color: l.relC,
                              background: l.relBg,
                              borderRadius: 5,
                              padding: "2px 6px",
                              marginLeft: "auto",
                            }}
                          >
                            {l.rel}
                          </span>
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 10.5,
                            color: "var(--cv-ink-3)",
                            marginTop: 3,
                          }}
                        >
                          se liberan el {l.fecha}
                        </span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ───────────────── derecha: calendario + solicitudes ───────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              className="cv-card cv-rise"
              style={{
                borderRadius: 16,
                padding: "15px 17px",
                animationDelay: ".05s",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span
                  className="soh-display"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--cv-ink)",
                    textTransform: "capitalize",
                  }}
                >
                  {nombreMes}
                </span>
                <span style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
                  {(
                    [
                      ["var(--cv-green)", "Aprobada"],
                      ["#F5B843", "Pendiente"],
                      ["#C8D6E2", "No laborable"],
                    ] as const
                  ).map(([c, t]) => (
                    <span
                      key={t}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 10,
                        color: "var(--cv-ink-3)",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 3,
                          background: c,
                        }}
                      />
                      {t}
                    </span>
                  ))}
                </span>
              </span>

              <div
                aria-hidden="true"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 4,
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: "var(--cv-ink-4)",
                  textAlign: "center",
                  marginBottom: 5,
                  letterSpacing: ".06em",
                }}
              >
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 4,
                }}
              >
                {celdas.map((c, i) => {
                  const ui = CELDA_UI[c.tipo];
                  const marcada =
                    c.tipo === "pendiente" || c.tipo === "aprobada";
                  return (
                    <span
                      key={i}
                      title={c.tip || undefined}
                      style={{
                        height: 34,
                        borderRadius: 9,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: ui.w,
                        color: ui.c,
                        background: ui.bg,
                        boxShadow: ui.ring,
                        position: "relative",
                      }}
                    >
                      {c.n}
                      {marcada && (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 14,
                            height: 2.5,
                            borderRadius: 3,
                            background:
                              c.tipo === "pendiente"
                                ? "#F5B843"
                                : "var(--cv-green)",
                            marginTop: 2,
                          }}
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* ─────────────────────────────────────── tus solicitudes ── */}
            <div className="cv-rise" style={{ animationDelay: ".1s" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 9,
                  padding: "0 2px",
                }}
              >
                <span
                  className="soh-display"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--cv-ink)",
                  }}
                >
                  Tus solicitudes
                </span>
                <span style={{ fontSize: 10.5, color: "var(--cv-ink-4)" }}>
                  {lista.length} en total
                </span>
              </span>

              {lista.length > 0 ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {porMes.map(({ mes: rotuloMes, dias, items }) => (
                  <div key={rotuloMes}>
                    {/* Encabezado del mes: además de separar, PLIEGA. Con un
                        año de historia, tenerlo todo abierto obliga a bajar
                        por decenas de tarjetas para llegar a lo de siempre. */}
                    <button
                      type="button"
                      onClick={() => alternarMes(rotuloMes)}
                      aria-expanded={mesAbierto(rotuloMes)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        margin: "6px 2px 8px",
                        width: "100%",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <ChevronRight
                        size={13}
                        aria-hidden="true"
                        style={{
                          color: "var(--cv-ink-4)",
                          flexShrink: 0,
                          transition: "transform .15s ease",
                          transform: mesAbierto(rotuloMes)
                            ? "rotate(90deg)"
                            : "none",
                        }}
                      />
                      <span
                        className="soh-mono"
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: ".1em",
                          textTransform: "uppercase",
                          color: "var(--cv-ink-4)",
                          flexShrink: 0,
                        }}
                      >
                        {rotuloMes}
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          flex: 1,
                          height: 1,
                          background: "var(--cv-line-soft)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--cv-ink-4)",
                          flexShrink: 0,
                        }}
                      >
                        {items.length}{" "}
                        {items.length === 1 ? "solicitud" : "solicitudes"}
                        {dias > 0 && ` · ${fmt(dias)} d`}
                      </span>
                    </button>

                    {mesAbierto(rotuloMes) && (
                    <div
                      style={{ display: "flex", flexDirection: "column", gap: 8 }}
                    >
                  {items.map((a) => {
                    const st = ST_UI[a.status] ?? ST_UI.pendiente;
                    return (
                      <div
                        key={a.id}
                        className="cv-row-h cv-card"
                        onClick={() => setDetalle(a)}
                        style={{
                          borderRadius: 14,
                          padding: "12px 14px",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          borderLeft: `3px solid ${st.edge}`,
                          cursor: "pointer",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background: st.soft,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            color: st.ink,
                          }}
                        >
                          <CalendarDays size={15} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: "var(--cv-ink)",
                              }}
                            >
                              {a.type}
                            </span>
                            <span
                              style={{
                                fontSize: 9.5,
                                color: "var(--cv-ink-4)",
                              }}
                            >
                              {a.halfDay ? `${fmt(a.hours ?? 0)} h` : diasDe(a)}
                            </span>
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontSize: 10.5,
                              color: "var(--cv-ink-3)",
                              marginTop: 2,
                            }}
                          >
                            {rango(a)}
                          </span>
                          {a.sentTo && (
                            <span
                              style={{
                                display: "block",
                                fontSize: 10,
                                color: "var(--cv-ink-4)",
                                marginTop: 2,
                              }}
                            >
                              Enviada a {a.sentTo}
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 5,
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              padding: "3px 9px",
                              borderRadius: 7,
                              background: st.soft,
                              color: st.ink,
                              fontSize: 9.5,
                              fontWeight: 700,
                            }}
                          >
                            {st.label}
                          </span>
                          {a.status === "pendiente" && (
                            <button
                              type="button"
                              onClick={() =>
                                startTransition(async () => {
                                  await cancelarAusencia(a.id);
                                })
                              }
                              className="cv-btn"
                              style={{
                                border: "none",
                                background: "transparent",
                                fontSize: 9.5,
                                fontWeight: 600,
                                color: "var(--cv-ink-4)",
                                padding: 0,
                                fontFamily: "inherit",
                              }}
                            >
                              Cancelar
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                    </div>
                    )}
                  </div>
                  ))}
                </div>
              ) : (
                <div
                  className="cv-card"
                  style={{
                    borderRadius: 18,
                    padding: "40px 26px",
                    textAlign: "center",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      background: "#E4F8EB",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                      color: "#178A49",
                    }}
                  >
                    <CalendarDays size={24} strokeWidth={1.8} />
                  </span>
                  <span
                    className="soh-display"
                    style={{
                      display: "block",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--cv-ink)",
                    }}
                  >
                    Todavía no has solicitado ausencias
                  </span>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--cv-ink-3)",
                      margin: "6px 0 14px",
                      lineHeight: 1.55,
                    }}
                  >
                    Cuando pidas vacaciones o un permiso, aquí verás su estado y
                    a quién le toca aprobarlo.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSolicitando(true)}
                    className="cv-btn"
                    style={{
                      border: "none",
                      background: "var(--cv-green-ink)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "10px 16px",
                      borderRadius: 11,
                    }}
                  >
                    Solicitar ausencia
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {pestana === "aprobar" && (
        <>
          {puedoAprobar && porAprobar.length > 0 && (
            <div
              className="cv-card cv-rise"
              style={{
                borderRadius: 16,
                padding: "14px 17px",
                marginBottom: 14,
                borderLeft: "3px solid var(--cv-amber)",
              }}
            >
              <span
                className="soh-display"
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--cv-ink)",
                  marginBottom: 3,
                }}
              >
                Por aprobar ({porAprobar.length})
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 10.5,
                  color: "var(--cv-ink-3)",
                  marginBottom: 10,
                }}
              >
                Tu decisión resuelve la solicitud
              </span>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {porAprobar.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "10px 12px",
                      border: "1px solid var(--cv-line-soft)",
                      borderRadius: 11,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 180 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: "var(--cv-ink)",
                        }}
                      >
                        {a.userName ?? "—"} · {a.type}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 10.5,
                          color: "var(--cv-ink-3)",
                          marginTop: 1,
                        }}
                      >
                        {rango(a)}
                        {a.halfDay ? ` · ${fmt(a.hours ?? 0)} h` : ""}
                        {a.sentTo ? ` · enviada a ${a.sentTo}` : ""}
                        {a.detail ? ` · ${a.detail}` : ""}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            await decidirAusencia(a.id, "APROBADO");
                          })
                        }
                        className="cv-btn"
                        style={{
                          border: "none",
                          background: "var(--cv-green-ink)",
                          color: "#fff",
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: "7px 13px",
                          borderRadius: 9,
                        }}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            await decidirAusencia(a.id, "RECHAZADO");
                          })
                        }
                        className="cv-btn"
                        style={{
                          border: "1px solid var(--cv-line)",
                          background: "#fff",
                          color: "var(--cv-ink-2)",
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: "7px 12px",
                          borderRadius: 9,
                        }}
                      >
                        Rechazar
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ------------------------------ detalle de la solicitud -- */}
      {detalle && (
        <CvPortal>
          <div
            onClick={() => setDetalle(null)}
            className="cv-fade-in"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 70,
              background: "rgba(7,23,43,.42)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
            }}
          />
          <aside
            className="cv-slide-r"
            aria-label="Detalle de la solicitud"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 71,
              width: 420,
              maxWidth: "94vw",
              background: "var(--cv-faint)",
              display: "flex",
              flexDirection: "column",
              boxShadow: "-18px 0 50px rgba(7,23,43,.24)",
            }}
          >
            {/* --------------------------------------------- cabecera -- */}
            <div
              className="cv-chrome-dots"
              style={{
                position: "relative",
                background:
                  "linear-gradient(150deg, var(--cv-navy), var(--cv-deep))",
                padding: "17px 20px",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="soh-mono"
                    style={{
                      display: "block",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: ".14em",
                      textTransform: "uppercase",
                      color: "var(--cv-dk-3)",
                    }}
                  >
                    {rango(detalle)}
                  </span>
                  <h2
                    className="soh-display"
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#fff",
                      letterSpacing: "-.02em",
                      margin: "3px 0 0",
                    }}
                  >
                    {detalle.type}
                  </h2>
                </span>
                <button
                  type="button"
                  onClick={() => setDetalle(null)}
                  aria-label="Cerrar"
                  className="cv-btn"
                  style={{
                    width: 29,
                    height: 29,
                    borderRadius: 9,
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "rgba(255,255,255,.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--cv-dk-2)",
                    flexShrink: 0,
                  }}
                >
                  <X size={13} strokeWidth={2.4} />
                </button>
              </div>
            </div>

            {/* ----------------------------------------------- cuerpo -- */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "18px 20px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {/* Lo que se pidió, en cifras */}
              <div style={{ display: "flex", gap: 9 }}>
                <div
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    padding: "13px 15px",
                    background: "linear-gradient(150deg, #E4F8EB, #F0FBF4)",
                    border: "1px solid #BCE9CD",
                  }}
                >
                  <span
                    className="soh-display"
                    style={{
                      display: "block",
                      fontSize: 23,
                      fontWeight: 700,
                      color: "#0F5B32",
                      lineHeight: 1.1,
                    }}
                  >
                    {fmt(diasDeAusencia(detalle))}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10.5,
                      color: "#2F7A52",
                    }}
                  >
                    {diasDeAusencia(detalle) === 1 ? "día" : "días"} de ausencia
                  </span>
                </div>
                <div
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    padding: "13px 15px",
                    background: "linear-gradient(150deg, #DDF7F4, #EDFBFA)",
                    border: "1px solid #A8E2DE",
                  }}
                >
                  <span
                    className="soh-display"
                    style={{
                      display: "block",
                      fontSize: 23,
                      fontWeight: 700,
                      color: "#12534F",
                      lineHeight: 1.1,
                    }}
                  >
                    {fmt(detalle.hours ?? 8)} h
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10.5,
                      color: "#2C6E6B",
                    }}
                  >
                    por día
                  </span>
                </div>
              </div>

              {/* Estado, con su tono */}
              {(() => {
                const st = ST_UI[detalle.status] ?? ST_UI.pendiente;
                return (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      border: `1px solid ${st.edge}`,
                      background: st.soft,
                      borderRadius: 12,
                      padding: "11px 13px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: st.ink,
                      }}
                    >
                      {st.label}
                    </span>
                    <span style={{ fontSize: 11, color: st.ink, opacity: 0.8 }}>
                      {detalle.status === "pendiente"
                        ? "Esperando visto bueno"
                        : `Resuelta por ${detalle.sentTo ?? "tu líder"}`}
                    </span>
                  </div>
                );
              })()}

              {/* Los campos, tal como se mandaron */}
              {(
                [
                  ["Tipo de ausencia", detalle.type],
                  ["Fechas", rango(detalle)],
                  [
                    "Horas por día",
                    detalle.halfDay
                      ? `${fmt(detalle.hours ?? 0)} h — jornada parcial`
                      : `${fmt(detalle.hours ?? 8)} h — día completo`,
                  ],
                  ["Enviada a", detalle.sentTo ?? "Sin destinatario"],
                ] as const
              ).map(([k, val]) => (
                <div key={k}>
                  <span
                    className="soh-mono"
                    style={{
                      display: "block",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--cv-ink-4)",
                      marginBottom: 3,
                    }}
                  >
                    {k}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      color: "var(--cv-ink)",
                      lineHeight: 1.5,
                    }}
                  >
                    {val}
                  </span>
                </div>
              ))}

              <div>
                <span
                  className="soh-mono"
                  style={{
                    display: "block",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--cv-ink-4)",
                    marginBottom: 3,
                  }}
                >
                  Motivo
                </span>
                <p
                  className="cv-card"
                  style={{
                    margin: 0,
                    borderRadius: 12,
                    padding: "11px 12px",
                    fontSize: 12,
                    color: detalle.detail
                      ? "var(--cv-ink-2)"
                      : "var(--cv-ink-4)",
                    lineHeight: 1.6,
                  }}
                >
                  {detalle.detail || "Sin motivo capturado."}
                </p>
              </div>

              {/* Solo se puede cancelar lo que aún no se decidió */}
              {detalle.status === "pendiente" && (
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await cancelarAusencia(detalle.id);
                      setDetalle(null);
                    })
                  }
                  className="cv-btn"
                  style={{
                    alignSelf: "flex-start",
                    border: "1px solid #F5C6C9",
                    background: "#fff",
                    color: "#B23A40",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "9px 14px",
                    borderRadius: 11,
                  }}
                >
                  Cancelar solicitud
                </button>
              )}
            </div>
          </aside>
        </CvPortal>
      )}

      {solicitando && (
        <FormSolicitud
          tipos={tipos}
          aprobadores={aprobadores}
          disponibles={disponibles}
          onClose={() => setSolicitando(false)}
        />
      )}
    </div>
  );
}

/**
 * Solicitar una ausencia.
 *
 * Mismos campos que la hoja PERMISOS del Gestor —tipo, fechas, horas por día,
 * razón y a quién se envía—, con los dos totales que allá eran fórmulas y aquí
 * se calculan solos. "Enviar a" es obligatorio, igual que en el script: sin
 * aprobador la solicitud no llega a ninguna parte.
 */
function FormSolicitud({
  tipos,
  aprobadores,
  disponibles,
  onClose,
}: {
  tipos: string[];
  aprobadores: { email: string; userName: string; correo?: string | null }[];
  /** Días de vacaciones que se pueden tomar hoy. */
  disponibles: number;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState(tipos[0] ?? "Vacaciones");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  // 8 horas es el día completo; 4 si solo falta medio día. En el Gestor esto
  // era un desplegable rígido.
  const [horas, setHoras] = useState(8);
  /*
   * Si se está indicando un rato a medida.
   *
   * Va aparte de `horas` porque son dos preguntas distintas: 2 h puede venir
   * del botón "un rato" o de haberlo escrito. Sin esta marca, escribir 2 en el
   * campo encendería el botón y el campo desaparecería a media edición.
   */
  const [otroRato, setOtroRato] = useState(false);
  const [razon, setRazon] = useState("");
  const [enviarA, setEnviarA] = useState("");
  const [pendiente, startTransition] = useTransition();

  /** Solo las vacaciones descuentan días del saldo. */
  const consume = /vacacion/i.test(tipo);

  /*
   * Qué implica cada tipo. Las claves son los valores reales del catálogo
   * —los mismos que se usan en `BDD PERMISOS`—, en minúsculas.
   */
  const NOTAS: Record<string, string> = {
    vacaciones:
      "Descuenta de tus días disponibles. Se usan primero los que vencen antes.",
    "home office": "No es una ausencia: solo avisas que trabajarás desde casa.",
    "ausencia sin paga": "No descuenta vacaciones, pero el día no se paga.",
    "salida temprano":
      "Te vas antes de terminar la jornada. Pon las horas que faltarás.",
    "llegada tarde": "Llegas después de tu hora. Pon las horas que faltarás.",
    ausencia: "Faltas el día completo. Requiere visto bueno de tu líder.",
    "permiso con goce de sueldo":
      "No descuenta vacaciones y conservas tu sueldo. Requiere visto bueno de tu líder.",
    "permiso sin goce de sueldo":
      "No descuenta vacaciones, pero se descuenta el día de tu nómina.",
    incapacidad:
      "No descuenta vacaciones. Necesitas adjuntar el comprobante del IMSS.",
    "tiempo por tiempo":
      "Repones estas horas en otro momento. No descuenta vacaciones.",
    "cambio de horario": "Trabajas las mismas horas, en otro horario.",
    otro: "Explica en el motivo de qué se trata.",
  };
  const nota = NOTAS[tipo.toLowerCase()] ?? null;

  // Días hábiles del rango: los fines de semana no se piden ni se descuentan.
  const dias = useMemo(() => {
    if (!inicio) return 0;
    const s = new Date(inicio + "T00:00:00");
    const e = new Date((fin || inicio) + "T00:00:00");
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s)
      return 0;
    let n = 0;
    const d = new Date(s);
    while (d <= e) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) n++;
      d.setDate(d.getDate() + 1);
    }
    return n;
  }, [inicio, fin]);

  const totalHoras = dias * horas;
  const excede = consume && dias > disponibles;
  const razonOk = razon.trim().length >= 10;
  const listo = dias > 0 && razonOk && !!enviarA && !excede;

  const motivo = !inicio
    ? "Elige la fecha de inicio"
    : dias === 0
      ? "El rango no tiene días hábiles"
      : excede
        ? `Excedes tus ${disponibles} días disponibles`
        : !razonOk
          ? "Escribe el motivo (mínimo 10 caracteres)"
          : !enviarA
            ? "Elige a quién se le envía"
            : null;

  /*
   * Se envía con `onSubmit`, no con `action={...}`.
   *
   * Con `action` el formulario queda atado al identificador de la acción de
   * servidor, que cambia en cada compilación: si la pestaña lleva abierta
   * desde antes de un reinicio, al enviar salta "Server Action was not found"
   * y lo escrito se pierde. Llamando a la acción desde el submit, el envío
   * usa siempre la versión que el navegador tiene cargada.
   */
  const enviar = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await solicitarAusencia(form);
      if (r.ok) onClose();
      else setError(r.error ?? "No se pudo enviar.");
    });
  };

  const rotuloCampo: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--cv-ink-2)",
    marginBottom: 8,
  };

  return (
    <CvPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Solicitar ausencia"
        onClick={onClose}
        className="cv-fade-in"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 70,
          background: "rgba(7,23,43,.42)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      >
        <form
          onSubmit={enviar}
          onClick={(e) => e.stopPropagation()}
          className="cv-slide-r"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 71,
            width: 475,
            maxWidth: "94vw",
            background: "var(--cv-faint)",
            display: "flex",
            flexDirection: "column",
            boxShadow: "-18px 0 50px rgba(7,23,43,.24)",
          }}
        >
          {/* ------------------------------------------------- cabecera -- */}
          <div
            className="cv-chrome-dots"
            style={{
              position: "relative",
              background:
                "linear-gradient(150deg, var(--cv-navy), var(--cv-deep))",
              padding: "17px 20px",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -60,
                right: -40,
                width: 190,
                height: 190,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(50,214,107,.18), transparent 66%)",
                filter: "blur(20px)",
              }}
            />
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="soh-mono"
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: "var(--cv-dk-3)",
                  }}
                >
                  Nueva solicitud
                </span>
                <h2
                  className="soh-display"
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: "#fff",
                    letterSpacing: "-.02em",
                    margin: "3px 0 0",
                  }}
                >
                  Solicitar ausencia
                </h2>
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="cv-btn"
                style={{
                  width: 29,
                  height: 29,
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.14)",
                  background: "rgba(255,255,255,.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--cv-dk-2)",
                  flexShrink: 0,
                }}
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* -------------------------------------------------- cuerpo -- */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "18px 20px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 17,
            }}
          >
            {/* tipo */}
            <div>
              <span style={rotuloCampo}>Tipo de ausencia</span>
              {/*
                Una lista, no once globos.
                Con once tipos en botones, el formulario abría con un bloque de
                etiquetas que ocupaba media ventana y empujaba las fechas fuera
                de la vista: se veía todo a la vez y no se sabía por dónde
                empezar. En una lista solo se ve lo elegido.
              */}
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value);
                  // Las vacaciones son siempre día completo: si venía de un
                  // tipo parcial, las horas vuelven a la jornada.
                  if (/vacacion/i.test(e.target.value)) {
                    setHoras(8);
                    setOtroRato(false);
                  }
                }}
                style={campoSelect}
              >
                {tipos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input type="hidden" name="type" value={tipo} />

              {nota && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    background: consume ? "#FDF3DC" : "#E9F1FB",
                    border: `1px solid ${consume ? "#F0D9A0" : "#CFE0F0"}`,
                    borderRadius: 11,
                    padding: "9px 11px",
                    marginTop: 9,
                  }}
                >
                  <Info
                    size={14}
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      marginTop: 1,
                      color: consume ? "#8A6410" : "#31677F",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: consume ? "#8A6410" : "#31677F",
                    }}
                  >
                    {nota}
                  </span>
                </div>
              )}
            </div>

            {/* fechas */}
            <div
              className="cv-card"
              style={{ borderRadius: 14, padding: "14px 15px" }}
            >
              <span style={rotuloCampo}>Elige las fechas</span>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ flex: 1 }}>
                  <span
                    className="soh-mono"
                    style={{
                      display: "block",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--cv-ink-4)",
                      marginBottom: 3,
                    }}
                  >
                    Inicio
                  </span>
                  <input
                    name="start"
                    type="date"
                    required
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                    style={campo}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  <span
                    className="soh-mono"
                    style={{
                      display: "block",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--cv-ink-4)",
                      marginBottom: 3,
                    }}
                  >
                    Fin
                  </span>
                  <input
                    name="end"
                    type="date"
                    value={fin}
                    min={inicio || undefined}
                    onChange={(e) => setFin(e.target.value)}
                    style={campo}
                  />
                </label>
              </div>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--cv-ink-4)",
                  margin: "8px 0 0",
                  lineHeight: 1.5,
                }}
              >
                Si es un solo día, deja el fin vacío. Los fines de semana no
                cuentan.
              </p>
            </div>

            {/* horas por día · en vacaciones no se elige: siempre es completo */}
            {consume ? (
              <div
                style={{
                  border: "1px solid var(--cv-line-soft)",
                  background: "var(--cv-faint)",
                  borderRadius: 11,
                  padding: "11px 13px",
                }}
              >
                <span style={{ ...rotuloCampo, marginBottom: 3 }}>
                  Horas por día
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--cv-ink-2)",
                    lineHeight: 1.5,
                  }}
                >
                  Las vacaciones se toman por día completo, así que cada día
                  descuenta uno de tu saldo.
                </span>
              </div>
            ) : (
            <div>
              <span style={rotuloCampo}>¿Cuánto tiempo?</span>
              {/*
                Tres opciones y un campo, no cinco cosas compitiendo.
                Antes había cuatro botones más una casilla numérica, todos del
                mismo peso: se veían cinco maneras de decir lo mismo sin saber
                cuál era la normal. Ahora los tres casos de siempre —jornada,
                media, un par de horas— y el resto detrás de "Otro".
              */}
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { v: 8, arriba: "Día", abajo: "completo" },
                  { v: 4, arriba: "Medio", abajo: "día" },
                  { v: 2, arriba: "2 h", abajo: "un rato" },
                ].map((h) => {
                  const on = !otroRato && horas === h.v;
                  return (
                    <button
                      key={h.v}
                      type="button"
                      onClick={() => {
                        setOtroRato(false);
                        setHoras(h.v);
                      }}
                      aria-pressed={on}
                      className="cv-btn"
                      style={{
                        flex: 1,
                        border: `1px solid ${on ? "var(--cv-navy)" : "var(--cv-line)"}`,
                        background: on ? "var(--cv-navy)" : "#fff",
                        color: on ? "#fff" : "var(--cv-ink-2)",
                        borderRadius: 11,
                        padding: "9px 6px",
                        lineHeight: 1.25,
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          fontSize: 12.5,
                          fontWeight: 700,
                        }}
                      >
                        {h.arriba}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 10,
                          opacity: on ? 0.75 : 0.6,
                        }}
                      >
                        {h.abajo}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setOtroRato(true)}
                  aria-pressed={otroRato}
                  className="cv-btn"
                  style={{
                    flex: 1,
                    border: `1px solid ${otroRato ? "var(--cv-navy)" : "var(--cv-line)"}`,
                    background: otroRato ? "var(--cv-navy)" : "#fff",
                    color: otroRato ? "#fff" : "var(--cv-ink-2)",
                    borderRadius: 11,
                    padding: "9px 6px",
                    lineHeight: 1.25,
                  }}
                >
                  <span
                    style={{ display: "block", fontSize: 12.5, fontWeight: 700 }}
                  >
                    Otro
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10,
                      opacity: otroRato ? 0.75 : 0.6,
                    }}
                  >
                    lo indico
                  </span>
                </button>
              </div>

              {otroRato && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    marginTop: 8,
                    padding: "9px 11px",
                    border: "1px solid var(--cv-line-soft)",
                    borderRadius: 11,
                    background: "var(--cv-faint)",
                  }}
                >
                  <span style={{ fontSize: 11.5, color: "var(--cv-ink-3)" }}>
                    Horas por día
                  </span>
                  <input
                    type="number"
                    min={0.5}
                    max={8}
                    step={0.5}
                    autoFocus
                    value={horas}
                    onChange={(e) => setHoras(Number(e.target.value) || 8)}
                    aria-label="Horas por día"
                    style={{
                      width: 58,
                      border: "1px solid var(--cv-line)",
                      borderRadius: 8,
                      outline: "none",
                      background: "#fff",
                      fontFamily: "inherit",
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "var(--cv-ink)",
                      textAlign: "center",
                      padding: "6px 0",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--cv-ink-4)" }}>
                    de 8 h
                  </span>
                </label>
              )}
            </div>
            )}

            {/* Las horas van siempre, elegidas o no: en vacaciones son ocho. */}
            <input type="hidden" name="hours" value={consume ? 8 : horas} />

            {/* los dos totales que en la hoja eran fórmulas */}
            <div style={{ display: "flex", gap: 9 }}>
              {(
                [
                  [
                    String(dias),
                    "total de días ausente",
                    "#E4F8EB",
                    "#F0FBF4",
                    "#BCE9CD",
                    "#178A49",
                    "#0F5B32",
                    "#2F7A52",
                  ],
                  [
                    `${totalHoras % 1 === 0 ? totalHoras : totalHoras.toFixed(1)}`,
                    "horas totales",
                    "#DDF7F4",
                    "#EDFBFA",
                    "#A8E2DE",
                    "#22726F",
                    "#12534F",
                    "#2C6E6B",
                  ],
                ] as const
              ).map(([valor, label, g1, g2, borde, ink, num, sub]) => (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    padding: "13px 15px",
                    background: `linear-gradient(150deg, ${g1}, ${g2})`,
                    border: `1px solid ${borde}`,
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Check
                      size={11}
                      strokeWidth={2.4}
                      style={{ color: ink }}
                      aria-hidden="true"
                    />
                    <span
                      className="soh-mono"
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: ink,
                      }}
                    >
                      Automático
                    </span>
                  </span>
                  <span
                    className="soh-display"
                    style={{
                      display: "block",
                      fontSize: 23,
                      fontWeight: 700,
                      color: num,
                      lineHeight: 1.1,
                      marginTop: 5,
                    }}
                  >
                    {valor}
                  </span>
                  <span
                    style={{ display: "block", fontSize: 10.5, color: sub }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* saldo, solo cuando descuenta */}
            {consume && dias > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  border: `1px solid ${excede ? "#F5C6C9" : "#BCE9CD"}`,
                  background: excede ? "#FCE9EA" : "#F0FBF4",
                  borderRadius: 12,
                  padding: "11px 13px",
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: excede ? "#F8D5D7" : "#DFF5E7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="soh-display"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: excede ? "#B23A40" : "#178A49",
                    }}
                  >
                    {disponibles - dias}
                  </span>
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: excede ? "#8E2A2E" : "#2F7A52",
                  }}
                >
                  {excede
                    ? `Solo tienes ${disponibles} días disponibles y estás pidiendo ${dias}.`
                    : `Te quedarían ${disponibles - dias} días después de esta solicitud.`}
                </span>
              </div>
            )}

            {/* razón */}
            <div>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 7,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--cv-ink-2)",
                  }}
                >
                  Razón de la ausencia
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    color: razonOk ? "#178A49" : "var(--cv-ink-4)",
                  }}
                >
                  {razonOk ? "Listo" : `${razon.trim().length}/10`}
                </span>
              </span>
              <textarea
                name="detail"
                value={razon}
                onChange={(e) => setRazon(e.target.value)}
                placeholder="Cuéntale brevemente a tu líder el motivo…"
                style={{
                  width: "100%",
                  minHeight: 74,
                  resize: "vertical",
                  border: `1px solid ${razonOk ? "#BCE9CD" : "var(--cv-line-soft)"}`,
                  borderRadius: 12,
                  padding: "11px 12px",
                  fontFamily: "inherit",
                  fontSize: 12,
                  color: "var(--cv-ink)",
                  background: "#fff",
                  outline: "none",
                  lineHeight: 1.5,
                }}
              />
            </div>

            {/* enviar a — el campo que el Gestor exigía */}
            <div>
              <span style={rotuloCampo}>Enviar a</span>
              {aprobadores.length === 0 ? (
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--cv-ink-4)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  No hay aprobadores configurados todavía.
                </p>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {aprobadores.map((a) => {
                    // Por ID, no por nombre: es lo que el servidor necesita
                    // para saber a quién se le manda.
                    const on = enviarA === a.email;
                    const iniciales = a.userName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((x) => x[0])
                      .join("");
                    return (
                      <button
                        key={a.email}
                        type="button"
                        onClick={() => setEnviarA(a.email)}
                        aria-pressed={on}
                        className="cv-btn"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          border: `1px solid ${on ? "#86D8A6" : "var(--cv-line-soft)"}`,
                          background: on ? "#F0FBF4" : "#fff",
                          borderRadius: 12,
                          padding: "9px 11px",
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "var(--cv-navy)",
                            color: "#fff",
                            fontSize: 9.5,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {iniciales}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              display: "block",
                              fontSize: 11.5,
                              fontWeight: 700,
                              color: "var(--cv-ink)",
                            }}
                          >
                            {a.userName}
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontSize: 10,
                              color: "var(--cv-ink-4)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {a.correo ?? ""}
                          </span>
                        </span>
                        {on && (
                          <Check
                            size={15}
                            strokeWidth={2.6}
                            style={{ color: "#178A49", flexShrink: 0 }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <input type="hidden" name="sentTo" value={enviarA} />
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  margin: 0,
                  border: "1px solid #F5C6C9",
                  background: "#FCE9EA",
                  borderRadius: 11,
                  padding: "9px 11px",
                  fontSize: 11.5,
                  color: "#8E2A2E",
                }}
              >
                <AlertCircle
                  size={13}
                  strokeWidth={2.2}
                  style={{ flexShrink: 0 }}
                />
                {error}
              </p>
            )}
          </div>

          {/* ----------------------------------------------------- pie -- */}
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--cv-line-soft)",
              background: "#fff",
              padding: "13px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 11,
                fontWeight: 600,
                color: listo ? "#178A49" : "#B23A40",
              }}
            >
              {listo ? (
                <>
                  <Check
                    size={13}
                    strokeWidth={2.6}
                    style={{ flexShrink: 0 }}
                  />
                  Todo listo para enviar
                </>
              ) : (
                motivo && (
                  <>
                    <AlertCircle
                      size={13}
                      strokeWidth={2.2}
                      style={{ flexShrink: 0 }}
                    />
                    {motivo}
                  </>
                )
              )}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="cv-btn"
              style={{
                border: "1px solid var(--cv-line)",
                background: "#fff",
                color: "var(--cv-ink-2)",
                fontSize: 12,
                fontWeight: 700,
                padding: "10px 15px",
                borderRadius: 11,
                flexShrink: 0,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pendiente || !listo}
              className="cv-btn"
              style={{
                border: "none",
                background: listo ? "var(--cv-green-ink)" : "var(--cv-line)",
                color: listo ? "#fff" : "var(--cv-ink-4)",
                fontSize: 12.5,
                fontWeight: 700,
                padding: "10px 17px",
                borderRadius: 11,
                flexShrink: 0,
                boxShadow: listo ? "0 8px 18px rgba(25,153,80,.25)" : "none",
                cursor: listo ? "pointer" : "not-allowed",
                opacity: pendiente ? 0.6 : 1,
              }}
            >
              {pendiente ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </form>
      </div>
    </CvPortal>
  );
}

/** Campo de texto o fecha dentro del cajón. */
const campo: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 9,
  border: "1px solid var(--cv-line-soft)",
  fontSize: 12,
  fontFamily: "inherit",
  color: "var(--cv-ink)",
  background: "#fff",
  outline: "none",
};

/**
 * El desplegable del tipo de ausencia.
 *
 * Un poco más alto que un campo de texto normal y con la fuente algo mayor:
 * es la primera decisión del formulario y de ella dependen las demás —si
 * consume vacaciones, si se piden horas—, así que conviene que se vea.
 */
const campoSelect: React.CSSProperties = {
  ...campo,
  padding: "10px 11px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
