"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Check, Plus, X } from "lucide-react";
import {
  comentarTicket,
  crearTicket,
  resolverTicket,
} from "@/lib/trabajo/actions";
import type { EnvioTicket } from "@/lib/trabajo/actions";
import { relativeTime } from "@/lib/portal/time";
import type { TicketView } from "@/lib/trabajo/queries";

/**
 * Tickets — reporta y da seguimiento sin salir de la plataforma.
 *
 * La fila abre un panel lateral con el historial completo; comentar y
 * resolver escriben eventos reales en el ticket.
 */

/* Los mismos valores del Gestor: SOFTWARE/HARDWARE y ALTA/MEDIA/BAJA. */
const CATEGORIAS = ["SOFTWARE", "HARDWARE"];
const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"];

const PRIO_UI: Record<string, { dot: string; ink: string }> = {
  ALTA: { dot: "#E95E64", ink: "#B23A40" },
  MEDIA: { dot: "#F5B843", ink: "#B07C10" },
  BAJA: { dot: "#8A99AD", ink: "#5D6E87" },
};

/*
 * Los tres estados que existen de verdad.
 *
 * Había un cuarto, "En espera", que no sale de ningún lado: ni la hoja
 * `BDD MANTENIMIENTO` ni el script del gestor guardan estado alguno, y de los
 * diez tickets históricos ninguno lo ha usado nunca. Era una burbuja que no se
 * podía alcanzar.
 */
const ST_UI: Record<string, { soft: string; ink: string }> = {
  "En revisión": { soft: "#EDEBFC", ink: "#5D50C9" },
  "En proceso": { soft: "#E9F1FB", ink: "#31677F" },
  Resuelto: { soft: "#E4F8EB", ink: "#178A49" },
};

const FILTROS = ["Todos", "En revisión", "En proceso", "Resuelto"];

/**
 * Marca de "el problema no está en la lista".
 *
 * No se guarda: al enviar se sustituye por lo que la persona escribió. Lleva
 * caracteres que ninguna falla real usa para que jamás choque con una del
 * catálogo.
 */
const OTRO = "__OTRO__";

export function TicketsScreen({
  tickets,
  fallas,
  atiende = false,
}: {
  tickets: TicketView[];
  /// Catálogo de problemas por tipo, del Gestor.
  fallas: { value: string; parent: string }[];
  /// Quien atiende Sistemas ve la bandeja de todos; el resto, solo la suya.
  atiende?: boolean;
}) {
  const [filtro, setFiltro] = useState("Todos");

  /*
   * Los filtros que llevan a algún sitio.
   *
   * `BDD MANTENIMIENTO` no guarda el estado —solo fecha, código, colaborador,
   * falla y urgencia—, así que los diez tickets que vinieron de ahí entraron
   * todos como "Resuelto": no había de dónde sacar otra cosa. Enseñar "En
   * revisión" y "En proceso" cuando ninguno lo está deja tres botones que solo
   * pueden llevar a una lista vacía.
   *
   * Se calcula, no se fija a mano: en cuanto se levante un ticket de verdad y
   * pase por el circuito, su filtro aparece solo.
   */
  const filtrosUtiles = useMemo(() => {
    const hay = new Set(tickets.map((t) => t.status));
    const conCosas = FILTROS.filter((f) => f !== "Todos" && hay.has(f));
    // Con un solo estado, "Todos" ya lo enseña: la barra entera sobra.
    return conCosas.length > 1 ? ["Todos", ...conCosas] : [];
  }, [tickets]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const visibles = useMemo(
    () => tickets.filter((t) => filtro === "Todos" || t.status === filtro),
    [tickets, filtro],
  );

  const sel = tickets.find((t) => t.id === abierto) ?? null;

  return (
    <div style={{ padding: "24px 28px 40px" }}>
      <div
        className="cv-rise"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
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
            Tickets
          </h1>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--cv-ink-3)",
              margin: "4px 0 0",
            }}
          >
            {atiende
              ? "Bandeja de Sistemas — los tickets de todo el equipo"
              : "Reporta y da seguimiento a tus solicitudes"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="cv-btn"
          style={{
            border: "none",
            background: "var(--cv-green-ink)",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 700,
            padding: "10px 16px",
            borderRadius: 11,
            boxShadow: "0 8px 18px rgba(25,153,80,.25)",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <Plus size={14} />
          Nuevo ticket
        </button>
      </div>

      {filtrosUtiles.length > 0 && (
      <div
        className="cv-rise"
        style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}
      >
        {filtrosUtiles.map((f) => {
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
                fontSize: 11.5,
                fontWeight: 600,
                padding: "7px 13px",
                borderRadius: 11,
              }}
            >
              {f === "Resuelto" ? "Resueltos" : f}
            </button>
          );
        })}
      </div>
      )}

      {visibles.length === 0 ? (
        <div
          className="cv-card cv-rise"
          style={{
            borderRadius: 16,
            padding: "34px 24px",
            textAlign: "center",
          }}
        >
          <p
            className="soh-display"
            style={{
              fontSize: 14.5,
              fontWeight: 700,
              color: "var(--cv-ink)",
              margin: 0,
            }}
          >
            {tickets.length === 0
              ? "Sin tickets todavía"
              : "Nada con ese filtro"}
          </p>
          <p
            style={{
              fontSize: 12,
              color: "var(--cv-ink-3)",
              margin: "6px 0 0",
            }}
          >
            {tickets.length === 0
              ? "Cuando reportes un problema, aquí verás su folio y su avance."
              : "Prueba con otro estado."}
          </p>
        </div>
      ) : (
        <div
          className="cv-card cv-rise"
          style={{ borderRadius: 16, overflow: "hidden" }}
        >
          {visibles.map((t, i) => {
            const prio = PRIO_UI[t.priority] ?? PRIO_UI.Media;
            const st = ST_UI[t.status] ?? ST_UI["En revisión"];
            return (
              <div
                key={t.id}
                onClick={() => setAbierto(t.id)}
                className="cv-row-h"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 17px",
                  borderTop: i > 0 ? "1px solid var(--cv-row-line)" : "none",
                  cursor: "pointer",
                }}
              >
                <span
                  className="soh-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--cv-ink-4)",
                    fontWeight: 600,
                    // El código del gestor son 17 caracteres
                    // ("260818_SOFT_26033"), no los 7 de un "TCK-014": con el
                    // ancho de antes se salía por encima del título.
                    width: 118,
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.folio}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--cv-ink)",
                    }}
                  >
                    {t.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10.5,
                      color: "var(--cv-ink-3)",
                      marginTop: 1,
                    }}
                  >
                    {t.category} ·{" "}
                    {relativeTime(new Date(t.createdAt).getTime())} · act.{" "}
                    {relativeTime(new Date(t.updatedAt).getTime())}
                  </span>
                </span>
                <span
                  title={`Prioridad ${t.priority}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 10,
                    fontWeight: 600,
                    color: prio.ink,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: prio.dot,
                    }}
                  />
                  {t.priority}
                </span>
                <span
                  style={{
                    padding: "3px 9px",
                    borderRadius: 7,
                    background: st.soft,
                    color: st.ink,
                    fontSize: 9.5,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {t.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {sel && <TicketDrawer t={sel} onClose={() => setAbierto(null)} />}
      {creando && (
        <FormTicket fallas={fallas} onClose={() => setCreando(false)} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- drawer --- */

function TicketDrawer({ t, onClose }: { t: TicketView; onClose: () => void }) {
  const [comentario, setComentario] = useState("");
  const [pendiente, startTransition] = useTransition();

  const st = ST_UI[t.status] ?? ST_UI["En revisión"];

  const comentar = () => {
    const texto = comentario.trim();
    if (!texto) return;
    setComentario("");
    startTransition(() => {
      void comentarTicket(t.id, texto);
    });
  };

  return (
    <div>
      <div
        onClick={onClose}
        className="cv-fade-in"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(7,23,43,.35)",
          zIndex: 60,
        }}
      />
      <aside
        role="dialog"
        aria-label={t.folio}
        className="cv-slide-r"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100%",
          width: 420,
          maxWidth: "94vw",
          background: "var(--cv-bg)",
          zIndex: 61,
          boxShadow: "-18px 0 44px rgba(7,23,43,.25)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            background: "#fff",
            padding: "16px 18px",
            borderBottom: "1px solid var(--cv-line-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              className="soh-mono"
              style={{
                fontSize: 10,
                color: "var(--cv-ink-4)",
                fontWeight: 600,
              }}
            >
              {t.folio}
            </span>
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
              {t.status}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="cv-btn"
              style={{
                marginLeft: "auto",
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "none",
                background: "var(--cv-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--cv-ink-2)",
              }}
            >
              <X size={13} />
            </button>
          </div>
          <h2
            className="soh-display"
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--cv-ink)",
              margin: "9px 0 0",
            }}
          >
            {t.title}
          </h2>
          <p
            style={{
              fontSize: 11,
              color: "var(--cv-ink-3)",
              margin: "3px 0 0",
            }}
          >
            {t.category} · prioridad {t.priority}
            {t.assignee ? ` · responsable ${t.assignee}` : ""}
          </p>
        </div>

        <div
          className="soh-scroll-lt"
          style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}
        >
          <span
            className="soh-mono"
            style={{
              display: "block",
              fontSize: 10,
              letterSpacing: "0.13em",
              color: "var(--cv-ink-4)",
              fontWeight: 600,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Historial
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {t.events.map((e, i) => (
              <div key={e.id} style={{ display: "flex", gap: 11 }}>
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background:
                        i === t.events.length - 1
                          ? "var(--cv-green)"
                          : "var(--cv-faint)",
                      marginTop: 4,
                    }}
                  />
                  {i < t.events.length - 1 && (
                    <span
                      style={{
                        width: 2,
                        flex: 1,
                        background: "var(--cv-line)",
                        margin: "3px 0",
                      }}
                    />
                  )}
                </span>
                <span style={{ paddingBottom: 14 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--cv-ink)",
                      fontWeight: 600,
                    }}
                  >
                    {e.text}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 10.5,
                      color: "var(--cv-ink-4)",
                      marginTop: 2,
                    }}
                  >
                    {relativeTime(new Date(e.createdAt).getTime())} ·{" "}
                    {e.author.split("@")[0]}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") comentar();
              }}
              placeholder="Añadir un comentario…"
              style={{
                flex: 1,
                border: "1px solid var(--cv-line)",
                borderRadius: 11,
                padding: "10px 12px",
                fontSize: 12,
                fontFamily: "inherit",
                outline: "none",
                background: "#fff",
                color: "var(--cv-ink)",
              }}
            />
            <button
              type="button"
              onClick={comentar}
              disabled={pendiente}
              className="cv-btn"
              style={{
                border: "none",
                background: "var(--cv-navy)",
                color: "#fff",
                fontSize: 11.5,
                fontWeight: 700,
                padding: "0 14px",
                borderRadius: 11,
              }}
            >
              Enviar
            </button>
          </div>
        </div>

        {t.status !== "Resuelto" && (
          <div
            style={{
              background: "#fff",
              borderTop: "1px solid var(--cv-line-soft)",
              padding: "13px 18px",
              display: "flex",
              gap: 9,
            }}
          >
            <button
              type="button"
              onClick={() =>
                startTransition(() => {
                  void resolverTicket(t.id);
                })
              }
              disabled={pendiente}
              className="cv-btn"
              style={{
                flex: 1,
                border: "none",
                background: "var(--cv-green-ink)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                padding: 10,
                borderRadius: 11,
              }}
            >
              Marcar como resuelto
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------- nuevo ticket -- */

function FormTicket({
  fallas,
  onClose,
}: {
  fallas: { value: string; parent: string }[];
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState("SOFTWARE");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  /*
   * Cómo fue con cada canal.
   *
   * El ticket se guarda siempre; Dynamics y el correo pueden fallar por
   * separado. Se enseña SIEMPRE, no solo cuando algo va mal: quien levanta una
   * avería quiere ver que llegó a Sistemas, y cerrar la ventana sin decir nada
   * le deja creyendo que sí aunque no haya salido de aquí.
   */
  const [parte, setParte] = useState<EnvioTicket | null>(null);

  /*
   * Qué problema se eligió, para saber si hay que pedir que lo escriba.
   *
   * Al cambiar de tipo (hardware/software) se limpia: las fallas del catálogo
   * son distintas para cada uno, y dejar elegido algo que ya no está en la
   * lista mandaría un problema que no corresponde.
   */
  const [problema, setProblema] = useState("");

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
      const r = await crearTicket(form);
      if (!r.ok) {
        setError(r.error ?? "No se pudo crear.");
        return;
      }
      // El ticket ya está guardado. La ventana se queda enseñando qué pasó
      // con Dynamics y con el correo; se cierra cuando la persona lo lee.
      setParte(
        r.envio ?? {
          dynamics: { ok: false, detalle: "Sin información." },
          correo: { ok: false, detalle: "Sin información." },
        },
      );
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo ticket"
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
      {parte ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="cv-pop"
          style={{
            width: 480,
            maxWidth: "100%",
            background: "#fff",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(7,23,43,.4)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 20px",
              borderBottom: "1px solid var(--cv-line-soft)",
            }}
          >
            <Check size={17} style={{ color: "#178A49" }} />
            <h2
              className="soh-display"
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: 700,
                color: "var(--cv-ink)",
                margin: 0,
              }}
            >
              Ticket levantado
            </h2>
          </div>

          <div style={{ padding: "18px 20px" }}>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 12,
                color: "var(--cv-ink-3)",
                lineHeight: 1.55,
              }}
            >
              Tu ticket quedó guardado. Esto es lo que pasó al avisar:
            </p>

            {[
              {
                nombre: "Dynamics",
                r: parte.dynamics,
                bien: (d: string) => `Caso creado · ${d}`,
              },
              {
                nombre: "Correo",
                r: parte.correo,
                bien: (d: string) => `Enviado a ${d}`,
              },
            ].map(({ nombre, r, bien }) => (
              <div
                key={nombre}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "11px 12px",
                  marginBottom: 8,
                  borderRadius: 12,
                  border: `1px solid ${r.ok ? "#B6E7C9" : "#F3C4C6"}`,
                  background: r.ok ? "#F1FBF5" : "#FDF2F3",
                }}
              >
                {r.ok ? (
                  <Check
                    size={15}
                    strokeWidth={2.6}
                    style={{ color: "#178A49", flexShrink: 0, marginTop: 1 }}
                  />
                ) : (
                  <AlertCircle
                    size={15}
                    style={{ color: "#B23A40", flexShrink: 0, marginTop: 1 }}
                  />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      color: r.ok ? "#136B39" : "#8E2F34",
                    }}
                  >
                    {nombre}
                    {r.ok ? "" : " — no se pudo"}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: "var(--cv-ink-3)",
                      marginTop: 2,
                      wordBreak: "break-word",
                    }}
                  >
                    {r.ok ? bien(r.detalle) : r.detalle}
                  </span>
                </span>
              </div>
            ))}

            {(!parte.dynamics.ok || !parte.correo.ok) && (
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: 11,
                  color: "var(--cv-ink-4)",
                  lineHeight: 1.55,
                }}
              >
                El ticket está guardado igualmente y queda constancia en su
                historial de lo que falló.
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "0 20px 18px",
            }}
          >
            <button
              type="button"
              className="cv-btn cv-btn-primario"
              onClick={onClose}
              style={{ padding: "9px 18px", borderRadius: 11, fontSize: 12.5 }}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : (
      <form
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        className="cv-pop"
        style={{
          width: 480,
          maxWidth: "100%",
          background: "#fff",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(7,23,43,.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid var(--cv-line-soft)",
          }}
        >
          <h2
            className="soh-display"
            style={{
              flex: 1,
              fontSize: 16,
              fontWeight: 700,
              color: "var(--cv-ink)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Nuevo ticket
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="cv-btn"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              border: "1px solid var(--cv-line)",
              background: "transparent",
              color: "var(--cv-ink-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div
          style={{
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 13,
          }}
        >
          <label style={{ display: "block" }}>
            <span style={etiqueta}>
              Qué pasa<span style={{ color: "#B23A40" }}> *</span>
            </span>
            <input
              name="title"
              required
              placeholder="La licencia de Revit no activa en mi equipo"
              style={campo}
            />
          </label>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <label style={{ display: "block" }}>
              <span style={etiqueta}>Categoría</span>
              <select
                name="category"
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value);
                  // Las fallas son distintas por categoría: lo elegido antes
                  // ya no está en la lista.
                  setProblema("");
                }}
                style={campo}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span style={etiqueta}>Prioridad</span>
              <select name="priority" defaultValue="MEDIA" style={campo}>
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ display: "block" }}>
            <span style={etiqueta}>Problema</span>
            <select
              name="problem"
              value={problema}
              onChange={(e) => setProblema(e.target.value)}
              style={campo}
            >
              <option value="">Elige el problema…</option>
              {fallas
                .filter((f) => f.parent === tipo)
                .map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value}
                  </option>
                ))}
              {/* El catálogo son 27 fallas conocidas; una avería nueva no
                  tiene por qué caber en ninguna. */}
              <option value={OTRO}>Otro (lo escribo yo)</option>
            </select>
          </label>

          {problema === OTRO && (
            <label style={{ display: "block" }}>
              <span style={etiqueta}>¿Cuál es el problema?</span>
              <input
                name="problemFree"
                autoFocus
                maxLength={120}
                placeholder="En una línea: qué falla"
                style={campo}
              />
            </label>
          )}

          <label style={{ display: "block" }}>
            <span style={etiqueta}>Detalle</span>
            <textarea
              name="detail"
              rows={3}
              placeholder="Qué intentaste, desde cuándo pasa, qué mensaje sale…"
              style={{ ...campo, resize: "vertical" }}
            />
          </label>

          {error && (
            <p
              style={{
                margin: 0,
                padding: "9px 12px",
                borderRadius: 10,
                background: "#FCE9EA",
                color: "#B23A40",
                fontSize: 12.5,
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
            padding: "14px 20px",
            borderTop: "1px solid var(--cv-line-soft)",
            background: "var(--cv-hover)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
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
            type="submit"
            disabled={pendiente}
            className="cv-btn"
            style={{
              padding: "9px 18px",
              borderRadius: 99,
              border: "none",
              background: "var(--cv-green-ink)",
              color: "#fff",
              fontSize: 12.5,
              fontWeight: 700,
              opacity: pendiente ? 0.65 : 1,
            }}
          >
            {pendiente ? "Creando…" : "Crear ticket"}
          </button>
        </div>
      </form>
      )}
    </div>
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
