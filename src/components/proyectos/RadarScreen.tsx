"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import type {
  ProyectoEnLista,
  RadarProyecto,
} from "@/lib/proyectos/radar";

/**
 * Reunión de radar — el estatus de un proyecto por sus horas.
 *
 * Mismas cifras que el tablero de Looker Studio, con las mismas fuentes: lo
 * cotizado sale de `BDD ENTREGABLES v02` y lo registrado de `BDD ACTIVIDAD
 * V02`. Lo que allá eran filtros de Looker, aquí es un selector de proyecto.
 *
 * La dispersión de Looker se cambió por barras: un punto en un plano no dice
 * de un vistazo qué entregable se está comiendo las horas, y esa es la
 * pregunta de la reunión.
 */

const VERDE = "#178A49";
const AMBAR = "#B07C10";
const ROJO = "#B23A40";
const NAVY = "#102039";

/** Los colores del reparto de esfuerzos, en el orden del manual. */
const TONOS = ["#102039", "#32D66B", "#F5B843", "#E95E64", "#39B8B4", "#7669E8"];

const fmt = (n: number) =>
  Math.round(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });

/**
 * "14 ago" — el día tal como se guardó.
 *
 * `timeZone: "UTC"` porque las fechas son días de calendario guardados a
 * medianoche UTC: sin fijarla, el navegador muestra el día anterior.
 */
const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  })
    .format(new Date(iso))
    .replace(".", "");

/** "jueves, 14 de agosto" — para las etiquetas emergentes. */
const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));

/** Los periodos del selector, en meses hacia atrás. Vacío es todo. */
const PERIODOS = [
  { id: "", label: "Todo" },
  { id: "3", label: "3 meses" },
  { id: "6", label: "6 meses" },
  { id: "12", label: "1 año" },
] as const;

/** Verde mientras sobre holgura, ámbar cerca del límite, rojo al pasarse. */
function tonoUso(uso: number | null): string {
  if (uso === null) return "var(--cv-ink-3)";
  if (uso > 100) return ROJO;
  if (uso >= 85) return AMBAR;
  return VERDE;
}

export function RadarScreen({
  proyectos,
  inicial,
  periodo,
}: {
  proyectos: ProyectoEnLista[];
  inicial: RadarProyecto | null;
  /** El periodo activo, tal como viene de la dirección. */
  periodo: string;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? proyectos.filter((p) => p.nombre.toLowerCase().includes(q)) : proyectos;
  }, [proyectos, busqueda]);

  const d = inicial;

  /** Conserva el proyecto al cambiar de periodo, y al revés. */
  const enlace = (p: string, per: string) => {
    const q = new URLSearchParams();
    if (p) q.set("p", p);
    if (per) q.set("periodo", per);
    return `/proyectos${q.toString() ? `?${q}` : ""}`;
  };

  return (
    <div style={{ padding: "22px 28px 40px" }}>
      {/* ------------------------------------------------------ cabecera --
          Sin `cv-rise`: esa animación crea un contexto de apilamiento propio,
          y el desplegable del buscador quedaba encerrado dentro —por debajo de
          las tarjetas de cifras— por mucho z-index que llevara. */}
      <div
        style={{
          position: "relative",
          zIndex: 30,
          display: "flex",
          alignItems: "flex-end",
          gap: 14,
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
              letterSpacing: "-.028em",
              color: "var(--cv-ink)",
              margin: 0,
            }}
          >
            Reunión de radar
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--cv-ink-3)", margin: "4px 0 0" }}>
            Consulta de estatus por proyecto
          </p>
        </div>

        {/* selector de proyecto */}
        <div style={{ position: "relative", width: 320, maxWidth: "100%" }}>
          <label
            className="cv-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              borderRadius: 11,
              padding: "0 12px",
              height: 38,
              cursor: "text",
            }}
          >
            <Search size={14} style={{ color: "var(--cv-ink-4)", flexShrink: 0 }} />
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setAbierto(true);
              }}
              onFocus={() => setAbierto(true)}
              onBlur={() => setTimeout(() => setAbierto(false), 160)}
              placeholder={d?.proyecto ?? "Selecciona un proyecto…"}
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "inherit",
                fontSize: 12.5,
                fontWeight: d ? 700 : 400,
                color: "var(--cv-ink)",
              }}
            />
          </label>

          {abierto && lista.length > 0 && (
            <div
              className="cv-card"
              style={{
                position: "absolute",
                top: 42,
                left: 0,
                right: 0,
                zIndex: 20,
                maxHeight: 320,
                overflowY: "auto",
                borderRadius: 12,
                padding: 5,
                boxShadow: "0 18px 40px rgba(7,23,43,.18)",
              }}
            >
              {lista.slice(0, 40).map((p) => (
                <a
                  key={p.nombre}
                  href={enlace(p.nombre, periodo)}
                  onMouseDown={(e) => {
                    // Solo el botón principal: el secundario abre su menú y el
                    // central abre en otra pestaña, y ninguno debe navegar aquí.
                    if (e.button !== 0) return;
                    e.preventDefault();
                    router.push(enlace(p.nombre, periodo));
                    setAbierto(false);
                    setBusqueda("");
                  }}
                  className="cv-row-h"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 9,
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--cv-ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.nombre}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: tonoUso(p.uso),
                      flexShrink: 0,
                    }}
                  >
                    {p.uso === null ? `${fmt(p.registradas)} h` : `${p.uso}%`}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* periodo · enlaces y no botones: la vista se comparte tal cual y
            funciona aunque el JavaScript no haya cargado */}
        <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {PERIODOS.map((p) => {
            const on = periodo === p.id;
            return (
              <a
                key={p.id}
                href={enlace(d?.proyecto ?? "", p.id)}
                className="cv-btn"
                style={{
                  border: "none",
                  background: on ? "var(--cv-navy)" : "transparent",
                  color: on ? "#fff" : "var(--cv-ink-3)",
                  fontSize: 11,
                  fontWeight: on ? 700 : 600,
                  padding: "7px 11px",
                  borderRadius: 9,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {p.label}
              </a>
            );
          })}
        </span>
      </div>

      {!d ? (
        <div
          className="cv-card cv-rise"
          style={{ borderRadius: 18, padding: "48px 26px", textAlign: "center" }}
        >
          <span
            className="soh-display"
            style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--cv-ink)" }}
          >
            Elige un proyecto
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
            Verás sus horas cotizadas contra las registradas, quién ha trabajado
            en él y en qué entregables se están yendo las horas.
          </p>
        </div>
      ) : (
        <>
          {/* ------------------------------- de qué proyecto hablamos -- */}
          <div
            className="cv-rise"
            style={{
              display: "flex",
              alignItems: "center",
              rowGap: 8,
              flexWrap: "wrap",
              paddingBottom: 13,
              borderBottom: "1px solid var(--cv-line-soft)",
              marginBottom: 14,
            }}
          >
            <span
              className="soh-display"
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "-.02em",
                color: "var(--cv-ink)",
                paddingRight: 14,
              }}
            >
              {d.proyecto}
            </span>
            {d.cliente && (
              <span
                style={{ fontSize: 11, color: "var(--cv-ink-3)", paddingRight: 14 }}
              >
                {d.cliente}
              </span>
            )}
            <span
              style={{
                display: "flex",
                gap: 15,
                flexWrap: "wrap",
                fontSize: 11,
                color: "var(--cv-ink-3)",
              }}
            >
              <span>
                <strong style={{ color: "var(--cv-ink)" }}>{d.personas}</strong>{" "}
                {d.personas === 1 ? "persona" : "personas"}
              </span>
              <span>
                <strong style={{ color: "var(--cv-ink)" }}>{d.diasConRegistro}</strong>{" "}
                días con registro
              </span>
              <span>
                media{" "}
                <strong style={{ color: "var(--cv-ink)" }}>{fmt(d.mediaDiaria)} h</strong>
                /día
              </span>
              {d.pasados > 0 && (
                <span style={{ color: ROJO, fontWeight: 700 }}>
                  {d.pasados}{" "}
                  {d.pasados === 1
                    ? "entregable pasado de horas"
                    : "entregables pasados de horas"}
                </span>
              )}
            </span>
            {d.desde && d.hasta && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10.5,
                  color: "var(--cv-ink-4)",
                  whiteSpace: "nowrap",
                }}
              >
                {fechaCorta(d.desde)} – {fechaCorta(d.hasta)}
              </span>
            )}
          </div>

          {/* ------------------------------------------------- cifras -- */}
          <div
            className="cv-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Cifra rotulo="Horas cotizadas" valor={fmt(d.cotizadas)} tono={NAVY} />
            <Cifra rotulo="Horas registradas" valor={fmt(d.registradas)} tono={NAVY} />
            <Cifra
              rotulo="% uso de horas"
              valor={d.uso === null ? "—" : `${d.uso} %`}
              tono={tonoUso(d.uso)}
            />
            <Cifra
              rotulo={
                d.disponibles !== null && d.disponibles < 0
                  ? "Horas excedidas"
                  : "Horas disponibles"
              }
              valor={d.disponibles === null ? "—" : fmt(Math.abs(d.disponibles))}
              tono={
                d.disponibles !== null && d.disponibles < 0 ? ROJO : VERDE
              }
            />
          </div>

          {/* La barra de consumo va aquí, bajo sus propias cifras: en un panel
              aparte repetía los mismos números en otra forma. */}
          {d.cotizadas > 0 && (
            <div className="cv-rise" style={{ marginBottom: 16 }}>
              <Balance
                cotizadas={d.cotizadas}
                registradas={d.registradas}
                uso={d.uso}
              />
            </div>
          )}

          <div className="cv-radar-grid">
            {/* ------------------------------------- serie diaria ----- */}
            <Panel titulo="Registro de horas y acumulado">
              <SerieDiaria serie={d.serie} meses={d.meses} />
            </Panel>

            {/* --------------------------------------- esfuerzos ------ */}
            <Panel titulo="Distribución de esfuerzos">
              <Dona partes={d.esfuerzos} />
            </Panel>

            {/* ------------------------------------ colaboradores ----- */}
            <Panel titulo={`Horas por colaborador (${d.personas})`}>
              <BarrasSimples
                partes={d.colaboradores.slice(0, 12)}
                total={d.registradas}
              />
            </Panel>

            {/* --------------------------------- entregables, a lo ancho */}
            <div className="cv-radar-ancho">
              <Panel titulo={`Uso de horas por entregable (${d.entregables.length})`}>
                <BarrasEntregables items={d.entregables.slice(0, 18)} />
              </Panel>
            </div>
          </div>
        </>
      )}

      <style>{`
        .cv-radar-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }
        /* El mapa de entregables ocupa las dos columnas: son bloques que se
           reparten el ancho, y en media pantalla quedarían apretados. */
        .cv-radar-ancho { grid-column: 1 / -1; }
        @media (max-width: 1080px) {
          .cv-radar-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

/* ==================== piezas ========================================= */

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

function Panel({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="cv-card cv-rise"
      style={{ borderRadius: 16, padding: "14px 16px 16px" }}
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
        {titulo}
      </span>
      {children}
    </div>
  );
}

/**
 * Barras de horas con la línea de acumulado encima.
 *
 * En SVG y no con una librería: son dos series sobre el mismo eje, y traer un
 * paquete de gráficas para esto pesaría más que la pantalla entera.
 *
 * Dos vistas porque una sola no sirve para todo: por día se ve el ritmo real
 * —qué días se trabajó y cuáles no—, pero con dos años de proyecto son
 * cientos de barras de un píxel sin eje legible. Por mes son doce barras con
 * su nombre debajo, y ahí sí se distingue qué mes se disparó.
 */
function SerieDiaria({
  serie,
  meses,
}: {
  serie: { iso: string; horas: number; acumulado: number }[];
  meses: { clave: string; etiqueta: string; anio: number; horas: number; acumulado: number }[];
}) {
  // Por mes cuando hay tantos días que las barras no se distinguirían.
  const [porMes, setPorMes] = useState(serie.length > 70);
  /** Qué punto señala el ratón. `null` cuando está fuera. */
  const [señalado, setSeñalado] = useState<number | null>(null);

  if (serie.length === 0) {
    return <Vacio texto="Sin horas registradas en este proyecto." />;
  }

  const puntos = porMes
    ? meses.map((m) => ({
        clave: m.clave,
        etiqueta: `${m.etiqueta} ${String(m.anio).slice(2)}`,
        completo: `${m.etiqueta} ${m.anio}`,
        horas: m.horas,
        acumulado: m.acumulado,
      }))
    : serie.map((p) => ({
        clave: p.iso,
        etiqueta: fechaCorta(p.iso),
        completo: fechaLarga(p.iso),
        horas: p.horas,
        acumulado: p.acumulado,
      }));

  /*
   * Espacio a la izquierda y abajo para los ejes.
   *
   * Sin ellos hay que adivinar la altura de cada barra: se ve la forma pero no
   * se lee ningún valor, que era el problema de la vista anterior.
   */
  const W = 640;
  const H = 190;
  const EJE_Y = 42;
  const EJE_X = 26;
  /*
   * Aire arriba: la marca del máximo cae justo en el borde del dibujo, y sin
   * este margen su número se recortaba por la mitad.
   */
  const TECHO = 12;
  const areaW = W - EJE_Y;
  const areaH = H - EJE_X - TECHO;

  const maxBarra = Math.max(...puntos.map((p) => p.horas), 1);
  const maxAcum = Math.max(...puntos.map((p) => p.acumulado), 1);
  const paso = areaW / puntos.length;
  const ancho = Math.max(1.5, Math.min(paso * 0.68, 26));

  /** Marcas del eje: cuatro alturas redondeadas para leer sin contar. */
  const escala = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    valor: Math.round(maxBarra * f),
  }));

  /*
   * Cuántas etiquetas caben en el eje horizontal.
   *
   * Se pintan una de cada N para que no se solapen: con 70 días y todas las
   * fechas, el eje era una mancha negra.
   */
  const cadaCuantas = Math.max(1, Math.ceil(puntos.length / (porMes ? 14 : 9)));

  const linea = puntos
    .map(
      (p, i) =>
        `${EJE_Y + i * paso + paso / 2},${areaH - (p.acumulado / maxAcum) * areaH}`,
    )
    .join(" ");

  /** Hay un punto señalado y sigue existiendo tras cambiar de vista. */
  const activo = señalado !== null && señalado >= 0 && señalado < puntos.length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <Leyenda color={NAVY} texto={porMes ? "Horas del mes" : "Horas del día"} />
        <Leyenda color={VERDE} texto="Acumuladas" linea />

        {/* El conmutador solo aparece si hay meses que agrupar. */}
        {meses.length > 1 && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
            {(
              [
                [false, "Por día"],
                [true, "Por mes"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setPorMes(v);
                  // El índice señalado no vale en la otra vista: 40 días no
                  // son 40 meses.
                  setSeñalado(null);
                }}
                aria-pressed={porMes === v}
                className="cv-btn"
                style={{
                  border: "none",
                  background: porMes === v ? "var(--cv-navy)" : "transparent",
                  color: porMes === v ? "#fff" : "var(--cv-ink-3)",
                  fontSize: 10,
                  fontWeight: porMes === v ? 700 : 600,
                  padding: "5px 10px",
                  borderRadius: 8,
                }}
              >
                {label}
              </button>
            ))}
          </span>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          /*
           * Sin altura fija: con `width: 100%` y `height: 190px` el navegador
           * conservaba la proporción del `viewBox`, centraba el dibujo y
           * dejaba márgenes laterales. La posición del ratón no correspondía
           * con la barra de debajo, y en los extremos el desfase era de
           * centímetros.
           *
           * Dejando que la altura salga del `viewBox`, el dibujo ocupa el
           * ancho completo y las coordenadas coinciden. `aspectRatio` fija la
           * altura antes de que cargue, para que la tarjeta no dé un salto.
           */
          style={{ width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, display: "block" }}
          onMouseMove={(ev) => {
            /*
             * La conversión la hace el propio SVG con su matriz, no una regla
             * de tres sobre el ancho: así da igual cómo el navegador acabe
             * dibujándolo —márgenes, escalado, zoom de la página—.
             */
            const svg = ev.currentTarget;
            const punto = svg.createSVGPoint();
            punto.x = ev.clientX;
            punto.y = ev.clientY;
            const m = svg.getScreenCTM();
            if (!m) return;
            const { x: xSvg } = punto.matrixTransform(m.inverse());

            // El punto cuyo CENTRO queda más cerca, acotado al rango: así el
            // último responde también por su derecha.
            const x = xSvg - EJE_Y;
            const i = Math.min(
              puntos.length - 1,
              Math.max(0, Math.round((x - paso / 2) / paso)),
            );
            setSeñalado(i);
          }}
          onMouseLeave={() => setSeñalado(null)}
        >
          {/* Todo el dibujo baja `TECHO` píxeles, para que el número del máximo
              no toque el borde superior. */}
          <g transform={`translate(0 ${TECHO})`}>
            {/* rejilla y eje vertical, con sus valores */}
            {escala.map(({ f, valor }) => (
              <g key={f}>
                <line
                  x1={EJE_Y}
                  x2={W}
                  y1={areaH - areaH * f}
                  y2={areaH - areaH * f}
                  stroke="var(--cv-line-soft)"
                  strokeWidth="1"
                />
                <text
                  x={EJE_Y - 7}
                  y={areaH - areaH * f + 3.5}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--cv-ink-4)"
                >
                  {valor}
                </text>
              </g>
            ))}

            {/* la guía vertical, bajo las barras para no taparlas */}
            {activo && (
              <line
                x1={EJE_Y + señalado! * paso + paso / 2}
                x2={EJE_Y + señalado! * paso + paso / 2}
                y1={0}
                y2={areaH}
                stroke="var(--cv-ink-4)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity={0.6}
              />
            )}

            {puntos.map((p, i) => {
              const alto = (p.horas / maxBarra) * areaH;
              const on = señalado === i;
              return (
                <g key={p.clave}>
                  <rect
                    x={EJE_Y + i * paso + (paso - ancho) / 2}
                    y={areaH - alto}
                    width={ancho}
                    height={Math.max(alto, 1)}
                    fill={on ? "#2A4670" : NAVY}
                    opacity={señalado === null || on ? 0.88 : 0.4}
                    rx={ancho > 6 ? 2 : 0}
                  />
                  {i % cadaCuantas === 0 && (
                    <text
                      x={EJE_Y + i * paso + paso / 2}
                      y={areaH + 17}
                      textAnchor="middle"
                      fontSize="8.5"
                      fill="var(--cv-ink-4)"
                    >
                      {p.etiqueta}
                    </text>
                  )}
                </g>
              );
            })}

            <polyline
              points={linea}
              fill="none"
              stroke={VERDE}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* el punto sobre la línea de acumulado */}
            {activo && (
              <circle
                cx={EJE_Y + señalado! * paso + paso / 2}
                cy={areaH - (puntos[señalado!].acumulado / maxAcum) * areaH}
                r="4"
                fill="#fff"
                stroke={VERDE}
                strokeWidth="2.5"
              />
            )}
          </g>
        </svg>

        {/* La etiqueta va en HTML y no en SVG: el texto se ajusta solo y usa
            las mismas fuentes que el resto de la pantalla. */}
        {activo && (
          <div
            style={{
              position: "absolute",
              top: 4,
              // Se pega al lado contrario cuando el punto está a la derecha,
              // para no salirse del panel.
              left:
                señalado! / puntos.length > 0.6
                  ? undefined
                  : `${((EJE_Y + señalado! * paso + paso / 2) / W) * 100}%`,
              right:
                señalado! / puntos.length > 0.6
                  ? `${100 - ((EJE_Y + señalado! * paso + paso / 2) / W) * 100}%`
                  : undefined,
              transform:
                señalado! / puntos.length > 0.6
                  ? "translateX(-10px)"
                  : "translateX(10px)",
              pointerEvents: "none",
              background: "var(--cv-navy)",
              borderRadius: 9,
              padding: "7px 10px",
              minWidth: 118,
              boxShadow: "0 8px 22px rgba(7,23,43,.28)",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                marginBottom: 4,
              }}
            >
              {puntos[señalado!].completo}
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10.5,
                color: "#C6D4E2",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "#5D7EA8",
                  flexShrink: 0,
                }}
              />
              {porMes ? "Del mes" : "Del día"}
              <strong style={{ marginLeft: "auto", color: "#fff" }}>
                {fmt(puntos[señalado!].horas)} h
              </strong>
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 10.5,
                color: "#C6D4E2",
                marginTop: 3,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 2,
                  borderRadius: 2,
                  background: "#32D66B",
                  flexShrink: 0,
                }}
              />
              Acumulado
              <strong style={{ marginLeft: "auto", color: "#32D66B" }}>
                {fmt(puntos[señalado!].acumulado)} h
              </strong>
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          fontSize: 10,
          color: "var(--cv-ink-4)",
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid var(--cv-line-soft)",
        }}
      >
        <span>
          Máximo {porMes ? "mensual" : "diario"}:{" "}
          <strong style={{ color: "var(--cv-ink-2)" }}>{fmt(maxBarra)} h</strong>
        </span>
        <span>
          {puntos.length} {porMes ? "meses" : "días"} con registro
        </span>
        <span>
          Acumulado:{" "}
          <strong style={{ color: VERDE }}>{fmt(maxAcum)} h</strong>
        </span>
      </div>
    </div>
  );
}

/**
 * Cuánto del presupuesto de horas se lleva consumido.
 *
 * Una sola barra bajo las cifras, sin repetirlas: el marco completo es lo
 * cotizado y el relleno lo gastado, así que "cuánto queda" se ve sin restar
 * nada. Al pasarse, el exceso sale en rojo tras la marca del límite.
 */
function Balance({
  cotizadas,
  registradas,
  uso,
}: {
  cotizadas: number;
  registradas: number;
  uso: number | null;
}) {
  const pasado = registradas > cotizadas;
  // Al rebasar, la escala la marca lo consumido: si no, la parte roja se
  // saldría del marco sin decir cuánto.
  const escala = Math.max(cotizadas, registradas);
  const anchoCot = (cotizadas / escala) * 100;
  const anchoReg = (registradas / escala) * 100;

  return (
    <div>
      <span
        aria-hidden="true"
        style={{
          display: "block",
          position: "relative",
          height: 14,
          borderRadius: 7,
          background: "var(--cv-faint)",
          overflow: "hidden",
        }}
      >
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
            borderRadius: 7,
          }}
        />
        {pasado && (
          <span
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${anchoCot}%`,
              width: 2,
              background: "#fff",
            }}
          />
        )}
      </span>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--cv-ink-4)",
          marginTop: 5,
        }}
      >
        <span>
          {uso}% consumido de {fmt(cotizadas)} h cotizadas
        </span>
        {pasado && (
          <span style={{ color: ROJO, fontWeight: 700 }}>
            {fmt(registradas - cotizadas)} h por encima de lo cotizado
          </span>
        )}
      </div>
    </div>
  );
}

function Dona({ partes }: { partes: { nombre: string; horas: number; parte: number }[] }) {
  /** Qué porción señala el ratón: se resalta el arco y su renglón a la vez. */
  const [señalada, setSeñalada] = useState<string | null>(null);

  if (partes.length === 0) return <Vacio texto="Sin datos de esfuerzo." />;

  const R = 54;
  const GROSOR = 22;
  const C = 2 * Math.PI * R;
  const total = partes.reduce((n, p) => n + p.horas, 0);
  const activa = partes.find((p) => p.nombre === señalada) ?? null;
  let acumulado = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <svg
        viewBox="0 0 140 140"
        style={{ width: 140, height: 140, flexShrink: 0 }}
      >
        <g transform="rotate(-90 70 70)">
          {partes.map((p, i) => {
            const largo = p.parte * C;
            const on = señalada === p.nombre;
            const el = (
              <circle
                key={p.nombre}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={TONOS[i % TONOS.length]}
                // El arco señalado engorda; los demás se apagan.
                strokeWidth={on ? GROSOR + 5 : GROSOR}
                opacity={señalada === null || on ? 1 : 0.35}
                strokeDasharray={`${largo} ${C - largo}`}
                strokeDashoffset={-acumulado}
                onMouseEnter={() => setSeñalada(p.nombre)}
                onMouseLeave={() => setSeñalada(null)}
                style={{ cursor: "pointer", transition: "stroke-width .12s, opacity .12s" }}
              />
            );
            acumulado += largo;
            return el;
          })}
        </g>

        {/* El centro muestra el total, o lo señalado mientras el ratón está
            encima: así el arco no necesita etiqueta emergente. */}
        <text
          x="70"
          y="66"
          textAnchor="middle"
          fontSize={activa ? 17 : 19}
          fontWeight="700"
          fill="var(--cv-ink)"
        >
          {fmt(activa ? activa.horas : total)}
        </text>
        <text x="70" y="80" textAnchor="middle" fontSize="9" fill="var(--cv-ink-4)">
          {activa ? `h · ${(activa.parte * 100).toFixed(1)}%` : "horas"}
        </text>
      </svg>

      <div style={{ flex: 1, minWidth: 130, display: "flex", flexDirection: "column", gap: 7 }}>
        {partes.map((p, i) => (
          <span
            key={p.nombre}
            onMouseEnter={() => setSeñalada(p.nombre)}
            onMouseLeave={() => setSeñalada(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "2px 4px",
              margin: "-2px -4px",
              borderRadius: 6,
              background: señalada === p.nombre ? "var(--cv-faint)" : "transparent",
              opacity: señalada === null || señalada === p.nombre ? 1 : 0.5,
              cursor: "default",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                borderRadius: 3,
                background: TONOS[i % TONOS.length],
                flexShrink: 0,
              }}
            />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 10.5,
                color: "var(--cv-ink-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.nombre}
            </span>
            <span
              style={{
                fontSize: 10.5,
                color: "var(--cv-ink-4)",
                flexShrink: 0,
              }}
            >
              {fmt(p.horas)} h
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--cv-ink)",
                flexShrink: 0,
                minWidth: 38,
                textAlign: "right",
              }}
            >
              {(p.parte * 100).toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BarrasSimples({
  partes,
  total,
}: {
  partes: { nombre: string; horas: number }[];
  total: number;
}) {
  if (partes.length === 0) return <Vacio texto="Nadie ha reportado horas aquí." />;
  const max = Math.max(...partes.map((p) => p.horas), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {partes.map((p) => (
        <span key={p.nombre} style={{ display: "block" }}>
          <span
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10.5,
              marginBottom: 3,
            }}
          >
            <span
              style={{
                color: "var(--cv-ink-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingRight: 8,
              }}
            >
              {p.nombre}
            </span>
            <span style={{ fontWeight: 700, color: "var(--cv-ink)", flexShrink: 0 }}>
              {fmt(p.horas)} h
              <span style={{ color: "var(--cv-ink-4)", fontWeight: 500 }}>
                {" "}
                · {((p.horas / (total || 1)) * 100).toFixed(0)}%
              </span>
            </span>
          </span>
          <span
            aria-hidden="true"
            style={{
              display: "block",
              height: 7,
              borderRadius: 4,
              background: "var(--cv-faint)",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                width: `${(p.horas / max) * 100}%`,
                background: NAVY,
                borderRadius: 4,
              }}
            />
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Cotizado contra registrado, por entregable.
 *
 * Sustituye a la dispersión del tablero de Looker: en un plano de puntos hay
 * que buscar cuál está pasado, y aquí se ve en el orden —lo más consumido
 * arriba— y en el color.
 */
function BarrasEntregables({
  items,
}: {
  items: { nombre: string; cotizadas: number; registradas: number; uso: number | null }[];
}) {
  if (items.length === 0) return <Vacio texto="Sin entregables con horas." />;

  /*
   * Una fila por entregable, con su medidor.
   *
   * Cada fila lleva un arco que se llena con lo consumido —lleno y rojo al
   * pasarse— y una barra que dice cuántas horas son en relación al resto. Así
   * se ven las dos cosas a la vez: cuál está en problemas y cuál pesa de
   * verdad, que en la dispersión de Looker había que cruzar dos ejes para
   * deducir.
   *
   * En dos columnas y filas de 26px: caben dieciocho entregables sin bajar la
   * página.
   */
  const maxHoras = Math.max(...items.map((i) => i.registradas), 1);

  const tono = (uso: number | null) => {
    if (uso === null) return "#8A99AD";
    const pct = uso * 100;
    if (pct > 100) return ROJO;
    if (pct >= 85) return "#F5B843";
    return "#32D66B";
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 11 }}>
        <Leyenda color="#32D66B" texto="Con holgura" />
        <Leyenda color="#F5B843" texto="Cerca del límite" />
        <Leyenda color={ROJO} texto="Pasado" />
        <Leyenda color="#8A99AD" texto="Sin cotizar" />
      </div>

      <div className="cv-entregables">
        {items.map((e) => {
          const pct = e.uso === null ? null : Math.round(e.uso * 100);
          const c = tono(e.uso);
          // El arco: 30px de circunferencia repartidos según lo consumido.
          const R = 8;
          const C = 2 * Math.PI * R;
          const lleno = pct === null ? 0 : Math.min(pct, 100) / 100;

          return (
            <span
              key={e.nombre}
              className="cv-row-h"
              title={`${e.nombre}\n${fmt(e.registradas)} h registradas${
                e.cotizadas > 0 ? ` de ${fmt(e.cotizadas)} cotizadas` : " · sin cotizar"
              }`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "4px 6px",
                borderRadius: 8,
                minWidth: 0,
              }}
            >
              {/* el medidor */}
              <svg width="22" height="22" viewBox="0 0 22 22" style={{ flexShrink: 0 }}>
                <circle
                  cx="11"
                  cy="11"
                  r={R}
                  fill="none"
                  stroke="var(--cv-line-soft)"
                  strokeWidth="3"
                />
                <circle
                  cx="11"
                  cy="11"
                  r={R}
                  fill="none"
                  stroke={c}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${lleno * C} ${C}`}
                  transform="rotate(-90 11 11)"
                />
              </svg>

              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 10.5,
                  color: "var(--cv-ink-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {e.nombre}
              </span>

              {/* cuánto pesa, en horas */}
              <span
                aria-hidden="true"
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 3,
                  background: "var(--cv-faint)",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${(e.registradas / maxHoras) * 100}%`,
                    background: NAVY,
                    opacity: 0.55,
                    borderRadius: 3,
                  }}
                />
              </span>

              <span
                style={{
                  fontSize: 10,
                  color: "var(--cv-ink-4)",
                  flexShrink: 0,
                  width: 46,
                  textAlign: "right",
                }}
              >
                {fmt(e.registradas)} h
              </span>

              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: pct === null ? "var(--cv-ink-4)" : tonoUso(pct),
                  flexShrink: 0,
                  width: 40,
                  textAlign: "right",
                }}
              >
                {pct === null ? "—" : `${pct}%`}
              </span>
            </span>
          );
        })}
      </div>

      <style>{`
        .cv-entregables {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px 20px;
        }
        @media (max-width: 900px) {
          .cv-entregables { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function Leyenda({
  color,
  texto,
  linea = false,
}: {
  color: string;
  texto: string;
  linea?: boolean;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden="true"
        style={{
          width: linea ? 14 : 9,
          height: linea ? 2 : 9,
          borderRadius: linea ? 2 : 3,
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 10.5, color: "var(--cv-ink-3)" }}>{texto}</span>
    </span>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "26px 0",
        textAlign: "center",
        fontSize: 11.5,
        color: "var(--cv-ink-4)",
      }}
    >
      {texto}
    </p>
  );
}
