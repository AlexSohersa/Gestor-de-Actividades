"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  borrarActividad,
  decidirExtra,
  reportarHoras,
  solicitarExtra,
  type LineaActividad,
} from "@/lib/gestor/actions";
import type { Opcion } from "@/lib/gestor/queries";
import { CvCombo } from "@/components/conexion/CvCombo";
import { CvPortal } from "@/components/conexion/CvPortal";
import { DashboardHoras } from "./DashboardHoras";
import type { Dashboard, FilaHistorial } from "@/lib/gestor/dashboard";
import type { EstadoHO } from "@/lib/gestor/homeoffice";
import { BotonHomeOffice } from "./BotonHomeOffice";

/**
 * Gestor de actividad — la misma mecánica del Gestor en Sheets, con la piel
 * de la plataforma.
 *
 * Lo que se conserva: reportar varias líneas de una vez sobre un mismo
 * proyecto, el tope de horas del día, las horas extra con su aprobador y la
 * bandeja de quien aprueba.
 *
 * Lo que cambia: la identidad sale de la sesión, aprobar depende del rol y no
 * de una contraseña compartida, y lo guardado sube a Sheets en segundo plano.
 */

export type EntradaVista = {
  id: string;
  date: string;
  project: string;
  deliverable: string;
  discipline: string;
  kind: string;
  effort: string | null;
  hours: number;
  comment: string | null;
  category: string;
  status: string;
  sheetSync: string;
};

export type ExtraVista = {
  id: string;
  date: string;
  userName: string;
  project: string;
  deliverable: string;
  hours: number;
  reason: string;
  status: string;
  approverName: string | null;
  isCourse: boolean;
};

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"] as const;

const COLORES = ["#32D66B", "#39B8B4", "#7669E8", "#F5B843", "#3E7FA6"];
function colorDe(texto: string): string {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

const ST: Record<string, { soft: string; ink: string; label: string }> = {
  PAGADO: { soft: "#E4F8EB", ink: "#178A49", label: "Registrada" },
  APROBADO: { soft: "#E4F8EB", ink: "#178A49", label: "Aprobada" },
  RECHAZADO: { soft: "#FCE9EA", ink: "#B23A40", label: "Rechazada" },
  pendiente: { soft: "#FDF3DC", ink: "#B07C10", label: "Por aprobar" },
};

/** Jornada completa de lunes a viernes: la meta contra la que se compara. */
const META_SEMANA = 40;

/** "8" y no "8.0"; "7.5" cuando hay media hora. */
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

/** Tono de cada tipo de esfuerzo en el historial. */
/*
 * Tono de cada esfuerzo.
 *
 * Los valores reales de la hoja son PROYECTO, CAMBIOS y RETRABAJO —no
 * "Proyecto/Interno/Administrativo", que fue mi suposición inicial y no
 * coincidía con nada—. Se compara en mayúsculas por si alguien capturó
 * distinto.
 */
const ESFUERZO_TONO: Record<string, { soft: string; ink: string }> = {
  PROYECTO: { soft: "#E4F8EB", ink: "#178A49" },
  CAMBIOS: { soft: "#FDF3DC", ink: "#B07C10" },
  RETRABAJO: { soft: "#FCE9EA", ink: "#B23A40" },
  INTERNO: { soft: "#DDF7F4", ink: "#22726F" },
  ADMINISTRATIVO: { soft: "#E9F1FB", ink: "#31677F" },
  COMERCIAL: { soft: "#EDEBFC", ink: "#5D50C9" },
};

/** Encabezado de tabla, repetido en cinco columnas. */
const thStyle = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  color: "var(--cv-ink-4)",
  textTransform: "uppercase",
} as const;

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * "14 ago" — el día tal como se guardó.
 *
 * `timeZone: "UTC"` es imprescindible para las fechas que vienen de la base:
 * son días de calendario guardados a medianoche UTC, y sin fijarla el
 * navegador las lee seis horas antes y muestra el día anterior.
 */
function diaCorto(v: string | Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  })
    .format(new Date(v))
    .replace(".", "");
}

/** Una línea vacía del formulario. */
const LINEA_VACIA: LineaActividad = {
  deliverable: "",
  discipline: "",
  kind: "",
  effort: "",
  hours: 0,
  comment: "",
  extra: false,
};

export function ActividadScreen({
  lunesISO,
  entradas,
  extras,
  porAprobar,
  catalogos,
  aprobadores,
  puedoAprobar,
  topeDia,
  estadoHO,
  tablero,
}: {
  lunesISO: string;
  entradas: EntradaVista[];
  extras: ExtraVista[];
  porAprobar: ExtraVista[];
  catalogos: {
    proyectos: Opcion[];
    entregables: Opcion[];
    tipos: Opcion[];
    esfuerzos: Opcion[];
  };
  aprobadores: { email: string; userName: string; correo?: string | null }[];
  puedoAprobar: boolean;
  /** Horas normales al día de ESTA persona, según su jornada. */
  topeDia: number;
  /** Checada del día. Siempre presente: no depende de ningún permiso. */
  estadoHO: EstadoHO;
  /** Cifras del tablero, calculadas en el servidor. */
  tablero: Dashboard;
}) {
  const router = useRouter();
  const params = useSearchParams();
  // La vista vive en la URL: el enlace se puede compartir tal cual.
  const vistaParam = params.get("vista");
  const vista: "semana" | "historial" | "consulta" =
    vistaParam === "historial" || vistaParam === "consulta"
      ? vistaParam
      : "semana";
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");

  const irAVista = (v: "semana" | "historial" | "consulta") => {
    const q = new URLSearchParams(params.toString());
    if (v === "semana") q.delete("vista");
    else q.set("vista", v);
    router.push(`/actividad?${q}`);
  };
  // Guarda CON QUÉ FECHA abrir el reporte, no solo si está abierto: si se
  // entra desde un día concreto, el formulario tiene que caer en ese día.
  // `null` = cerrado.
  const [reportando, setReportando] = useState<string | null>(null);
  const [pidiendoExtra, setPidiendoExtra] = useState(false);
  const [aviso] = useState<string | null>(null);
  /** El registro que se está confirmando borrar, y qué pasó al borrarlo. */
  const [borrando, setBorrando] = useState<EntradaVista | null>(null);
  const [avisoBorrar, setAvisoBorrar] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const lunes = useMemo(() => new Date(lunesISO + "T00:00:00"), [lunesISO]);
  const hoyISO = iso(new Date());

  const rango = useMemo(() => {
    const v = new Date(lunes);
    v.setDate(v.getDate() + 4);
    const f = (d: Date) =>
      new Intl.DateTimeFormat("es-MX", {
        day: "numeric",
        month: "short",
      }).format(d);
    return `${f(lunes)} – ${f(v)}`;
  }, [lunes]);

  const irA = (delta: number) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + delta * 7);
    const q = new URLSearchParams(params.toString());
    q.set("semana", iso(d));
    router.push(`/actividad?${q}`);
  };

  const porDia = useMemo(() => {
    const m = new Map<string, EntradaVista[]>();
    for (const e of entradas) {
      const k = e.date.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [entradas]);

  // Horas NORMALES ya reportadas por día: es contra lo que se mide el tope.
  // Las extra no cuentan porque existen justamente para salirse de él.
  const horasPorDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entradas) {
      if (e.category === "EXTRA") continue;
      const k = e.date.slice(0, 10);
      m.set(k, (m.get(k) ?? 0) + e.hours);
    }
    return m;
  }, [entradas]);

  const total = entradas.reduce((n, e) => n + e.hours, 0);
  const deExtra = entradas
    .filter((e) => e.category === "EXTRA")
    .reduce((n, e) => n + e.hours, 0);
  const misPendientes = extras.filter((e) => e.status === "pendiente").length;

  // No tiene sentido navegar a semanas que todavía no ocurren.
  const haySiguiente = useMemo(() => {
    const sig = new Date(lunes);
    sig.setDate(sig.getDate() + 7);
    return sig <= new Date();
  }, [lunes]);

  // El estado de hoy: sin reportar, jornada corta o completa.
  const hoyTono = useMemo(() => {
    const h = tablero.horasHoy;
    if (h === 0)
      return {
        edge: "#F5B843",
        soft: "#FDF3DC",
        ink: "#B07C10",
        label: "Falta",
      };
    if (h > 8)
      return {
        edge: "#F5B843",
        soft: "#FDF3DC",
        ink: "#B07C10",
        label: "Con extra",
      };
    if (h < 8)
      return {
        edge: "#39B8B4",
        soft: "#DDF7F4",
        ink: "#22726F",
        label: "Parcial",
      };
    return {
      edge: "#32D66B",
      soft: "#E4F8EB",
      ink: "#178A49",
      label: "Completa",
    };
  }, [tablero.horasHoy]);

  const hoyTexto = useMemo(
    () =>
      new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    [],
  );

  // Los filtros del historial salen de los esfuerzos que existen de verdad,
  // no de una lista fija que puede no coincidir con los catálogos.
  const filtrosEsfuerzo = useMemo(() => {
    const vistos = new Set<string>();
    for (const h of tablero.historial) if (h.esfuerzo) vistos.add(h.esfuerzo);
    return ["todos", ...[...vistos].sort()];
  }, [tablero.historial]);

  /*
   * El historial se recorre por semanas, como el reporte.
   *
   * Ver un año de golpe no sirve para nada práctico: lo que se busca es "qué
   * hice esa semana". `semanaHist` es el desplazamiento en semanas respecto a
   * la actual, así que 0 es esta y −1 la pasada.
   */
  const [semanaHist, setSemanaHist] = useState(0);
  const [todoElHistorial, setTodoElHistorial] = useState(false);
  // El registro abierto en el panel lateral del historial.
  const [detalle, setDetalle] = useState<FilaHistorial | null>(null);

  const rangoHist = useMemo(() => {
    const l = new Date();
    l.setDate(l.getDate() - ((l.getDay() + 6) % 7) + semanaHist * 7);
    l.setHours(0, 0, 0, 0);
    const v = new Date(l);
    v.setDate(v.getDate() + 6);
    return { ini: iso(l), fin: iso(v), lunes: l, domingo: v };
  }, [semanaHist]);

  const etiquetaSemana = useMemo(() => {
    const f = (d: Date) =>
      new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })
        .format(d)
        .replace(".", "");
    if (semanaHist === 0)
      return `Esta semana · ${f(rangoHist.lunes)} – ${f(rangoHist.domingo)}`;
    if (semanaHist === -1)
      return `Semana pasada · ${f(rangoHist.lunes)} – ${f(rangoHist.domingo)}`;
    return `${f(rangoHist.lunes)} – ${f(rangoHist.domingo)}`;
  }, [semanaHist, rangoHist]);

  const historialFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tablero.historial.filter((h) => {
      // Al buscar, se busca en todo: acotar a la semana escondería justo lo
      // que se está tratando de encontrar.
      if (
        !todoElHistorial &&
        !q &&
        (h.iso < rangoHist.ini || h.iso > rangoHist.fin)
      ) {
        return false;
      }
      if (filtro !== "todos" && h.esfuerzo !== filtro) return false;
      if (!q) return true;
      return `${h.entregable} ${h.proyecto} ${h.comentario} ${h.tipo}`
        .toLowerCase()
        .includes(q);
    });
  }, [tablero.historial, busqueda, filtro, rangoHist, todoElHistorial]);

  const totalHistorial = historialFiltrado.reduce((n, h) => n + h.horas, 0);

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
            Gestor de actividad
          </h1>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--cv-ink-3)",
              margin: "4px 0 0",
            }}
          >
            Registra y consulta el tiempo dedicado a tus proyectos
          </p>
        </div>

        <BotonHomeOffice estado={estadoHO} />

        <button
          type="button"
          onClick={() => setPidiendoExtra(true)}
          className="cv-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid var(--cv-line)",
            background: "#fff",
            color: "var(--cv-ink-2)",
            fontSize: 12,
            fontWeight: 700,
            padding: "9px 14px",
            borderRadius: 11,
          }}
        >
          Horas extra
          {misPendientes > 0 && (
            <span
              style={{
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: 8,
                background: "#FDF3DC",
                color: "#B07C10",
                fontSize: 9.5,
                fontWeight: 700,
                lineHeight: "16px",
              }}
            >
              {misPendientes}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setReportando(hoyISO)}
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
          Reportar horas
        </button>
      </div>

      {/* ------------------------------- horas pendientes de la quincena -- */}
      {tablero.avisoQuincena && (
        <div
          className="cv-rise"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "1px solid #F0D9A0",
            background: "#FFFDF7",
            borderRadius: 14,
            padding: "12px 15px",
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: "#FDF3DC",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#B07C10",
              flexShrink: 0,
            }}
          >
            <AlertCircle size={15} strokeWidth={2.2} />
          </span>
          <span style={{ flex: 1, minWidth: 200 }}>
            <span
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 700,
                color: "#8A6410",
              }}
            >
              Te faltan {fmt(tablero.avisoQuincena.faltan)} h de la quincena
              pasada
            </span>
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: "#B07C10",
                marginTop: 2,
                lineHeight: 1.5,
              }}
            >
              {tablero.avisoQuincena.rango} · repórtalas al menos dos días antes
              del pago para recibir tu sueldo completo
              {tablero.avisoQuincena.diasParaPago > 0
                ? ` (faltan ${tablero.avisoQuincena.diasParaPago} días)`
                : ""}
            </span>
          </span>
        </div>
      )}

      {/* ------------------------------------------ resumen de quincenas -- */}
      <div
        className="cv-rise"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div
          className="cv-card"
          style={{
            borderRadius: 15,
            padding: "14px 16px",
            borderLeft: `3px solid ${hoyTono.edge}`,
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--cv-ink-3)" }}>
              Horas reportadas hoy
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 6,
                background: hoyTono.soft,
                color: hoyTono.ink,
              }}
            >
              {hoyTono.label}
            </span>
          </span>
          <span
            className="soh-display"
            style={{
              display: "block",
              fontSize: 26,
              fontWeight: 700,
              color: "var(--cv-ink)",
              lineHeight: 1.1,
              marginTop: 6,
            }}
          >
            {fmt(tablero.horasHoy)} h
          </span>
          <span
            style={{
              display: "block",
              fontSize: 10.5,
              color: "var(--cv-ink-4)",
            }}
          >
            {hoyTexto}
          </span>
        </div>

        <div
          className="cv-card"
          style={{ borderRadius: 15, padding: "14px 16px" }}
        >
          <span style={{ fontSize: 11, color: "var(--cv-ink-3)" }}>
            Esta quincena
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 7,
              marginTop: 6,
            }}
          >
            <span
              className="soh-display"
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--cv-ink)",
                lineHeight: 1.1,
              }}
            >
              {fmt(tablero.quincena.horas)} h
            </span>
            <span style={{ fontSize: 11, color: "var(--cv-ink-4)" }}>
              de {tablero.quincena.meta} h
            </span>
          </span>
          <span
            style={{
              display: "block",
              height: 6,
              borderRadius: 6,
              background: "var(--cv-line-soft)",
              overflow: "hidden",
              marginTop: 8,
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${Math.min(100, Math.round(tablero.quincena.avance * 100))}%`,
                background:
                  "linear-gradient(90deg, var(--cv-green), var(--cv-teal))",
                borderRadius: 6,
              }}
            />
          </span>
          <span
            style={{
              display: "block",
              fontSize: 10,
              color: "var(--cv-ink-4)",
              marginTop: 5,
            }}
          >
            {tablero.quincena.rango}
          </span>
        </div>

        <div
          className="cv-card"
          style={{ borderRadius: 15, padding: "14px 16px" }}
        >
          <span style={{ fontSize: 11, color: "var(--cv-ink-3)" }}>
            Quincena pasada
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 7,
              marginTop: 6,
            }}
          >
            <span
              className="soh-display"
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--cv-ink)",
                lineHeight: 1.1,
              }}
            >
              {fmt(tablero.quincenaPrevia.horas)} h
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#178A49" }}>
              cerrada
            </span>
          </span>
          <span
            style={{
              display: "block",
              height: 6,
              borderRadius: 6,
              background: "var(--cv-line-soft)",
              overflow: "hidden",
              marginTop: 8,
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${Math.min(100, Math.round(tablero.quincenaPrevia.avance * 100))}%`,
                background: "#C8D6E2",
                borderRadius: 6,
              }}
            />
          </span>
          <span
            style={{
              display: "block",
              fontSize: 10,
              color: "var(--cv-ink-4)",
              marginTop: 5,
            }}
          >
            {tablero.quincenaPrevia.rango}
          </span>
        </div>

        <div
          className="cv-card"
          style={{ borderRadius: 15, padding: "14px 16px" }}
        >
          <span style={{ fontSize: 11, color: "var(--cv-ink-3)" }}>
            Horas extra
          </span>
          <span
            className="soh-display"
            style={{
              display: "block",
              fontSize: 26,
              fontWeight: 700,
              color: "#B07C10",
              lineHeight: 1.1,
              marginTop: 6,
            }}
          >
            {fmt(tablero.extraQuincena)} h
          </span>
          <span
            style={{
              display: "block",
              fontSize: 10.5,
              color: "var(--cv-ink-4)",
            }}
          >
            esta quincena
            {misPendientes > 0 ? ` · ${misPendientes} por autorizar` : ""}
          </span>
        </div>
      </div>

      {/* ------------------------------------------ conmutador de vistas -- */}
      <div
        className="cv-rise"
        style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}
      >
        {(
          [
            ["semana", "Vista semanal"],
            ["historial", "Historial"],
            ["consulta", "Consultar mi actividad"],
          ] as const
        ).map(([v, txt]) => {
          const on = vista === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => irAVista(v)}
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
            </button>
          );
        })}
      </div>

      {aviso && (
        <p
          style={{
            margin: "0 0 12px",
            padding: "9px 13px",
            borderRadius: 10,
            background: "#E4F8EB",
            color: "#178A49",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {aviso}
        </p>
      )}

      {avisoBorrar && (
        <p
          role="alert"
          onClick={() => setAvisoBorrar(null)}
          style={{
            margin: "0 0 12px",
            padding: "9px 13px",
            borderRadius: 10,
            background: "#FDF3DC",
            border: "1px solid #F0D9A0",
            color: "#8A6410",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {avisoBorrar}
        </p>
      )}

      {/* ------------------------------------------ bandeja de aprobación -- */}
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
              marginBottom: 10,
            }}
          >
            Horas extra por aprobar ({porAprobar.length})
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {porAprobar.map((e) => (
              <div
                key={e.id}
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
                    {e.userName} · {fmt(e.hours)} h
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10.5,
                      color: "var(--cv-ink-3)",
                      marginTop: 1,
                    }}
                  >
                    {diaCorto(e.date)} · {e.project} · {e.reason}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await decidirExtra(e.id, "APROBADO");
                      })
                    }
                    className="cv-btn"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      border: "none",
                      background: "var(--cv-green-ink)",
                      color: "#fff",
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: "7px 13px",
                      borderRadius: 9,
                    }}
                  >
                    <Check size={12} />
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await decidirExtra(e.id, "RECHAZADO");
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

      {/* ═══════════════════════════════════════════ VISTA SEMANAL ═══════ */}
      {vista === "semana" && (
        <div>
          <div
            className="cv-card cv-rise"
            style={{
              borderRadius: 15,
              padding: "11px 15px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => irA(-1)}
                title="Semana anterior"
                className="cv-btn"
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 8,
                  border: "1px solid var(--cv-line)",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--cv-ink-2)",
                }}
              >
                <ChevronLeft size={12} strokeWidth={2.4} />
              </button>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--cv-ink)",
                }}
              >
                {rango}
              </span>
              <button
                type="button"
                onClick={() => irA(1)}
                disabled={!haySiguiente}
                title={
                  haySiguiente
                    ? "Semana siguiente"
                    : "Todavía no puedes registrar horas de semanas futuras."
                }
                className="cv-btn"
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 8,
                  border: "1px solid var(--cv-line)",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: haySiguiente ? "var(--cv-ink-2)" : "#C8D6E2",
                  cursor: haySiguiente ? "pointer" : "not-allowed",
                }}
              >
                <ChevronRight size={12} strokeWidth={2.4} />
              </button>
            </span>

            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginLeft: "auto",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--cv-ink-3)" }}>
                {fmt(total)} de {META_SEMANA} h registradas
              </span>
              <span
                style={{
                  display: "block",
                  width: 130,
                  height: 7,
                  borderRadius: 6,
                  background: "var(--cv-line-soft)",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.min(100, Math.round((total / META_SEMANA) * 100))}%`,
                    background:
                      "linear-gradient(90deg, var(--cv-green), var(--cv-teal))",
                    borderRadius: 6,
                  }}
                />
              </span>
              {deExtra > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#B07C10",
                    background: "#FDF3DC",
                    borderRadius: 6,
                    padding: "3px 8px",
                  }}
                >
                  {fmt(deExtra)} h extra
                </span>
              )}
            </span>
          </div>

          <div
            className="cv-card cv-rise"
            style={{
              borderRadius: 16,
              overflow: "hidden",
              animationDelay: ".05s",
            }}
          >
            {DIAS.map((nombreDia, i) => {
              const d = new Date(lunes);
              d.setDate(d.getDate() + i);
              const clave = iso(d);
              const delDia = porDia.get(clave) ?? [];
              const horasDia = delDia.reduce((n, e) => n + e.hours, 0);
              const esHoy = clave === hoyISO;
              const futuro = clave > hoyISO;

              const fechaCorta = new Intl.DateTimeFormat("es-MX", {
                day: "numeric",
                month: "short",
              })
                .format(d)
                .replace(".", "");

              return (
                <div
                  key={clave}
                  style={{
                    display: "flex",
                    gap: 13,
                    padding: "12px 16px",
                    borderTop: i > 0 ? "1px solid var(--cv-row-line)" : "none",
                    alignItems: "flex-start",
                    background: esHoy ? "#F7FCF9" : "#fff",
                  }}
                >
                  <span style={{ width: 80, flexShrink: 0, paddingTop: 2 }}>
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: esHoy
                            ? "var(--cv-green)"
                            : futuro
                              ? "var(--cv-line)"
                              : horasDia > 0
                                ? "#C8D6E2"
                                : "#F5B843",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: esHoy
                            ? "#178A49"
                            : futuro
                              ? "var(--cv-ink-4)"
                              : "var(--cv-ink)",
                        }}
                      >
                        {nombreDia}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 10,
                        color: "var(--cv-ink-4)",
                        paddingLeft: 12,
                      }}
                    >
                      {fechaCorta}
                    </span>
                  </span>

                  <span
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    {delDia.map((e) => {
                      const extra = e.category === "EXTRA";
                      const est = ST[e.status] ?? ST.PAGADO;
                      return (
                        <span
                          key={e.id}
                          className="cv-row-h"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            border: `1px solid ${extra ? "#F0D9A0" : "var(--cv-line-soft)"}`,
                            borderRadius: 11,
                            padding: "9px 11px",
                            background: extra ? "#FFFDF7" : "#fff",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 3,
                              alignSelf: "stretch",
                              borderRadius: 3,
                              background: extra
                                ? "#F5B843"
                                : colorDe(e.project),
                              flexShrink: 0,
                            }}
                          />
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
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  color: "var(--cv-ink)",
                                }}
                              >
                                {e.deliverable || e.project}
                              </span>
                              <span
                                className="soh-mono"
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: "#31677F",
                                  background: "#E9F1FB",
                                  borderRadius: 5,
                                  padding: "2px 6px",
                                }}
                              >
                                {e.project}
                              </span>
                              {extra && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: "#B07C10",
                                    background: "#FDF3DC",
                                    borderRadius: 5,
                                    padding: "2px 6px",
                                  }}
                                >
                                  Horas extra
                                </span>
                              )}
                              {e.status !== "PAGADO" && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: est.ink,
                                    background: est.soft,
                                    borderRadius: 5,
                                    padding: "2px 6px",
                                  }}
                                >
                                  {est.label}
                                </span>
                              )}
                            </span>
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                marginTop: 3,
                                flexWrap: "wrap",
                              }}
                            >
                              {e.kind && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: "var(--cv-ink-2)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {e.kind}
                                </span>
                              )}
                              {e.effort && (
                                <>
                                  <span
                                    style={{ fontSize: 10, color: "#C8D6E2" }}
                                  >
                                    ·
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: "var(--cv-ink-3)",
                                    }}
                                  >
                                    {e.effort}
                                  </span>
                                </>
                              )}
                              {e.comment && (
                                <>
                                  <span
                                    style={{ fontSize: 10, color: "#C8D6E2" }}
                                  >
                                    ·
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: "var(--cv-ink-4)",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {e.comment}
                                  </span>
                                </>
                              )}
                            </span>
                          </span>
                          <span
                            className="soh-display"
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "var(--cv-ink)",
                              flexShrink: 0,
                            }}
                          >
                            {fmt(e.hours)} h
                          </span>
                          {e.sheetSync === "importado" ? (
                            <span
                              title="Viene del Gestor anterior"
                              className="soh-mono"
                              style={{
                                fontSize: 8.5,
                                fontWeight: 700,
                                color: "var(--cv-ink-4)",
                                background: "var(--cv-faint)",
                                borderRadius: 5,
                                padding: "3px 6px",
                                flexShrink: 0,
                              }}
                            >
                              HOJA
                            </span>
                          ) : (
                            <button
                              type="button"
                              title="Eliminar este registro"
                              // Un clic abre la confirmación; ahí se explica
                              // qué se va a borrar y de dónde.
                              onClick={() => setBorrando(e)}
                              className="cv-btn"
                              style={{
                                width: 25,
                                height: 25,
                                borderRadius: 7,
                                border: "1px solid var(--cv-line-soft)",
                                background: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "var(--cv-ink-4)",
                                flexShrink: 0,
                              }}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </span>
                      );
                    })}

                    {esHoy && delDia.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setReportando(clave)}
                        className="cv-btn"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          border: "1px dashed #86D8A6",
                          background: "#F0FBF4",
                          borderRadius: 11,
                          padding: 11,
                          color: "#178A49",
                          fontSize: 11.5,
                          fontWeight: 700,
                          textAlign: "left",
                        }}
                      >
                        <Plus size={14} strokeWidth={2.6} />
                        Aún no reportas hoy — registra tus horas
                      </button>
                    )}
                    {futuro && (
                      <span
                        style={{
                          fontSize: 10.5,
                          color: "var(--cv-ink-4)",
                          border: "1px dashed var(--cv-line-soft)",
                          borderRadius: 11,
                          padding: "10px 11px",
                        }}
                      >
                        Todavía no puedes reportar este día
                      </span>
                    )}
                    {!esHoy && !futuro && delDia.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setReportando(clave)}
                        className="cv-btn"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          border: "1px dashed var(--cv-line)",
                          background: "#fff",
                          borderRadius: 11,
                          padding: "10px 11px",
                          color: "var(--cv-ink-4)",
                          fontSize: 11,
                          fontWeight: 600,
                          textAlign: "left",
                        }}
                      >
                        + Sin registros — agregar actividad
                      </button>
                    )}
                  </span>

                  <span
                    style={{
                      width: 46,
                      flexShrink: 0,
                      textAlign: "right",
                      paddingTop: 5,
                    }}
                  >
                    <span
                      className="soh-display"
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 700,
                        lineHeight: 1,
                        color: futuro
                          ? "#C8D6E2"
                          : esHoy && horasDia === 0
                            ? "#B07C10"
                            : "var(--cv-ink)",
                      }}
                    >
                      {futuro ? "—" : `${fmt(horasDia)} h`}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 9,
                        color: "var(--cv-ink-4)",
                      }}
                    >
                      {futuro
                        ? ""
                        : horasDia === 0
                          ? "falta"
                          : horasDia > 8
                            ? "con extra"
                            : "de 8 h"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════ HISTORIAL ═════════ */}
      {vista === "historial" && (
        <div className="cv-rise">
          {/* ----------------------------------- semana del historial -- */}
          <div
            className="cv-card"
            style={{
              borderRadius: 15,
              padding: "11px 15px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setTodoElHistorial(false);
                  setSemanaHist((n) => n - 1);
                }}
                title="Semana anterior"
                className="cv-btn"
                style={navHist}
              >
                <ChevronLeft size={12} strokeWidth={2.4} />
              </button>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--cv-ink)",
                }}
              >
                {todoElHistorial ? "Todo el historial" : etiquetaSemana}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTodoElHistorial(false);
                  setSemanaHist((n) => Math.min(0, n + 1));
                }}
                disabled={semanaHist >= 0 || todoElHistorial}
                title="Semana siguiente"
                className="cv-btn"
                style={{
                  ...navHist,
                  color: semanaHist >= 0 ? "#C8D6E2" : "var(--cv-ink-2)",
                  cursor: semanaHist >= 0 ? "not-allowed" : "pointer",
                }}
              >
                <ChevronRight size={12} strokeWidth={2.4} />
              </button>
            </span>

            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginLeft: "auto",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--cv-ink-3)" }}>
                {fmt(totalHistorial)} h en {historialFiltrado.length}{" "}
                {historialFiltrado.length === 1 ? "registro" : "registros"}
              </span>
              <button
                type="button"
                onClick={() => setTodoElHistorial((v) => !v)}
                aria-pressed={todoElHistorial}
                className="cv-btn"
                style={{
                  border: `1px solid ${todoElHistorial ? "var(--cv-navy)" : "var(--cv-line)"}`,
                  background: todoElHistorial ? "var(--cv-navy)" : "#fff",
                  color: todoElHistorial ? "#fff" : "var(--cv-ink-3)",
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "6px 11px",
                  borderRadius: 9,
                }}
              >
                Ver todo
              </button>
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 9,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <label
              className="cv-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 11,
                padding: "0 12px",
                height: 36,
                flex: 1,
                minWidth: 190,
                cursor: "text",
              }}
            >
              <Search
                size={13}
                style={{ color: "var(--cv-ink-4)", flexShrink: 0 }}
              />
              <input
                value={busqueda}
                onChange={(ev) => setBusqueda(ev.target.value)}
                placeholder="Buscar por entregable, proyecto o comentario…"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: "inherit",
                  fontSize: 11.5,
                  color: "var(--cv-ink)",
                }}
              />
            </label>
            {filtrosEsfuerzo.map((f) => {
              const on = filtro === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltro(f)}
                  className="cv-btn"
                  style={{
                    border: `1px solid ${on ? "var(--cv-navy)" : "var(--cv-line)"}`,
                    background: on ? "var(--cv-navy)" : "#fff",
                    color: on ? "#fff" : "var(--cv-ink-2)",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "7px 12px",
                    borderRadius: 10,
                  }}
                >
                  {f === "todos" ? "Todos" : f}
                </button>
              );
            })}
          </div>

          {historialFiltrado.length > 0 ? (
            <div
              className="cv-card"
              style={{ borderRadius: 16, overflow: "hidden" }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "9px 16px",
                  background: "var(--cv-faint)",
                  borderBottom: "1px solid var(--cv-line-soft)",
                }}
              >
                <span style={{ width: 76, ...thStyle }}>Fecha</span>
                <span style={{ flex: 1, ...thStyle }}>Entregable</span>
                <span style={{ width: 118, ...thStyle }}>Tipo</span>
                <span style={{ width: 84, ...thStyle }}>Esfuerzo</span>
                <span style={{ width: 42, textAlign: "right", ...thStyle }}>
                  Horas
                </span>
              </div>
              {historialFiltrado.slice(0, 120).map((h, i) => {
                const e = ESFUERZO_TONO[h.esfuerzo.toUpperCase()] ?? {
                  soft: "var(--cv-faint)",
                  ink: "var(--cv-ink-3)",
                };
                const abierta = detalle?.id === h.id;
                return (
                  <div
                    key={h.id}
                    className="cv-row-h"
                    onClick={() => setDetalle(abierta ? null : h)}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "10px 16px",
                      borderTop:
                        i > 0 ? "1px solid var(--cv-row-line)" : "none",
                      alignItems: "center",
                      cursor: "pointer",
                      background: abierta ? "var(--cv-hover)" : undefined,
                    }}
                  >
                    <span
                      style={{
                        width: 76,
                        flexShrink: 0,
                        fontSize: 11,
                        color: "var(--cv-ink-2)",
                        fontWeight: 600,
                      }}
                    >
                      {h.fecha}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: "var(--cv-ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h.entregable}
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
                        {h.comentario || h.proyecto}
                      </span>
                    </span>
                    <span
                      style={{
                        width: 118,
                        flexShrink: 0,
                        fontSize: 10.5,
                        color: "var(--cv-ink-2)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.tipo || "—"}
                    </span>
                    <span style={{ width: 84, flexShrink: 0 }}>
                      {h.esfuerzo ? (
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 6,
                            background: e.soft,
                            color: e.ink,
                          }}
                        >
                          {h.esfuerzo}
                        </span>
                      ) : (
                        <span
                          style={{ fontSize: 10, color: "var(--cv-ink-4)" }}
                        >
                          —
                        </span>
                      )}
                    </span>
                    <span
                      className="soh-display"
                      style={{
                        width: 42,
                        flexShrink: 0,
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--cv-ink)",
                      }}
                    >
                      {fmt(h.horas)}
                    </span>
                  </div>
                );
              })}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "11px 16px",
                  borderTop: "1px solid var(--cv-line-soft)",
                  background: "var(--cv-faint)",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--cv-ink-3)" }}>
                  {historialFiltrado.length} registros
                  {historialFiltrado.length > 120
                    ? " · se muestran los 120 más recientes"
                    : ""}
                </span>
                <span
                  className="soh-display"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "var(--cv-ink)",
                  }}
                >
                  Total {fmt(totalHistorial)} h
                </span>
              </div>
            </div>
          ) : (
            <div
              className="cv-card"
              style={{
                borderRadius: 18,
                padding: "38px 26px",
                textAlign: "center",
              }}
            >
              <span
                className="soh-display"
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--cv-ink)",
                }}
              >
                Sin registros con ese filtro
              </span>
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--cv-ink-3)",
                  margin: "5px 0 0",
                }}
              >
                Prueba con otro tipo de actividad o limpia la búsqueda.
              </p>
            </div>
          )}

          {/* -------------------------------- detalle del registro -- */}
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
                aria-label="Detalle del registro"
                style={{
                  position: "fixed",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 71,
                  width: 400,
                  maxWidth: "94vw",
                  background: "var(--cv-faint)",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "-18px 0 50px rgba(7,23,43,.24)",
                }}
              >
                <Cabecera
                  rotulo={detalle.fecha}
                  titulo={detalle.entregable}
                  onClose={() => setDetalle(null)}
                />

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
                  <div
                    style={{
                      borderRadius: 14,
                      padding: "15px 17px",
                      background: "linear-gradient(150deg, #E4F8EB, #F0FBF4)",
                      border: "1px solid #BCE9CD",
                    }}
                  >
                    <span
                      className="soh-mono"
                      style={{
                        display: "block",
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: "#178A49",
                      }}
                    >
                      Horas reportadas
                    </span>
                    <span
                      className="soh-display"
                      style={{
                        display: "block",
                        fontSize: 30,
                        fontWeight: 700,
                        color: "#0F5B32",
                        lineHeight: 1.1,
                        marginTop: 4,
                      }}
                    >
                      {fmt(detalle.horas)} h
                    </span>
                  </div>

                  {(
                    [
                      ["Proyecto", detalle.proyecto],
                      ["Entregable", detalle.entregable],
                      ["Tipo de actividad", detalle.tipo],
                      ["Esfuerzo", detalle.esfuerzo],
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
                          color: val ? "var(--cv-ink)" : "var(--cv-ink-4)",
                          lineHeight: 1.5,
                        }}
                      >
                        {val || "Sin capturar"}
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
                      Comentario
                    </span>
                    <p
                      className="cv-card"
                      style={{
                        margin: 0,
                        borderRadius: 12,
                        padding: "11px 12px",
                        fontSize: 12,
                        color: detalle.comentario
                          ? "var(--cv-ink-2)"
                          : "var(--cv-ink-4)",
                        lineHeight: 1.6,
                      }}
                    >
                      {detalle.comentario || "Sin comentario."}
                    </p>
                  </div>
                </div>
              </aside>
            </CvPortal>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════ CONSULTA ════════ */}
      {vista === "consulta" && <DashboardHoras d={tablero} />}

      {reportando !== null && (
        <FormReporte
          fechaInicial={reportando}
          hoyISO={hoyISO}
          horasPorDia={horasPorDia}
          topeDia={topeDia}
          catalogos={catalogos}
          aprobadores={aprobadores}
          onClose={() => setReportando(null)}
        />
      )}
      {pidiendoExtra && (
        <FormExtra
          catalogos={catalogos}
          aprobadores={aprobadores}
          mios={extras}
          onClose={() => setPidiendoExtra(false)}
        />
      )}

      {borrando && (
        <ConfirmarBorrado
          e={borrando}
          onClose={() => setBorrando(null)}
          onHecho={(aviso) => {
            setBorrando(null);
            setAvisoBorrar(aviso ?? null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ==================== confirmar el borrado ============================ */

/**
 * Pregunta antes de borrar un registro de horas.
 *
 * Antes bastaba con pulsar dos veces el mismo botón, y eso no se entiende: no
 * hay nada que explique por qué el primer clic no hizo nada. Aquí se ve qué se
 * va a borrar y, si ya subió, que también se quitará de la hoja.
 */
function ConfirmarBorrado({
  e,
  onClose,
  onHecho,
}: {
  e: EntradaVista;
  onClose: () => void;
  onHecho: (aviso?: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const enHoja = e.sheetSync === "ok";

  const borrar = () =>
    startTransition(async () => {
      const r = await borrarActividad(e.id);
      if (!r.ok) {
        setError(r.error ?? "No se pudo borrar.");
        return;
      }
      onHecho(r.aviso);
    });

  return (
    <CvPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar borrado"
        onClick={onClose}
        className="cv-fade-in"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 70,
          background: "rgba(7,23,43,.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          onClick={(ev) => ev.stopPropagation()}
          className="cv-pop"
          style={{
            width: 400,
            maxWidth: "100%",
            background: "#fff",
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(7,23,43,.4)",
          }}
        >
          <div style={{ padding: "20px 22px 4px" }}>
            <span
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "#FCE9EA",
                color: "#B23A40",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 13,
              }}
            >
              <Trash2 size={18} />
            </span>
            <span
              className="soh-display"
              style={{
                display: "block",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-.02em",
                color: "var(--cv-ink)",
              }}
            >
              ¿Borrar este registro?
            </span>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--cv-ink-3)",
                margin: "6px 0 0",
                lineHeight: 1.6,
              }}
            >
              {enHoja
                ? "Se quitará de la plataforma y también de la hoja de actividad."
                : "Todavía no ha subido a la hoja, así que solo se quita de aquí."}
            </p>

            <div
              className="cv-card"
              style={{
                borderRadius: 12,
                padding: "11px 13px",
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 11,
              }}
            >
              <span
                className="soh-display"
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: "var(--cv-ink)",
                  flexShrink: 0,
                }}
              >
                {fmt(e.hours)} h
              </span>
              <span
                aria-hidden="true"
                style={{ width: 1, height: 26, background: "var(--cv-line-soft)" }}
              />
              <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--cv-ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {e.project}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    color: "var(--cv-ink-4)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {diaCorto(e.date)} · {e.deliverable}
                </span>
              </span>
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  margin: "13px 0 0",
                  border: "1px solid #F5C6C9",
                  background: "#FCE9EA",
                  borderRadius: 11,
                  padding: "9px 11px",
                  fontSize: 11.5,
                  color: "#8E2A2E",
                }}
              >
                {error}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 9,
              padding: "16px 22px 18px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={pendiente}
              className="cv-btn"
              style={{
                padding: "9px 16px",
                borderRadius: 99,
                border: "1px solid var(--cv-line)",
                background: "transparent",
                color: "var(--cv-ink-2)",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={borrar}
              disabled={pendiente}
              className="cv-btn"
              style={{
                padding: "9px 18px",
                borderRadius: 99,
                border: "none",
                background: "#B23A40",
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                opacity: pendiente ? 0.65 : 1,
              }}
            >
              {pendiente ? "Borrando…" : "Sí, borrar"}
            </button>
          </div>
        </div>
      </div>
    </CvPortal>
  );
}

/* ==================== reportar horas: varias líneas ==================== */

function FormReporte({
  fechaInicial,
  hoyISO,
  horasPorDia,
  topeDia,
  catalogos,
  aprobadores,
  onClose,
}: {
  /**
   * El día con el que abre el formulario.
   *
   * Viene decidido desde fuera: el botón de arriba manda hoy, y el "+ Sin
   * registros" de cada fila manda SU día. Adivinarlo aquí obligaba a abrir
   * siempre en el mismo sitio y luego corregir la fecha a mano.
   */
  fechaInicial: string;
  /** Hoy, en ISO. Sirve para no dejar reportar días futuros. */
  hoyISO: string;
  /** Horas normales ya reportadas por día, para avisar antes de guardar. */
  horasPorDia: Map<string, number>;
  /** El tope de esta persona: no todas tienen jornada de ocho horas. */
  topeDia: number;
  catalogos: {
    proyectos: Opcion[];
    entregables: Opcion[];
    tipos: Opcion[];
    esfuerzos: Opcion[];
  };
  /** A quién se le pueden enviar las líneas marcadas como horas extra. */
  aprobadores: { email: string; userName: string; correo?: string | null }[];
  onClose: () => void;
}) {
  const [fecha, setFecha] = useState(fechaInicial);
  const [proyecto, setProyecto] = useState("");
  const [lineas, setLineas] = useState<LineaActividad[]>([{ ...LINEA_VACIA }]);
  const [aprobadorExtra, setAprobadorExtra] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  // Los entregables cambian con el proyecto, igual que en el Gestor.
  const entregablesDelProyecto = useMemo(
    () => catalogos.entregables.filter((e) => e.parent === proyecto),
    [catalogos.entregables, proyecto],
  );

  const cambiar = (
    i: number,
    campo: keyof LineaActividad,
    valor: string | number | boolean,
  ) =>
    setLineas((prev) =>
      prev.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, [campo]: valor };
        // La disciplina la trae el entregable: no se pregunta dos veces.
        if (campo === "deliverable") {
          const ent = entregablesDelProyecto.find((e) => e.value === valor);
          next.discipline = ent?.extra ?? "GENERAL";
        }
        return next;
      }),
    );

  const total = lineas.reduce((n, l) => n + (Number(l.hours) || 0), 0);

  // "Jueves, 6 de agosto" — el día que se está capturando, en la cabecera.
  const tituloFecha = useMemo(() => {
    const d = new Date(fecha + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "Reportar horas";
    const t = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }, [fecha]);

  /*
   * El día completo: lo que ya estaba guardado más lo que se está capturando.
   *
   * Sin sumar lo previo, el pie decía "3 h · de 8 h" en un día que ya tenía 8
   * reportadas, y el rechazo llegaba hasta darle a guardar.
   */
  const yaReportado = horasPorDia.get(fecha) ?? 0;
  const nuevasNormales = lineas
    .filter((l) => !l.extra)
    .reduce((n, l) => n + (Number(l.hours) || 0), 0);
  const totalDia = yaReportado + nuevasNormales;
  const diaLleno = yaReportado >= topeDia;
  // Lo que sobra del tope tiene que ir como horas extra, no como normales.
  const excedeTope = totalDia > topeDia;

  const totalTono = excedeTope
    ? { c: "#B23A40", msg: `pasa de ${fmt(topeDia)} h` }
    : totalDia > topeDia
      ? { c: "#B07C10", msg: "arriba de la jornada" }
      : totalDia === topeDia
        ? { c: "#178A49", msg: "jornada completa" }
        : totalDia > 0
          ? { c: "#178A49", msg: "de 8 h" }
          : { c: "var(--cv-ink-4)", msg: "sin registros" };

  /*
   * Las líneas marcadas como extra necesitan a quién enviarlas: son las mismas
   * horas extra que se piden desde su propio cajón, así que pasan por la misma
   * aprobación. Sin destinatario se quedaban en "pendiente" para siempre,
   * porque nadie las veía.
   */
  const hayExtra = lineas.some((l) => l.extra && l.hours > 0);

  const enviar = () => {
    setError(null);
    if (hayExtra && !aprobadorExtra) {
      setError("Marcaste horas extra: elige a quién enviarlas para aprobación.");
      return;
    }
    startTransition(async () => {
      const r = await reportarHoras(
        fecha,
        proyecto,
        lineas,
        hayExtra ? aprobadorExtra : null,
      );
      if (r.ok) onClose();
      else setError(r.error ?? "No se pudo guardar.");
    });
  };

  return (
    <CvPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reportar horas"
        onClick={onClose}
        className="cv-fade-in"
        style={velo}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="cv-slide-r"
          style={{ ...caja, width: 560, maxWidth: "96vw" }}
        >
          <Cabecera
            rotulo="Reporte diario de actividad"
            titulo={tituloFecha}
            onClose={onClose}
          />

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "17px 20px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 15,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                gap: 10,
              }}
            >
              <label style={{ display: "block" }}>
                <span style={etiqueta}>Día</span>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  max={hoyISO}
                  style={campo}
                />
                {yaReportado > 0 && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 5,
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: diaLleno ? "#B07C10" : "var(--cv-ink-3)",
                    }}
                  >
                    {diaLleno
                      ? `Este día ya tiene ${fmt(yaReportado)} h — lo nuevo va como horas extra`
                      : `Ya llevas ${fmt(yaReportado)} h reportadas este día`}
                  </span>
                )}
              </label>
              <label style={{ display: "block" }}>
                <span style={etiqueta}>Proyecto</span>
                <CvCombo
                  opciones={catalogos.proyectos.map((p) => p.value)}
                  valor={proyecto}
                  onChange={(v) => {
                    setProyecto(v);
                    // Al cambiar de proyecto los entregables ya no valen.
                    setLineas([{ ...LINEA_VACIA }]);
                  }}
                  placeholder="Escribe o elige un proyecto…"
                  ariaLabel="Proyecto"
                />
              </label>
            </div>

            {proyecto && (
              <>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {lineas.map((l, i) => (
                    <div
                      key={i}
                      className="cv-card"
                      style={{
                        borderRadius: 14,
                        padding: "12px 13px",
                        borderLeft: `3px solid ${l.extra ? "#F5B843" : colorDe(proyecto)}`,
                      }}
                    >
                      {/* el entregable manda: va arriba y con su número */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 9,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 19,
                            height: 19,
                            borderRadius: 6,
                            background: "var(--cv-line-soft)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 9.5,
                            fontWeight: 700,
                            color: "var(--cv-ink-3)",
                            flexShrink: 0,
                          }}
                        >
                          {i + 1}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <CvCombo
                            opciones={entregablesDelProyecto.map(
                              (e) => e.value,
                            )}
                            valor={l.deliverable}
                            onChange={(v) => cambiar(i, "deliverable", v)}
                            placeholder="¿Qué entregable trabajaste?"
                            ariaLabel="Entregable"
                          />
                        </span>
                        {lineas.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setLineas((p) => p.filter((_, j) => j !== i))
                            }
                            title="Quitar registro"
                            className="cv-btn"
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 7,
                              border: "1px solid var(--cv-line-soft)",
                              background: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--cv-ink-4)",
                              flexShrink: 0,
                            }}
                          >
                            <X size={11} strokeWidth={2.2} />
                          </button>
                        )}
                      </div>

                      <div
                        style={{ display: "flex", gap: 7, flexWrap: "wrap" }}
                      >
                        <span style={{ flex: 1, minWidth: 128 }}>
                          <span style={rotuloMini}>Tipo</span>
                          <CvCombo
                            opciones={catalogos.tipos.map((t) => t.value)}
                            valor={l.kind}
                            onChange={(v) => cambiar(i, "kind", v)}
                            placeholder="Elige o escribe…"
                            ariaLabel="Tipo de actividad"
                          />
                        </span>
                        <span style={{ flex: 1, minWidth: 128 }}>
                          <span style={rotuloMini}>Esfuerzo</span>
                          <CvCombo
                            opciones={catalogos.esfuerzos.map((e) => e.value)}
                            valor={l.effort}
                            onChange={(v) => cambiar(i, "effort", v)}
                            placeholder="Elige o escribe…"
                            ariaLabel="Esfuerzo"
                          />
                        </span>
                        <span style={{ width: 78, flexShrink: 0 }}>
                          <span style={rotuloMini}>Horas</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="16"
                            value={l.hours || ""}
                            onChange={(e) =>
                              cambiar(i, "hours", Number(e.target.value))
                            }
                            placeholder="0"
                            aria-label="Horas"
                            style={{
                              ...campoSm,
                              textAlign: "center",
                              fontWeight: 700,
                              // Fuera del rango razonable, el borde avisa antes
                              // de que el servidor rechace.
                              border: `1px solid ${
                                l.hours > 12 || l.hours < 0
                                  ? "#F5C6C9"
                                  : "var(--cv-line-soft)"
                              }`,
                            }}
                          />
                        </span>
                      </div>

                      <input
                        value={l.comment}
                        onChange={(e) => cambiar(i, "comment", e.target.value)}
                        placeholder="Comentarios (opcional)"
                        aria-label="Comentario"
                        style={{ ...campoSm, marginTop: 7 }}
                      />

                      <button
                        type="button"
                        onClick={() => cambiar(i, "extra", !l.extra)}
                        aria-pressed={!!l.extra}
                        className="cv-btn"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          border: "none",
                          background: "transparent",
                          padding: "8px 0 0",
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: l.extra ? "#B07C10" : "var(--cv-ink-4)",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 15,
                            height: 15,
                            borderRadius: 5,
                            border: `1.5px solid ${l.extra ? "#F5B843" : "var(--cv-line)"}`,
                            background: l.extra ? "#F5B843" : "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {l.extra && (
                            <Check size={9} strokeWidth={3.4} color="#fff" />
                          )}
                        </span>
                        Contar como horas extra
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setLineas((p) => [...p, { ...LINEA_VACIA }])}
                  className="cv-btn"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    border: "1px dashed #B9CBD9",
                    background: "#fff",
                    borderRadius: 12,
                    padding: 11,
                    color: "#22726F",
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  <Plus size={14} strokeWidth={2.6} />
                  Agregar otro registro
                </button>

                {/* Las líneas extra necesitan destinatario: son las mismas
                    horas extra de siempre y pasan por la misma aprobación. */}
                {hayExtra && (
                  <div
                    style={{
                      border: "1px solid #F0D9A0",
                      background: "#FDF3DC",
                      borderRadius: 12,
                      padding: "12px 14px",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#8A6410",
                        marginBottom: 3,
                      }}
                    >
                      Marcaste horas extra
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 10.5,
                        color: "#8A6410",
                        marginBottom: 9,
                        lineHeight: 1.5,
                      }}
                    >
                      Esas líneas van a aprobación. Lo normal se guarda de una
                      vez; lo extra queda pendiente hasta que lo aprueben.
                    </span>
                    <span style={etiqueta}>
                      Enviar a<span style={{ color: "#B23A40" }}> *</span>
                    </span>
                    <CvCombo
                      opciones={aprobadores.map((a) => a.userName)}
                      valor={
                        aprobadores.find((a) => a.email === aprobadorExtra)
                          ?.userName ?? ""
                      }
                      onChange={(v) =>
                        setAprobadorExtra(
                          aprobadores.find((a) => a.userName === v)?.email ?? "",
                        )
                      }
                      placeholder="Escribe o elige a quién…"
                      ariaLabel="Enviar horas extra a"
                    />
                  </div>
                )}
              </>
            )}

            {error && <Error texto={error} />}
          </div>

          <Pie
            onClose={onClose}
            onEnviar={enviar}
            pendiente={pendiente}
            etiqueta="Enviar reporte"
            bloqueado={!proyecto || total === 0 || excedeTope}
            resumen={
              <span style={{ flex: 1, minWidth: 120 }}>
                <span
                  className="soh-mono"
                  style={{
                    display: "block",
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--cv-ink-4)",
                  }}
                >
                  Total del día
                </span>
                <span
                  style={{ display: "flex", alignItems: "baseline", gap: 6 }}
                >
                  <span
                    className="soh-display"
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      lineHeight: 1.1,
                      color: totalTono.c,
                    }}
                  >
                    {fmt(totalDia)} h
                  </span>
                  <span style={{ fontSize: 10.5, color: totalTono.c }}>
                    {totalTono.msg}
                  </span>
                </span>
              </span>
            }
          />
        </div>
      </div>
    </CvPortal>
  );
}

/* ========================== solicitar horas extra ====================== */

function FormExtra({
  catalogos,
  aprobadores,
  mios,
  onClose,
}: {
  catalogos: {
    proyectos: Opcion[];
    entregables: Opcion[];
    tipos: Opcion[];
    esfuerzos: Opcion[];
  };
  aprobadores: { email: string; userName: string; correo?: string | null }[];
  mios: ExtraVista[];
  onClose: () => void;
}) {
  const [proyecto, setProyecto] = useState("");
  const [entregable, setEntregable] = useState("");
  const [tipoExtra, setTipoExtra] = useState("");
  const [aprobador, setAprobador] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const entregables = useMemo(
    () => catalogos.entregables.filter((e) => e.parent === proyecto),
    [catalogos.entregables, proyecto],
  );

  /*
   * Se envía con `onSubmit`, no con `action={...}`: con `action` el formulario
   * queda atado al identificador de la acción de servidor, que cambia en cada
   * compilación, y una pestaña abierta desde antes de un reinicio falla con
   * "Server Action was not found" perdiendo lo escrito.
   */
  const enviar = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await solicitarExtra(form);
      if (r.ok) onClose();
      else setError(r.error ?? "No se pudo enviar.");
    });
  };

  return (
    <CvPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Horas extra"
        onClick={onClose}
        className="cv-fade-in"
        style={velo}
      >
        <form
          onSubmit={enviar}
          onClick={(e) => e.stopPropagation()}
          className="cv-pop"
          style={{ ...caja, width: 560 }}
        >
          <Cabecera
            rotulo="Fuera de tu jornada"
            titulo="Solicitar horas extra"
            onClose={onClose}
          />

          <div
            style={{
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 13,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <label style={{ display: "block" }}>
                <span style={etiqueta}>Día</span>
                <input name="date" type="date" required style={campo} />
              </label>
              <label style={{ display: "block" }}>
                <span style={etiqueta}>Horas</span>
                <input
                  name="hours"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="16"
                  required
                  placeholder="2"
                  style={campo}
                />
              </label>
            </div>

            <label style={{ display: "block" }}>
              <span style={etiqueta}>Proyecto</span>
              <CvCombo
                name="project"
                requerido
                opciones={catalogos.proyectos.map((p) => p.value)}
                valor={proyecto}
                onChange={setProyecto}
                placeholder="Escribe o elige…"
                ariaLabel="Proyecto"
              />
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <label style={{ display: "block" }}>
                <span style={etiqueta}>Entregable</span>
                <CvCombo
                  name="deliverable"
                  requerido
                  opciones={entregables.map((e) => e.value)}
                  valor={entregable}
                  onChange={setEntregable}
                  placeholder="Escribe o elige…"
                  ariaLabel="Entregable"
                />
              </label>
              <label style={{ display: "block" }}>
                <span style={etiqueta}>Tipo</span>
                <CvCombo
                  name="kind"
                  opciones={catalogos.tipos.map((t) => t.value)}
                  valor={tipoExtra}
                  onChange={setTipoExtra}
                  placeholder="Escribe o elige…"
                  ariaLabel="Tipo"
                />
              </label>
            </div>

            <label style={{ display: "block" }}>
              <span style={etiqueta}>
                Enviar a<span style={{ color: "#B23A40" }}> *</span>
              </span>
              <CvCombo
                opciones={aprobadores.map((a) => a.userName)}
                valor={
                  aprobadores.find((a) => a.email === aprobador)?.userName ?? ""
                }
                onChange={(v) =>
                  setAprobador(
                    aprobadores.find((a) => a.userName === v)?.email ?? "",
                  )
                }
                placeholder="Escribe o elige a quién…"
                ariaLabel="Enviar a"
              />
              <input type="hidden" name="approver" value={aprobador} />
            </label>

            <label style={{ display: "block" }}>
              <span style={etiqueta}>
                Justificación<span style={{ color: "#B23A40" }}> *</span>
              </span>
              <textarea
                name="reason"
                required
                rows={2}
                placeholder="Por qué hicieron falta esas horas"
                style={{ ...campo, resize: "vertical" }}
              />
            </label>

            {error && <Error texto={error} />}

            {mios.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid var(--cv-line-soft)",
                  paddingTop: 12,
                }}
              >
                <span
                  className="soh-mono"
                  style={{
                    display: "block",
                    fontSize: 9.5,
                    letterSpacing: "0.13em",
                    color: "var(--cv-ink-4)",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Tus solicitudes
                </span>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {mios.slice(0, 5).map((e) => {
                    const st = ST[e.status] ?? ST.pendiente;
                    return (
                      <span
                        key={e.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          fontSize: 11.5,
                        }}
                      >
                        <span
                          style={{
                            color: "var(--cv-ink-3)",
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {diaCorto(e.date)} · {e.hours} h ·{" "}
                          {e.project.slice(0, 24)}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 6,
                            background: st.soft,
                            color: st.ink,
                            flexShrink: 0,
                          }}
                        >
                          {st.label}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <Pie
            onClose={onClose}
            pendiente={pendiente}
            etiqueta="Enviar solicitud"
            submit
          />
        </form>
      </div>
    </CvPortal>
  );
}

/* ------------------------------------------------------------ piezas ---- */

/*
 * Los formularios son cajones que entran por la derecha, no ventanas al
 * centro: se capturan varias líneas seguidas y un panel alto se lee mejor
 * que una caja que crece hasta salirse de la pantalla.
 */
const velo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  background: "rgba(7,23,43,.42)",
  backdropFilter: "blur(2px)",
  WebkitBackdropFilter: "blur(2px)",
};

/** El cajón: alto completo, cabecera y pie fijos, contenido con scroll. */
const caja: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 71,
  background: "var(--cv-faint)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "-18px 0 50px rgba(7,23,43,.24)",
};

/** Cabecera oscura del cajón, con el rótulo pequeño arriba del título. */
function Cabecera({
  titulo,
  rotulo,
  onClose,
}: {
  titulo: string;
  rotulo: string;
  onClose: () => void;
}) {
  return (
    <div
      className="cv-chrome-dots"
      style={{
        position: "relative",
        background: "linear-gradient(150deg, var(--cv-navy), var(--cv-deep))",
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
            "radial-gradient(circle, rgba(57,184,180,.2), transparent 66%)",
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
            {rotulo}
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
            {titulo}
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
  );
}

/**
 * Pie fijo del cajón.
 *
 * A la izquierda va el resumen —el total del día, o el error que impide
 * enviar—; a la derecha, las acciones. Así el número que decide si el
 * reporte está bien está junto al botón que lo manda.
 */
function Pie({
  onClose,
  onEnviar,
  pendiente,
  etiqueta,
  submit = false,
  bloqueado = false,
  resumen,
}: {
  onClose: () => void;
  onEnviar?: () => void;
  pendiente: boolean;
  etiqueta: string;
  submit?: boolean;
  bloqueado?: boolean;
  /** Bloque libre a la izquierda: totales o el motivo del bloqueo. */
  resumen?: React.ReactNode;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: "1px solid var(--cv-line-soft)",
        background: "#fff",
        padding: "13px 20px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      {resumen ?? <span style={{ flex: 1 }} />}
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
        type={submit ? "submit" : "button"}
        onClick={submit ? undefined : onEnviar}
        disabled={pendiente || bloqueado}
        className="cv-btn"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          border: "none",
          background: bloqueado ? "var(--cv-line)" : "var(--cv-green-ink)",
          color: bloqueado ? "var(--cv-ink-4)" : "#fff",
          fontSize: 12.5,
          fontWeight: 700,
          padding: "10px 17px",
          borderRadius: 11,
          flexShrink: 0,
          boxShadow: bloqueado ? "none" : "0 8px 18px rgba(25,153,80,.25)",
          cursor: bloqueado ? "not-allowed" : "pointer",
          opacity: pendiente ? 0.6 : 1,
        }}
      >
        {!pendiente && !bloqueado && <Check size={14} strokeWidth={2.4} />}
        {pendiente ? "Guardando…" : etiqueta}
      </button>
    </div>
  );
}

function Error({ texto }: { texto: string }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "9px 12px",
        borderRadius: 10,
        background: "#FCE9EA",
        color: "#B23A40",
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      {texto}
    </p>
  );
}

const etiqueta: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--cv-ink-2)",
  marginBottom: 5,
};

const campo: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 11,
  border: "1px solid var(--cv-line)",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--cv-ink)",
  background: "#fff",
  outline: "none",
};

/** Los botones de semana del historial, idénticos a los del reporte. */
const navHist: React.CSSProperties = {
  width: 27,
  height: 27,
  borderRadius: 8,
  border: "1px solid var(--cv-line)",
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--cv-ink-2)",
};

/** Rótulo diminuto sobre cada campo de la tarjeta de registro. */
const rotuloMini: React.CSSProperties = {
  display: "block",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--cv-ink-4)",
  marginBottom: 3,
};

const campoSm: React.CSSProperties = {
  ...campo,
  padding: "8px 10px",
  fontSize: 12,
};
