"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layers, TrendingUp } from "lucide-react";
import type { Dashboard } from "@/lib/gestor/dashboard";

/**
 * Tablero de horas.
 *
 * Tres preguntas, en este orden: cuánto llevo, en qué se fue, y cómo va cada
 * proyecto contra lo que se cotizó. Esa última es la que decide cosas — un
 * proyecto al 120% de lo vendido es una conversación pendiente.
 *
 * Todo sale de la base del portal: la historia importada del Gestor más lo
 * que se reporta aquí.
 */
/** Cómo se lee cada periodo en la tarjeta grande. */
/** El periodo en una frase corta, para los estados vacíos. */
const ETIQUETA_CORTA: Record<string, string> = {
  quincena: "esta quincena",
  mes: "este mes",
  anio: "este año",
};

const ETIQUETA_PERIODO: Record<string, string> = {
  quincena: "tus horas esta quincena",
  mes: "tus horas este mes",
  anio: "tus horas de este año",
};

export function DashboardHoras({ d }: { d: Dashboard }) {
  const router = useRouter();
  const params = useSearchParams();
  const [orden, setOrden] = useState<"horas" | "avance">("horas");

  /*
   * Los filtros viven en la URL.
   *
   * Así el tablero se puede compartir o recargar sin perder lo que se estaba
   * mirando, y el servidor recalcula con los datos ya filtrados en vez de
   * mandarlo todo al navegador.
   */
  const cambiar = (cambios: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    router.push(`/actividad?${q}`);
  };

  const irAPeriodo = (v: string) =>
    // Elegir un periodo fijo descarta el rango a medida: son dos formas de
    // decir lo mismo y tenerlas a la vez confunde.
    cambiar({
      periodo: v === "anio" ? null : v,
      desde: null,
      hasta: null,
    });

  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";
  const conRango = Boolean(desde || hasta);
  const proyectoFiltro = params.get("proyecto") ?? "";
  const tipoFiltro = params.get("tipo") ?? "";

  const proyectos = useMemo(() => {
    const lista = [...d.porProyecto];
    if (orden === "avance") {
      // Los que más se pasaron primero; los que no tienen cotización, al final:
      // sin referencia no hay nada que juzgar.
      lista.sort((a, b) => (b.avance ?? -1) - (a.avance ?? -1));
    }
    return lista;
  }, [d.porProyecto, orden]);

  const maxProyecto = Math.max(...d.porProyecto.map((p) => p.horas), 1);
  const maxMes = Math.max(...d.porMes.map((m) => m.horas), 1);
  const totalTipos = d.porTipo.reduce((n, t) => n + t.horas, 0) || 1;

  const fmt = (n: number) =>
    n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : n % 1 === 0
        ? String(n)
        : n.toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ------------------------------------------------------ periodo -- */}
      <div
        className="cv-rise"
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{ fontSize: 11.5, color: "var(--cv-ink-3)", marginRight: 2 }}
        >
          Consultar
        </span>
        {(
          [
            ["quincena", "Esta quincena"],
            ["mes", "Este mes"],
            ["anio", "Este año"],
          ] as const
        ).map(([v, txt]) => {
          const on = d.periodo === v && !conRango;
          return (
            <button
              key={v}
              type="button"
              onClick={() => irAPeriodo(v)}
              aria-pressed={on}
              className="cv-btn"
              style={{
                border: `1px solid ${on ? "var(--cv-navy)" : "var(--cv-line)"}`,
                background: on ? "var(--cv-navy)" : "#fff",
                color: on ? "#fff" : "var(--cv-ink-2)",
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 9,
              }}
            >
              {txt}
            </button>
          );
        })}

        {/*
          Un rango a medida, para lo que los tres botones no cubren.
          Van juntos y en pequeño: son la excepción, no lo que se usa a diario.
        */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginLeft: 4,
            padding: "3px 8px",
            borderRadius: 9,
            border: `1px solid ${conRango ? "var(--cv-navy)" : "var(--cv-line)"}`,
            background: conRango ? "var(--cv-faint)" : "#fff",
          }}
        >
          <input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => cambiar({ desde: e.target.value })}
            aria-label="Desde"
            style={campoFecha}
          />
          <span style={{ fontSize: 10, color: "var(--cv-ink-4)" }}>a</span>
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => cambiar({ hasta: e.target.value })}
            aria-label="Hasta"
            style={campoFecha}
          />
          {conRango && (
            <button
              type="button"
              onClick={() => cambiar({ desde: null, hasta: null })}
              aria-label="Quitar el rango"
              title="Quitar el rango"
              style={{
                border: "none",
                background: "none",
                padding: 0,
                marginLeft: 1,
                cursor: "pointer",
                color: "var(--cv-ink-4)",
                fontSize: 13,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </span>
      </div>

      {/*
        Lo que se está filtrando, con su aspa para quitarlo.

        Solo aparece cuando hay algo activo: si no, sería una barra vacía
        ocupando sitio. Los filtros se ponen picando en las gráficas.
      */}
      {(proyectoFiltro || tipoFiltro) && (
        <div
          className="cv-rise"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 10.5, color: "var(--cv-ink-4)" }}>
            Filtrando por
          </span>
          {(
            [
              ["proyecto", proyectoFiltro],
              ["tipo", tipoFiltro],
            ] as const
          )
            .filter(([, v]) => v)
            .map(([clave, v]) => (
              <button
                key={clave}
                type="button"
                onClick={() => cambiar({ [clave]: null })}
                title={`Quitar el filtro de ${clave}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid var(--cv-navy)",
                  background: "var(--cv-navy)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 9px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {v}
                <span style={{ opacity: 0.7, fontSize: 12 }}>×</span>
              </button>
            ))}
        </div>
      )}

      {/* Un periodo con casi nada no está roto: solo hay poco reportado. */}
      {d.porProyecto.length === 0 && (
        <div
          className="cv-card cv-rise"
          style={{
            borderRadius: 16,
            padding: "26px 22px",
            textAlign: "center",
          }}
        >
          <span
            className="soh-display"
            style={{
              display: "block",
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--cv-ink)",
            }}
          >
            Sin horas reportadas en {ETIQUETA_CORTA[d.periodo]}
          </span>
          <p
            style={{
              fontSize: 12,
              color: "var(--cv-ink-3)",
              margin: "5px 0 0",
            }}
          >
            Prueba con un periodo más largo para ver tu historia completa.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------- cifras -- */}
      <div className="cv-kpi-grid cv-rise">
        <Kpi
          valor={fmt(d.horasPeriodo)}
          unidad="h"
          label={ETIQUETA_PERIODO[d.periodo]}
          color="var(--cv-green)"
          fondo="linear-gradient(150deg, var(--cv-navy), var(--cv-deep))"
          claro
        />
        {/*
          Fuera "este mes" y "promedio por día reportado".

          El primero repetía lo que ya dice la tarjeta oscura cuando el filtro
          está en mes; el segundo no se entendía —¿promedio sobre los días
          trabajados o sobre los del periodo?— y nadie lo usaba para decidir
          nada.
        */}
        <Kpi
          valor={String(d.misProyectos)}
          label={d.misProyectos === 1 ? "proyecto tuyo" : "proyectos tuyos"}
          color="#5D50C9"
        />

        {/*
          La empresa sube aquí, junto a las tuyas.

          Estaba abajo del todo, en una tarjeta aparte que había que ir a
          buscar. Al quedar sitio libre, se pone al mismo nivel: es una cifra
          de contexto y se lee mejor al lado de las propias.
        */}
        {d.verEmpresa && (
          <Kpi
            valor={fmt(d.totalEmpresa)}
            unidad="h"
            label={`la empresa · ${d.proyectosActivos} proyectos · ${d.personasActivas} personas`}
            color="var(--cv-green)"
            // El azul oscuro que tenía en su tarjeta grande: distingue de un
            // vistazo la cifra de la empresa de las tres que son tuyas.
            fondo="linear-gradient(150deg, var(--cv-navy), var(--cv-deep))"
            claro
          />
        )}
      </div>

      <div className="cv-dash-grid">
        {/* --------------------------------------------- por proyecto -- */}
        <div
          className="cv-card cv-rise"
          style={{ borderRadius: 18, overflow: "hidden" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "15px 18px",
              borderBottom: "1px solid var(--cv-line-soft)",
              flexWrap: "wrap",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(140deg, #DDF7F4, #EFFBFA)",
                boxShadow: "inset 0 0 0 1px rgba(57,184,180,.3)",
                color: "#22726F",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers size={14} strokeWidth={2.2} />
            </span>
            <span style={{ flex: 1, minWidth: 160 }}>
              <span
                className="soh-display"
                style={{
                  display: "block",
                  fontSize: 14.5,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--cv-ink)",
                }}
              >
                Horas por proyecto
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 10.5,
                  color: "var(--cv-ink-3)",
                }}
              >
                Solo tus horas · comparadas con lo cotizado del proyecto
              </span>
            </span>

            <span style={{ display: "flex", gap: 5, flexShrink: 0 }}>
              {(
                [
                  ["horas", "Más horas"],
                  ["avance", "Más consumido"],
                ] as const
              ).map(([k, txt]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOrden(k)}
                  className="cv-btn"
                  style={{
                    border: `1px solid ${orden === k ? "var(--cv-navy)" : "var(--cv-line)"}`,
                    background: orden === k ? "var(--cv-navy)" : "#fff",
                    color: orden === k ? "#fff" : "var(--cv-ink-3)",
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 8,
                  }}
                >
                  {txt}
                </button>
              ))}
            </span>
          </div>

          {proyectos.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "30px 20px",
                textAlign: "center",
                fontSize: 12.5,
                color: "var(--cv-ink-3)",
              }}
            >
              Aún no hay horas reportadas.
            </p>
          ) : (
            <div style={{ padding: "6px 0" }}>
              {proyectos.map((p, i) => {
                // El color dice si el proyecto se está pasando de lo vendido.
                const pct = p.avance ?? 0;
                const tono =
                  p.avance === null
                    ? { barra: "var(--cv-faint)", ink: "var(--cv-ink-4)" }
                    : pct > 1
                      ? { barra: "#E95E64", ink: "#B23A40" }
                      : pct > 0.85
                        ? { barra: "#F5B843", ink: "#B07C10" }
                        : { barra: "var(--cv-green)", ink: "#178A49" };

                const activo = proyectoFiltro === p.proyecto;

                return (
                  <div
                    key={p.proyecto}
                    className="cv-row-h"
                    role="button"
                    tabIndex={0}
                    // Picar un proyecto filtra por él; volver a picarlo lo
                    // quita. Es lo que se quiere hacer al ver una barra que
                    // llama la atención.
                    onClick={() =>
                      cambiar({ proyecto: activo ? null : p.proyecto })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        cambiar({ proyecto: activo ? null : p.proyecto });
                      }
                    }}
                    title={activo ? "Quitar el filtro" : `Ver solo ${p.proyecto}`}
                    style={{
                      padding: "10px 18px",
                      borderTop:
                        i > 0 ? "1px solid var(--cv-row-line)" : "none",
                      cursor: "pointer",
                      background: activo ? "var(--cv-faint)" : undefined,
                      boxShadow: activo
                        ? "inset 2px 0 0 var(--cv-navy)"
                        : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 10,
                        marginBottom: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 120,
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "var(--cv-ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.proyecto}
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
                        {fmt(p.horas)} h
                      </span>
                      {p.cotizadas !== null ? (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: tono.ink,
                            flexShrink: 0,
                            minWidth: 78,
                            textAlign: "right",
                          }}
                        >
                          {Math.round(pct * 100)}% de {fmt(p.cotizadas)}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--cv-ink-4)",
                            flexShrink: 0,
                            minWidth: 78,
                            textAlign: "right",
                          }}
                        >
                          sin cotizar
                        </span>
                      )}
                    </div>

                    {/* Dos barras superpuestas: la clara es lo cotizado, la
                        de color lo consumido. Se lee de un vistazo. */}
                    <div
                      style={{
                        position: "relative",
                        height: 7,
                        borderRadius: 4,
                        background: "var(--cv-line-soft)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: "0 auto 0 0",
                          width: `${Math.min(100, (p.horas / maxProyecto) * 100)}%`,
                          background: tono.barra,
                          borderRadius: 4,
                          transition: "width .5s cubic-bezier(.22,1,.36,1)",
                        }}
                      />
                      {/* La marca del 100% de lo cotizado. */}
                      {p.avance !== null && p.avance < 1 && (
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: `${Math.min(100, (p.cotizadas! / maxProyecto) * 100)}%`,
                            width: 2,
                            background: "var(--cv-ink-4)",
                            opacity: 0.5,
                          }}
                        />
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        marginTop: 4,
                        fontSize: 10,
                        color: "var(--cv-ink-4)",
                      }}
                    >
                      {d.verEmpresa && (
                        <span>
                          {p.personas}{" "}
                          {p.personas === 1 ? "persona" : "personas"}
                        </span>
                      )}
                      {p.ultima && (
                        <span>
                          {/* En UTC: es un día de calendario, y leerlo en la
                              zona del navegador mostraría el anterior. */}
                          últ.{" "}
                          {new Intl.DateTimeFormat("es-MX", {
                            timeZone: "UTC",
                            day: "numeric",
                            month: "short",
                          }).format(new Date(p.ultima))}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------------------------------------- lateral: tipo y mes -- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* En qué se fue el tiempo */}
          <div
            className="cv-card cv-rise"
            style={{
              borderRadius: 18,
              padding: "15px 18px",
              animationDelay: ".05s",
            }}
          >
            <span
              className="soh-display"
              style={{
                display: "block",
                fontSize: 13.5,
                fontWeight: 700,
                color: "var(--cv-ink)",
                marginBottom: 2,
              }}
            >
              En qué se fue tu tiempo
            </span>
            <span
              style={{
                display: "block",
                fontSize: 10.5,
                color: "var(--cv-ink-3)",
                marginBottom: 12,
              }}
            >
              Por tipo de actividad
            </span>

            {d.porTipo.length === 0 ? (
              <p
                style={{ fontSize: 11.5, color: "var(--cv-ink-4)", margin: 0 }}
              >
                Sin datos todavía.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {d.porTipo.map((t, i) => {
                  const pct = (t.horas / totalTipos) * 100;
                  const c = TONOS[i % TONOS.length];
                  const activoT = tipoFiltro === t.tipo;
                  return (
                    <div
                      key={t.tipo}
                      role="button"
                      tabIndex={0}
                      onClick={() => cambiar({ tipo: activoT ? null : t.tipo })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          cambiar({ tipo: activoT ? null : t.tipo });
                        }
                      }}
                      title={activoT ? "Quitar el filtro" : `Ver solo ${t.tipo}`}
                      style={{
                        cursor: "pointer",
                        borderRadius: 8,
                        padding: activoT ? "4px 6px" : undefined,
                        margin: activoT ? "-4px -6px" : undefined,
                        background: activoT ? "var(--cv-faint)" : undefined,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 8,
                          marginBottom: 3,
                        }}
                      >
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 11.5,
                            color: "var(--cv-ink-2)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.tipo}
                        </span>
                        <span
                          className="soh-mono"
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: "var(--cv-ink)",
                            flexShrink: 0,
                          }}
                        >
                          {fmt(t.horas)} h
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            color: "var(--cv-ink-4)",
                            flexShrink: 0,
                            width: 28,
                            textAlign: "right",
                          }}
                        >
                          {Math.round(pct)}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: 5,
                          borderRadius: 3,
                          background: "var(--cv-line-soft)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: c,
                            borderRadius: 3,
                            transition: "width .5s cubic-bezier(.22,1,.36,1)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tendencia por mes */}
          <div
            className="cv-card cv-rise"
            style={{
              borderRadius: 18,
              padding: "15px 18px",
              animationDelay: ".1s",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 12,
              }}
            >
              <TrendingUp size={14} style={{ color: "#22726F" }} />
              <span
                className="soh-display"
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "var(--cv-ink)",
                }}
              >
                Tus últimos meses
              </span>
            </div>

            {d.porMes.length === 0 ? (
              <p
                style={{ fontSize: 11.5, color: "var(--cv-ink-4)", margin: 0 }}
              >
                Sin datos todavía.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 5,
                  height: 92,
                }}
              >
                {d.porMes.map((m, i) => {
                  const alto = Math.max(4, (m.horas / maxMes) * 100);
                  const ultimo = i === d.porMes.length - 1;
                  return (
                    <div
                      key={m.mes}
                      title={`${m.etiqueta}: ${fmt(m.horas)} h`}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 4,
                        minWidth: 0,
                        /*
                         * La columna necesita ALTURA propia.
                         *
                         * Sin ella, el `height: %` de la barra no tiene contra
                         * qué medirse y se queda en cero: la gráfica salía
                         * vacía aunque hubiera horas de sobra.
                         */
                        height: "100%",
                      }}
                    >
                      <span
                        style={{
                          width: "100%",
                          // Se reserva sitio para el rótulo del mes: si la
                          // barra ocupa el 100%, el nombre se sale de la caja.
                          height: `${alto * 0.82}%`,
                          borderRadius: "5px 5px 2px 2px",
                          background: ultimo
                            ? "linear-gradient(180deg, var(--cv-green), var(--cv-teal))"
                            : "var(--cv-line)",
                          transition: "height .6s cubic-bezier(.22,1,.36,1)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 8.5,
                          color: ultimo ? "var(--cv-ink-2)" : "var(--cv-ink-4)",
                          fontWeight: ultimo ? 700 : 500,
                          textTransform: "capitalize",
                        }}
                      >
                        {m.etiqueta}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

/** Los dos campos del rango: discretos, sin marco propio. */
const campoFecha: React.CSSProperties = {
  border: "none",
  background: "transparent",
  fontFamily: "inherit",
  fontSize: 10.5,
  color: "var(--cv-ink-2)",
  padding: "3px 0",
  outline: "none",
  width: 104,
};

const TONOS = [
  "#32D66B",
  "#39B8B4",
  "#7669E8",
  "#F5B843",
  "#3E7FA6",
  "#E95E64",
];

function Kpi({
  valor,
  unidad,
  label,
  color,
  fondo,
  claro = false,
}: {
  valor: string;
  unidad?: string;
  label: string;
  color: string;
  fondo?: string;
  claro?: boolean;
}) {
  return (
    <div
      className={claro ? "cv-chrome-dots" : "cv-card"}
      style={{
        borderRadius: 18,
        padding: "16px 18px",
        background: fondo,
        border: fondo ? "none" : undefined,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          className="soh-display"
          style={{
            fontSize: 27,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color,
            lineHeight: 1,
          }}
        >
          {valor}
        </span>
        {unidad && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: claro ? "var(--cv-dk-3)" : "var(--cv-ink-4)",
            }}
          >
            {unidad}
          </span>
        )}
      </div>
      <span
        style={{
          display: "block",
          fontSize: 10.5,
          color: claro ? "var(--cv-dk-2)" : "var(--cv-ink-3)",
          marginTop: 5,
          lineHeight: 1.35,
        }}
      >
        {label}
      </span>
    </div>
  );
}

