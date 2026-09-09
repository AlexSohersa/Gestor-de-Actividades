"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  Check,
  Fingerprint,
  House,
  LogIn,
  LogOut,
  UtensilsCrossed,
} from "lucide-react";

import {
  checarHomeOffice,
  type EstadoHO,
  type Marca,
  type Modalidad,
} from "@/lib/gestor/homeoffice";
import { CvPortal } from "@/components/conexion/CvPortal";

/**
 * El checador del día: entrada, comida y salida.
 *
 * Un botón discreto en la barra que abre el detalle. Dentro, los cuatro
 * momentos en orden, con su hora en cuanto se marcan: la jornada se lee de
 * arriba abajo como ocurrió.
 *
 * La modalidad —oficina o casa— se elige una vez, al abrir el día, y vale para
 * el resto. Preguntarlo en cada marca eran tres toques más al día para un dato
 * que casi nunca cambia a media jornada.
 */

/** Los cuatro momentos, en el orden en que ocurren. */
const PASOS: {
  marca: Marca;
  titulo: string;
  pie: string;
  Icono: typeof LogIn;
}[] = [
  { marca: "entrada", titulo: "Entrada", pie: "Empiezas tu jornada", Icono: LogIn },
  {
    marca: "comidaInicio",
    titulo: "Salida a comer",
    pie: "Pausa de comida",
    Icono: UtensilsCrossed,
  },
  {
    marca: "comidaFin",
    titulo: "Regreso de comer",
    pie: "Vuelves al trabajo",
    Icono: UtensilsCrossed,
  },
  { marca: "salida", titulo: "Salida", pie: "Cierras tu jornada", Icono: LogOut },
];

export function BotonHomeOffice({ estado }: { estado: EstadoHO }) {
  const [local, setLocal] = useState(estado);
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const cerrado = local.siguiente === "cerrado";

  const marcar = (marca: Marca, modalidad?: Modalidad) =>
    startTransition(async () => {
      setAviso(null);
      const r = await checarHomeOffice(marca, modalidad);
      if (!r.ok) {
        setAviso(r.error ?? "No se pudo registrar.");
        return;
      }

      // Se actualiza aquí mismo en vez de esperar a que el servidor repinte:
      // la hora aparece al instante, que es lo que confirma que quedó.
      setLocal((v) => {
        const nuevo = { ...v, modalidad: modalidad ?? v.modalidad };
        if (marca === "entrada") nuevo.entrada = r.hora ?? null;
        if (marca === "comidaInicio") nuevo.comidaInicio = r.hora ?? null;
        if (marca === "comidaFin") nuevo.comidaFin = r.hora ?? null;
        if (marca === "salida") nuevo.salida = r.hora ?? null;

        nuevo.siguiente = nuevo.salida
          ? "cerrado"
          : !nuevo.entrada
            ? "entrada"
            : nuevo.comidaInicio && !nuevo.comidaFin
              ? "comidaFin"
              : "salida";
        return nuevo;
      });
    });

  const hora = (m: Marca) =>
    m === "entrada"
      ? local.entrada
      : m === "comidaInicio"
        ? local.comidaInicio
        : m === "comidaFin"
          ? local.comidaFin
          : local.salida;

  /** El resumen del botón: la última marca, o lo que toca. */
  const resumen = cerrado
    ? `Día cerrado · ${local.entrada ?? "—"} a ${local.salida}`
    : local.entrada
      ? `Desde las ${local.entrada}`
      : "Checador";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="cv-btn"
        title="Registrar tu entrada, comida o salida"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          border: `1px solid ${cerrado ? "var(--cv-line)" : "var(--cv-green)"}`,
          background: cerrado ? "var(--cv-faint)" : "#F1FBF5",
          color: cerrado ? "var(--cv-ink-3)" : "#178A49",
          fontSize: 11.5,
          fontWeight: 600,
          padding: "7px 12px",
          borderRadius: 10,
          cursor: "pointer",
        }}
      >
        <Fingerprint size={14} />
        {resumen}
      </button>

      {abierto && (
        <CvPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Checador"
            onClick={() => setAbierto(false)}
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
              onClick={(e) => e.stopPropagation()}
              className="cv-pop"
              style={{
                width: 400,
                maxWidth: "100%",
                background: "#fff",
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 30px 80px rgba(7,23,43,.4)",
              }}
            >
              {/* ── Cabecera ─────────────────────────────────────────── */}
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--cv-line-soft)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Fingerprint size={17} style={{ color: "var(--cv-green)" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="soh-display"
                    style={{
                      display: "block",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--cv-ink)",
                    }}
                  >
                    Checador
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: "var(--cv-ink-4)",
                      marginTop: 1,
                    }}
                  >
                    {local.modalidad === "HOME_OFFICE"
                      ? "Hoy trabajas desde casa"
                      : local.modalidad === "OFICINA"
                        ? "Hoy estás en la oficina"
                        : "Registra tu jornada"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "var(--cv-ink-4)",
                    fontSize: 19,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: "16px 20px 18px" }}>
                {/*
                  Sin entrada, lo primero es DÓNDE.
                  Dos opciones grandes y con icono: es la única decisión del
                  día y conviene que no se confundan entre sí.
                */}
                {!local.entrada && !cerrado ? (
                  <>
                    <span
                      className="soh-mono"
                      style={{
                        display: "block",
                        fontSize: 9.5,
                        letterSpacing: ".11em",
                        textTransform: "uppercase",
                        color: "var(--cv-ink-4)",
                        marginBottom: 9,
                      }}
                    >
                      ¿Dónde trabajas hoy?
                    </span>
                    <div style={{ display: "flex", gap: 9 }}>
                      {(
                        [
                          ["OFICINA", "Oficina", Building2],
                          ["HOME_OFFICE", "Home office", House],
                        ] as const
                      ).map(([valor, texto, Icono]) => (
                        <button
                          key={valor}
                          type="button"
                          disabled={pendiente}
                          onClick={() => marcar("entrada", valor)}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 7,
                            padding: "16px 10px",
                            borderRadius: 14,
                            border: "1px solid var(--cv-line)",
                            background: "#fff",
                            cursor: pendiente ? "default" : "pointer",
                            fontFamily: "inherit",
                            opacity: pendiente ? 0.6 : 1,
                            transition: "border-color .12s, background .12s",
                          }}
                          onMouseEnter={(e) => {
                            if (pendiente) return;
                            e.currentTarget.style.borderColor = "var(--cv-green)";
                            e.currentTarget.style.background = "#F1FBF5";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--cv-line)";
                            e.currentTarget.style.background = "#fff";
                          }}
                        >
                          <Icono size={22} style={{ color: "#178A49" }} />
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--cv-ink)",
                            }}
                          >
                            {texto}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  /*
                    Con el día abierto, la jornada en orden.
                    Cada paso enseña su hora si ya se marcó, y solo el que
                    toca es pulsable: no hay forma de marcar la salida antes
                    de haber entrado.
                  */
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                    }}
                  >
                    {PASOS.map(({ marca, titulo, pie, Icono }) => {
                      const h = hora(marca);
                      const toca = local.siguiente === marca;
                      const hecho = Boolean(h);

                      return (
                        <button
                          key={marca}
                          type="button"
                          disabled={!toca || pendiente}
                          onClick={() => marcar(marca)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 11,
                            width: "100%",
                            padding: "11px 13px",
                            borderRadius: 13,
                            border: `1px solid ${
                              toca ? "var(--cv-green)" : "var(--cv-line-soft)"
                            }`,
                            background: toca
                              ? "#F1FBF5"
                              : hecho
                                ? "#fff"
                                : "var(--cv-faint)",
                            cursor: toca && !pendiente ? "pointer" : "default",
                            fontFamily: "inherit",
                            textAlign: "left",
                            opacity: !toca && !hecho ? 0.55 : 1,
                            transition: "border-color .12s, background .12s",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 10,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              background: hecho
                                ? "#E4F8EB"
                                : toca
                                  ? "#fff"
                                  : "var(--cv-line-soft)",
                              color: hecho
                                ? "#178A49"
                                : toca
                                  ? "#178A49"
                                  : "var(--cv-ink-4)",
                            }}
                          >
                            {hecho ? <Check size={15} strokeWidth={2.6} /> : <Icono size={15} />}
                          </span>

                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: "var(--cv-ink)",
                              }}
                            >
                              {titulo}
                            </span>
                            <span
                              style={{
                                display: "block",
                                fontSize: 10.5,
                                color: "var(--cv-ink-4)",
                                marginTop: 1,
                              }}
                            >
                              {hecho ? "Registrado" : toca ? pie : "Aún no"}
                            </span>
                          </span>

                          <span
                            className="soh-mono"
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: hecho ? "#178A49" : "var(--cv-ink-4)",
                              flexShrink: 0,
                            }}
                          >
                            {h ?? (toca ? "Marcar" : "—")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {aviso && (
                  <p
                    role="alert"
                    style={{
                      margin: "11px 0 0",
                      padding: "9px 11px",
                      borderRadius: 10,
                      background: "#FCE9EA",
                      color: "#B23A40",
                      fontSize: 11.5,
                    }}
                  >
                    {aviso}
                  </p>
                )}

                {cerrado && (
                  <p
                    style={{
                      margin: "11px 0 0",
                      fontSize: 11,
                      color: "var(--cv-ink-4)",
                      textAlign: "center",
                    }}
                  >
                    Tu jornada de hoy ya está registrada.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CvPortal>
      )}
    </>
  );
}
