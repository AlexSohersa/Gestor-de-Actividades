"use client";

import type { FilaSemanal, ReporteSemanal } from "@/lib/proyectos/semanal";

/**
 * Reporte semanal — en qué se trabajó y a cuál se le acaban las horas.
 *
 * Es la vista del lunes por la mañana: una fila por proyecto tocado, ordenada
 * por urgencia y no por tamaño, para decidir en un minuto dónde hay que meter
 * mano. Sin gráficas de serie ni donas: no es para explorar, es para decidir.
 *
 * El mismo contenido va por correo los lunes, generado de la misma función,
 * para que lo que se lee aquí y lo que llega al buzón no puedan discrepar.
 */

const VERDE = "#178A49";
const AMBAR = "#B07C10";
const ROJO = "#B23A40";
const NAVY = "#102039";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });

/** El color y la palabra de cada luz del semáforo. */
const LUZ: Record<FilaSemanal["luz"], { ink: string; soft: string; texto: string }> = {
  rojo: { ink: ROJO, soft: "#FBEAEB", texto: "Sin horas" },
  ambar: { ink: AMBAR, soft: "#FDF3DC", texto: "Ajustado" },
  verde: { ink: VERDE, soft: "#E4F8EB", texto: "Holgado" },
  gris: { ink: "var(--cv-ink-4)", soft: "var(--cv-faint)", texto: "Sin cotizar" },
};

/** "10 de septiembre" — la ventana del reporte, en la cabecera. */
const dia = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T12:00:00.000Z`));

export function SemanalScreen({ d }: { d: ReporteSemanal }) {
  if (d.filas.length === 0) {
    return (
      <div
        className="cv-card cv-rise"
        style={{ borderRadius: 18, padding: "48px 26px", textAlign: "center" }}
      >
        <span
          className="soh-display"
          style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--cv-ink)" }}
        >
          Nadie reportó horas esta semana
        </span>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--cv-ink-3)",
            margin: "7px auto 0",
            maxWidth: 420,
            lineHeight: 1.6,
          }}
        >
          Del {dia(d.desde)} al {dia(d.hasta)} no hay horas registradas en
          ningún proyecto.
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h1
          className="soh-display"
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-.028em",
            color: "var(--cv-ink)",
            margin: 0,
          }}
        >
          Reporte semanal
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--cv-ink-3)", margin: "4px 0 0" }}>
          En qué se trabajó y a cuál se le están acabando las horas
        </p>
      </div>

      {/* ------------------------------------------------------- cifras -- */}
      <div
        className="cv-rise"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Cifra rotulo="Proyectos activos" valor={String(d.filas.length)} tono={NAVY} />
        <Cifra rotulo="Horas reportadas" valor={fmt(d.horasSemana)} tono={NAVY} />
        <Cifra rotulo="Personas" valor={String(d.personas)} tono={NAVY} />
        <Cifra
          rotulo="Sin horas disponibles"
          valor={String(d.enRojo)}
          tono={d.enRojo > 0 ? ROJO : VERDE}
        />
      </div>

      {/* -------------------------------------------------- el reporte -- */}
      <div className="cv-card cv-rise" style={{ borderRadius: 18, padding: "16px 18px" }}>
        <span
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            className="soh-display"
            style={{ fontSize: 13, fontWeight: 700, color: "var(--cv-ink)" }}
          >
            Lo que se movió esta semana
          </span>
          <span style={{ fontSize: 10.5, color: "var(--cv-ink-4)" }}>
            Del {dia(d.desde)} al {dia(d.hasta)} · lo más apretado primero
          </span>
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {d.filas.map((f) => (
            <Fila key={f.proyecto} f={f} />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Un proyecto: cuánto se le metió, cuánto lleva y cuánto queda.
 *
 * Dos alturas por proyecto, como en la comparativa: con veinte filas, cuatro
 * renglones cada una obligaría a bajar media pantalla para ver el último.
 */
function Fila({ f }: { f: FilaSemanal }) {
  const luz = LUZ[f.luz];
  const pasado = f.disponibles !== null && f.disponibles < 0;

  // Al rebasar, la escala la marca lo consumido: si no, la parte roja se
  // saldría del marco sin decir cuánto.
  const escala = Math.max(f.cotizadas, f.registradas, 1);
  const anchoCot = (f.cotizadas / escala) * 100;
  const anchoReg = (f.registradas / escala) * 100;

  return (
    <div>
      <span
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            minWidth: 0,
            flex: 1,
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--cv-ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {f.proyecto}
        </span>

        {/* Lo reportado en la semana: es la razón por la que sale en la lista. */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--cv-ink-2)",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          +{fmt(f.semana)} h
        </span>

        {/* Y el acumulado contra el presupuesto, en pequeño. */}
        <span
          style={{
            fontSize: 10,
            color: "var(--cv-ink-4)",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {f.cotizadas > 0
            ? `${fmt(f.registradas)} / ${fmt(f.cotizadas)} h`
            : `${fmt(f.registradas)} h`}
        </span>

        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: luz.ink,
            flexShrink: 0,
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {f.uso === null ? "—" : `${f.uso}%`}
        </span>

        {/*
          El semáforo dice las horas que QUEDAN, no repite el porcentaje.

          Es el dato con el que se decide si alcanza para la semana que
          empieza: "85%" obliga a hacer la resta, "quedan 15 h" no.
        */}
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: luz.ink,
            background: luz.soft,
            borderRadius: 999,
            padding: "2px 8px",
            flexShrink: 0,
            minWidth: 86,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {f.disponibles === null
            ? luz.texto
            : pasado
              ? `${fmt(-f.disponibles)} h de más`
              : `quedan ${fmt(f.disponibles)} h`}
        </span>
      </span>

      <span
        aria-hidden="true"
        style={{
          display: "block",
          position: "relative",
          height: 9,
          borderRadius: 5,
          background: "var(--cv-faint)",
          overflow: "hidden",
        }}
      >
        {f.cotizadas > 0 && (
          <>
            <span
              style={{
                position: "absolute",
                inset: 0,
                width: `${anchoCot}%`,
                background: "#DCE6EE",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${anchoReg}%`,
                background: pasado
                  ? `linear-gradient(90deg, ${NAVY} 0%, ${NAVY} ${(anchoCot / anchoReg) * 100}%, ${ROJO} ${(anchoCot / anchoReg) * 100}%)`
                  : NAVY,
                borderRadius: 5,
              }}
            />
          </>
        )}
      </span>
    </div>
  );
}

function Cifra({
  rotulo,
  valor,
  tono,
}: {
  rotulo: string;
  valor: string;
  tono: string;
}) {
  return (
    <div className="cv-card" style={{ borderRadius: 14, padding: "10px 14px" }}>
      <span
        className="soh-mono"
        style={{
          display: "block",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--cv-ink-4)",
        }}
      >
        {rotulo}
      </span>
      <span
        className="soh-display"
        style={{
          display: "block",
          fontSize: 23,
          fontWeight: 700,
          letterSpacing: "-.03em",
          color: tono,
          marginTop: 2,
        }}
      >
        {valor}
      </span>
    </div>
  );
}
