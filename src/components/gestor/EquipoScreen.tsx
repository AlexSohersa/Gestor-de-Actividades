"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";

import {
  cambiarActivo,
  cambiarAdmin,
  cambiarAprobador,
  cambiarRol,
  cambiarSecciones,
} from "@/lib/gestor/equipo";
import { ROLES } from "@/lib/gestor/roles";
import { OCULTABLES } from "@/lib/sections";

/**
 * Permisos del Gestor: quién aprueba y a quién le toca cada persona.
 *
 * Esta pantalla existe porque en el script el aprobador final era una línea
 * de código (`var aprobadorFinal = 'MATEO CAÑOLA'`) y las contraseñas de
 * coordinación estaban en dos celdas. Aquí es una tabla, y solo la abre quien
 * ve cifras de empresa.
 */

export type MiembroVista = {
  /**
   * La clave con la que se identifica a la persona en las acciones.
   *
   * Se llama `email` porque en el portal lo era; aquí lleva el id de
   * core.persona, que es la identidad real. Lo que se ENSEÑA es `correo`.
   */
  email: string;
  /** El correo principal, solo para mostrar bajo el nombre. */
  correo?: string | null;
  userName: string;
  role: string;
  approverEmail: string | null;
  active: boolean;
  /** Administra la plataforma: ve Permisos y abre periodos de MVP. */
  isAdmin: boolean;
  /** Secciones que NO ve. Vacío significa que ve todo. */
  hiddenSections: string[];
  photo: string | null;
};

const TONO: Record<string, { soft: string; ink: string }> = {
  COLABORADOR: { soft: "var(--cv-faint)", ink: "var(--cv-ink-3)" },
  COORDINADOR: { soft: "#DDF7F4", ink: "#22726F" },
  APROBADOR_FINAL: { soft: "#E4F8EB", ink: "#178A49" },
};

export function EquipoScreen({
  miembros,
  yo,
}: {
  miembros: MiembroVista[];
  /** Quien está mirando: no puede quitarse a sí mismo la administración. */
  yo: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [aviso, setAviso] = useState<string | null>(null);
  /*
   * A quién se le está editando el acceso.
   *
   * Se guarda el correo y no la fila: al guardar, `router.refresh()` trae
   * datos nuevos y el modal debe mostrarlos, no la copia de cuando se abrió.
   */
  const [editandoEmail, setEditandoEmail] = useState<string | null>(null);
  const editando = useMemo(
    () => miembros.find((m) => m.email === editandoEmail) ?? null,
    [miembros, editandoEmail],
  );
  const setEditando = (m: MiembroVista | null) => setEditandoEmail(m?.email ?? null);
  const [pendiente, startTransition] = useTransition();

  const coordinadores = useMemo(
    () => miembros.filter((m) => m.role !== "COLABORADOR" && m.active),
    [miembros],
  );

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return miembros.filter((m) => {
      if (filtro !== "todos" && m.role !== filtro) return false;
      if (!q) return true;
      return `${m.userName} ${m.correo ?? ""}`.toLowerCase().includes(q);
    });
  }, [miembros, busqueda, filtro]);

  const aplicar = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setAviso(r.ok ? "Guardado ✓" : (r.error ?? "No se pudo guardar."));
    });

  const porEmail = new Map(miembros.map((m) => [m.email, m.userName]));

  return (
    <div style={{ padding: "24px 28px 40px" }}>
      {/* ------------------------------------------------------- cabecera -- */}
      <div className="cv-rise" style={{ marginBottom: 14 }}>
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
          Permisos del gestor
        </h1>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--cv-ink-3)",
            margin: "4px 0 0",
          }}
        >
          Quién aprueba ausencias y horas extra, y a quién le toca cada persona
        </p>
      </div>

      {/* ----------------------------------------------- cómo funciona -- */}
      <div
        className="cv-chrome-dots cv-rise"
        style={{
          position: "relative",
          borderRadius: 16,
          background: "linear-gradient(150deg, var(--cv-navy), var(--cv-deep))",
          padding: "15px 18px",
          overflow: "hidden",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: "rgba(57,184,180,.16)",
            border: "1px solid rgba(57,184,180,.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--cv-teal)",
          }}
        >
          <ShieldCheck size={16} />
        </span>
        <span style={{ flex: 1, minWidth: 200 }}>
          <span
            className="soh-display"
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            Quién aprueba, y a quién
          </span>
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: "var(--cv-dk-2)",
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            El coordinador revisa solo lo que le envían a su nombre, y lo que
            aprueba queda aprobado.
          </span>
        </span>
        <span style={{ display: "flex", gap: 14, flexShrink: 0 }}>
          {ROLES.slice(1).map((r) => (
            <span key={r.id}>
              <span
                className="soh-display"
                style={{
                  display: "block",
                  fontSize: 17,
                  fontWeight: 700,
                  color:
                    r.id === "COORDINADOR"
                      ? "var(--cv-teal)"
                      : "var(--cv-green)",
                  lineHeight: 1,
                }}
              >
                {miembros.filter((m) => m.role === r.id && m.active).length}
              </span>
              <span style={{ fontSize: 9.5, color: "var(--cv-dk-3)" }}>
                {r.label}
              </span>
            </span>
          ))}
        </span>
      </div>

      {/* ---------------------------------------------- buscar y filtrar -- */}
      <div
        className="cv-rise"
        style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 12 }}
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
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o correo…"
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
        {["todos", ...ROLES.map((r) => r.id)].map((f) => {
          const on = filtro === f;
          const label =
            f === "todos" ? "Todos" : ROLES.find((r) => r.id === f)!.label;
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
              {label}
            </button>
          );
        })}
      </div>

      {aviso && (
        <p
          role="status"
          style={{
            margin: "0 0 12px",
            fontSize: 11.5,
            fontWeight: 600,
            color: aviso.includes("✓") ? "#178A49" : "#B23A40",
          }}
        >
          {aviso}
        </p>
      )}

      {/* --------------------------------------------------------- tabla -- */}
      <div
        className="cv-card cv-rise"
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
          <span style={{ flex: 1, ...th }}>Persona</span>
          <span style={{ width: 190, ...th }}>Rol</span>
          <span style={{ width: 190, ...th }}>Su coordinador</span>
          <span style={{ width: 128, ...th }}>Qué ve</span>
          <span style={{ width: 74, textAlign: "right", ...th }}>Activo</span>
        </div>

        {lista.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "30px 20px",
              textAlign: "center",
              fontSize: 12.5,
              color: "var(--cv-ink-3)",
            }}
          >
            Nadie coincide con esa búsqueda.
          </p>
        ) : (
          lista.map((m, i) => {
            const tono = TONO[m.role] ?? TONO.COLABORADOR;
            return (
              <div
                key={m.email}
                className="cv-row-h"
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 16px",
                  borderTop: i > 0 ? "1px solid var(--cv-row-line)" : "none",
                  alignItems: "center",
                  opacity: m.active ? 1 : 0.5,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--cv-ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.userName}
                    {m.isAdmin && (
                      <span
                        title="Administra la plataforma"
                        style={{
                          fontSize: 8.5,
                          fontWeight: 700,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                          color: "#5D50C9",
                          background: "#EDEBFC",
                          borderRadius: 5,
                          padding: "2px 6px",
                          flexShrink: 0,
                        }}
                      >
                        Admin
                      </span>
                    )}
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
                    {m.correo ?? m.email}
                  </span>
                </span>

                <span style={{ width: 190, flexShrink: 0 }}>
                  <select
                    value={m.role}
                    disabled={pendiente}
                    onChange={(e) =>
                      aplicar(() => cambiarRol(m.email, e.target.value))
                    }
                    aria-label={`Rol de ${m.userName}`}
                    style={{
                      width: "100%",
                      border: "1px solid var(--cv-line-soft)",
                      borderRadius: 9,
                      padding: "6px 8px",
                      fontFamily: "inherit",
                      fontSize: 11,
                      fontWeight: 600,
                      color: tono.ink,
                      background: tono.soft,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </span>

                <span style={{ width: 190, flexShrink: 0 }}>
                  <select
                    value={m.approverEmail ?? ""}
                    disabled={pendiente}
                    onChange={(e) =>
                      aplicar(() => cambiarAprobador(m.email, e.target.value))
                    }
                    aria-label={`Coordinador de ${m.userName}`}
                    style={{
                      width: "100%",
                      border: "1px solid var(--cv-line-soft)",
                      borderRadius: 9,
                      padding: "6px 8px",
                      fontFamily: "inherit",
                      fontSize: 11,
                      color: m.approverEmail
                        ? "var(--cv-ink)"
                        : "var(--cv-ink-4)",
                      background: "#fff",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">Sin asignar</option>
                    {coordinadores
                      .filter((c) => c.email !== m.email)
                      .map((c) => (
                        <option key={c.email} value={c.email}>
                          {porEmail.get(c.email) ?? c.email}
                        </option>
                      ))}
                  </select>
                </span>

                <span style={{ width: 128, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setEditando(m)}
                    className="cv-btn"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      width: "100%",
                      border: `1px solid ${
                        m.hiddenSections.length > 0 ? "#F0D9A0" : "var(--cv-line-soft)"
                      }`,
                      background:
                        m.hiddenSections.length > 0 ? "#FDF3DC" : "#fff",
                      color:
                        m.hiddenSections.length > 0
                          ? "#8A6410"
                          : "var(--cv-ink-2)",
                      borderRadius: 9,
                      padding: "6px 9px",
                      fontSize: 10.5,
                      fontWeight: 700,
                    }}
                  >
                    <SlidersHorizontal size={11} />
                    {m.hiddenSections.length > 0
                      ? `${OCULTABLES.length - m.hiddenSections.length} de ${OCULTABLES.length}`
                      : "Ve todo"}
                  </button>
                </span>

                <span
                  style={{
                    width: 74,
                    flexShrink: 0,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={m.active}
                    aria-label={`${m.userName} activo`}
                    disabled={pendiente}
                    onClick={() =>
                      aplicar(() => cambiarActivo(m.email, !m.active))
                    }
                    className="cv-btn"
                    style={{
                      width: 38,
                      height: 21,
                      borderRadius: 20,
                      border: "none",
                      background: m.active
                        ? "var(--cv-green)"
                        : "var(--cv-line)",
                      position: "relative",
                      padding: 0,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: 2.5,
                        left: m.active ? 19 : 2.5,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left .18s ease",
                        boxShadow: "0 1px 3px rgba(7,23,43,.3)",
                      }}
                    />
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>

      <p
        style={{
          fontSize: 10.5,
          color: "var(--cv-ink-4)",
          margin: "12px 2px 0",
          lineHeight: 1.6,
        }}
      >
        Dar de baja a alguien no borra sus horas: deja de aparecer en las
        listas, pero su historial se conserva.
      </p>

      {editando && (
        <ModalAcceso
          m={editando}
          esYo={editando.email.toLowerCase() === yo.toLowerCase()}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

/* ==================== qué ve cada persona ============================= */

function ModalAcceso({
  m,
  esYo,
  onClose,
}: {
  m: MiembroVista;
  esYo: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  /*
   * Se marca lo VISIBLE, aunque en la base viva lo oculto: "elige lo que puede
   * ver" se entiende sin pensar, y "elige lo que NO puede ver" obliga a
   * invertir la frase cada vez.
   */
  const [visibles, setVisibles] = useState<string[]>(() =>
    OCULTABLES.filter((s) => !m.hiddenSections.includes(s.id)).map((s) => s.id),
  );
  const [admin, setAdmin] = useState(m.isAdmin);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const alterna = (id: string) =>
    setVisibles((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const guardar = () =>
    startTransition(async () => {
      const secciones = await cambiarSecciones(m.email, visibles);
      if (!secciones.ok) {
        setError(secciones.error ?? "No se pudo guardar.");
        return;
      }
      if (admin !== m.isAdmin) {
        const r = await cambiarAdmin(m.email, admin);
        if (!r.ok) {
          setError(r.error ?? "No se pudo cambiar la administración.");
          router.refresh();
          return;
        }
      }
      router.refresh();
      onClose();
    });

  const grupos = [
    { titulo: "Principales", de: OCULTABLES.filter((s) => !s.group) },
    { titulo: "Tu trabajo", de: OCULTABLES.filter((s) => s.group === "Tu trabajo") },
    { titulo: "La empresa", de: OCULTABLES.filter((s) => s.group === "La empresa") },
  ].filter((g) => g.de.length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Qué ve ${m.userName}`}
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
        onClick={(e) => e.stopPropagation()}
        className="cv-pop"
        style={{
          width: 520,
          maxWidth: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(7,23,43,.4)",
        }}
      >
        {/* ------------------------------------------------------ cabecera -- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "16px 20px",
            borderBottom: "1px solid var(--cv-line-soft)",
            flexShrink: 0,
          }}
        >
          <Avatar nombre={m.userName} foto={m.photo} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              className="soh-display"
              style={{
                display: "block",
                fontSize: 15,
                fontWeight: 700,
                color: "var(--cv-ink)",
                letterSpacing: "-.02em",
              }}
            >
              {m.userName}
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
              {m.email}
            </span>
          </span>
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
              flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 18px" }}>
          {/* ------------------------------------------------ administrar -- */}
          <button
            type="button"
            role="switch"
            aria-checked={admin}
            onClick={() => setAdmin((a) => !a)}
            disabled={pendiente || esYo}
            className="cv-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              textAlign: "left",
              border: `1px solid ${admin ? "#CFC9F5" : "var(--cv-line-soft)"}`,
              background: admin ? "#EDEBFC" : "#fff",
              borderRadius: 13,
              padding: "12px 14px",
              marginBottom: 18,
              cursor: esYo ? "not-allowed" : "pointer",
              opacity: esYo ? 0.6 : 1,
            }}
          >
            <ShieldCheck
              size={17}
              style={{ color: admin ? "#5D50C9" : "var(--cv-ink-4)", flexShrink: 0 }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--cv-ink)",
                }}
              >
                Administra la plataforma
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 10.5,
                  color: "var(--cv-ink-4)",
                  marginTop: 2,
                  lineHeight: 1.5,
                }}
              >
                {esYo
                  ? "Eres tú: no puedes quitarte la administración a ti mismo."
                  : "Ve esta pantalla, reparte permisos y abre o cierra periodos de MVP."}
              </span>
            </span>
            <Interruptor on={admin} />
          </button>

          {/* -------------------------------------------------- secciones -- */}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span
              className="soh-display"
              style={{ fontSize: 12.5, fontWeight: 700, color: "var(--cv-ink)" }}
            >
              Secciones que puede ver
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setVisibles(OCULTABLES.map((s) => s.id))}
                className="cv-btn"
                style={enlace}
              >
                Todas
              </button>
              <span aria-hidden="true" style={{ color: "var(--cv-line)" }}>
                ·
              </span>
              <button
                type="button"
                onClick={() => setVisibles([])}
                className="cv-btn"
                style={enlace}
              >
                Ninguna
              </button>
            </span>
          </span>
          <p
            style={{
              fontSize: 10.5,
              color: "var(--cv-ink-4)",
              margin: "0 0 13px",
              lineHeight: 1.55,
            }}
          >
            Lo que desmarques desaparece de su menú y tampoco puede abrirlo
            escribiendo la dirección. Inicio no se puede quitar.
          </p>

          {admin && (
            <p
              style={{
                fontSize: 10.5,
                color: "#8A6410",
                background: "#FDF3DC",
                border: "1px solid #F0D9A0",
                borderRadius: 10,
                padding: "8px 11px",
                margin: "0 0 13px",
                lineHeight: 1.5,
              }}
            >
              Quien administra ve todas las secciones. Esta selección se guarda,
              pero no le aplica mientras sea administrador.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {grupos.map((g) => (
              <div key={g.titulo}>
                <span
                  className="soh-mono"
                  style={{
                    display: "block",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--cv-ink-4)",
                    marginBottom: 7,
                  }}
                >
                  {g.titulo}
                </span>
                <div style={{ display: "grid", gap: 6 }}>
                  {g.de.map((s) => {
                    const on = visibles.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => alterna(s.id)}
                        disabled={pendiente}
                        className="cv-btn"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          textAlign: "left",
                          border: `1px solid ${on ? "#BCE9CD" : "var(--cv-line-soft)"}`,
                          background: on ? "#F0FBF4" : "#fff",
                          borderRadius: 11,
                          padding: "9px 12px",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 17,
                            height: 17,
                            borderRadius: 6,
                            border: `1.5px solid ${on ? "var(--cv-green-ink)" : "var(--cv-line)"}`,
                            background: on ? "var(--cv-green-ink)" : "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {on && <Check size={11} strokeWidth={3.4} color="#fff" />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              display: "block",
                              fontSize: 12,
                              fontWeight: 700,
                              color: on ? "var(--cv-ink)" : "var(--cv-ink-3)",
                            }}
                          >
                            {s.label}
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontSize: 10,
                              color: "var(--cv-ink-4)",
                              marginTop: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p
              role="alert"
              style={{
                margin: "14px 0 0",
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

        {/* ----------------------------------------------------------- pie -- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "13px 20px",
            borderTop: "1px solid var(--cv-line-soft)",
            background: "var(--cv-hover)",
            flexShrink: 0,
          }}
        >
          <span style={{ flex: 1, fontSize: 11, color: "var(--cv-ink-4)" }}>
            {visibles.length === OCULTABLES.length
              ? "Ve todas las secciones"
              : `Ve ${visibles.length} de ${OCULTABLES.length} secciones`}
          </span>
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
            type="button"
            onClick={guardar}
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
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Foto de Google, o las iniciales sobre el color de marca. */
function Avatar({ nombre, foto }: { nombre: string; foto: string | null }) {
  const base: React.CSSProperties = {
    width: 38,
    height: 38,
    borderRadius: "50%",
    flexShrink: 0,
  };
  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={foto}
        alt=""
        referrerPolicy="no-referrer"
        style={{ ...base, objectFit: "cover" }}
      />
    );
  }
  const ini = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        ...base,
        background: "var(--cv-teal)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {ini}
    </span>
  );
}

function Interruptor({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 36,
        height: 20,
        borderRadius: 20,
        background: on ? "#7669E8" : "var(--cv-line)",
        position: "relative",
        flexShrink: 0,
        transition: "background .2s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(7,23,43,.25)",
          transition: "left .2s",
        }}
      />
    </span>
  );
}

const th = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  color: "var(--cv-ink-4)",
  textTransform: "uppercase",
} as const;

const enlace: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  fontSize: 10.5,
  fontWeight: 700,
  color: "#178A49",
};
