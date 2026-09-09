"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/**
 * Varios de una lista, buscando.
 *
 * Es el hermano de `CvCombo` para cuando la respuesta no es una sino unas
 * cuantas: quién te cubre mientras faltas puede ser una persona o tres. Con
 * la plantilla entera en la lista, ir marcando casillas obliga a recorrerla
 * de arriba abajo, así que se teclea parte del nombre y se elige de lo que
 * queda.
 *
 * Lo ya elegido sale como fichas encima del campo —y no solo con palomita
 * dentro de la lista— porque es lo que hay que poder repasar de un vistazo
 * antes de enviar, sin volver a abrir nada.
 */
export function CvComboMulti({
  name,
  opciones,
  valores,
  onChange,
  placeholder = "Escribe o elige…",
  maximo,
  ariaLabel,
}: {
  /**
   * Para que los valores viajen en un `<form>` sin estado externo.
   *
   * Van separados por " · " en un solo campo: la columna `backup` es texto
   * libre, y así se lee tal cual en el calendario sin recomponer nada.
   */
  name?: string;
  opciones: string[];
  valores: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  /** Tope de elegidos, si el campo tiene uno. */
  maximo?: number;
  ariaLabel?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [cursor, setCursor] = useState(0);
  /** Hacia dónde cabe la lista: abajo salvo que no quepa. */
  const [haciaArriba, setHaciaArriba] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLDivElement>(null);

  const lleno = maximo !== undefined && valores.length >= maximo;

  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t) return opciones;
    // Las que empiezan igual van primero: escribir "ad" debe ofrecer "ADOLFO"
    // antes que "MARIA ADRIANA".
    const empiezan = opciones.filter((o) => o.toLowerCase().startsWith(t));
    const contienen = opciones.filter(
      (o) => !o.toLowerCase().startsWith(t) && o.toLowerCase().includes(t),
    );
    return [...empiezan, ...contienen];
  }, [opciones, texto]);

  const cerrar = () => {
    setAbierto(false);
    setTexto("");
  };

  useEffect(() => {
    if (!abierto) return;

    const fuera = (e: MouseEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) cerrar();
    };

    /*
      Al desplazar el formulario, la lista se cierra.

      Va anclada al campo, y el panel de la solicitud se desplaza por dentro:
      sin esto, al bajar para seguir llenando el formulario la lista se
      quedaba flotando sobre los campos siguientes, tapándolos.

      Pero solo cuenta el desplazamiento DE VERDAD, el que hace la persona.
      El navegador también desplaza el panel por su cuenta —al enfocar el
      campo, y otra vez cuando aparece una ficha y todo baja un renglón—, y
      esos avisos llegaban igual: la lista se cerraba sola en el mismo gesto
      que la abría, y al elegir el primer nombre. De ahí que se compare
      contra dónde estaba, en vez de reaccionar al aviso.

      `capture` porque el scroll ocurre en el panel, no en `document`, y no
      burbujea.
    */
    const dondeIba = new WeakMap<EventTarget, number>();

    const alDesplazar = (e: Event) => {
      const donde = e.target;
      if (!donde) return;

      // El scroll dentro de la propia lista es buscar un nombre, no salirse.
      if (listaRef.current?.contains(donde as Node)) return;

      const y =
        donde === document || donde === window
          ? window.scrollY
          : (donde as HTMLElement).scrollTop;

      const antes = dondeIba.get(donde);
      dondeIba.set(donde, y);

      // La primera vez solo se anota: no hay con qué comparar todavía.
      if (antes === undefined) return;
      // Un par de píxeles es el acomodo del navegador; mover es mover.
      if (Math.abs(y - antes) < 8) return;

      cerrar();
    };

    document.addEventListener("mousedown", fuera);
    document.addEventListener("scroll", alDesplazar, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("scroll", alDesplazar, true);
    };
  }, [abierto]);

  /*
   * Si abajo no cabe, se abre hacia arriba.
   *
   * El campo suele quedar en la parte baja del panel de la solicitud, y una
   * lista de 240px anclada debajo tapaba los campos siguientes —incluido el
   * botón de enviar—. Como además cubría esa zona, los clics para cerrarla
   * caían dentro de la propia lista y no la cerraban nunca.
   */
  useEffect(() => {
    if (!abierto) return;
    const caja = campoRef.current?.getBoundingClientRect();
    if (!caja) return;
    const debajo = window.innerHeight - caja.bottom;
    setHaciaArriba(debajo < ALTO_LISTA + 16 && caja.top > debajo);
  }, [abierto, valores.length]);

  /*
   * La opción marcada, siempre visible al moverse con el teclado.
   *
   * Se desplaza LA LISTA a mano en vez de usar `scrollIntoView`: ese sube por
   * todos los ancestros y acababa desplazando el panel entero de la solicitud
   * —con lo que la lista se cerraba sola al elegir el primer nombre, porque
   * el formulario se había movido debajo—.
   */
  useEffect(() => {
    if (!abierto) return;
    const caja = listaRef.current;
    const fila = caja?.querySelector<HTMLElement>(`[data-i="${cursor}"]`);
    if (!caja || !fila) return;

    const arriba = fila.offsetTop;
    const abajo = arriba + fila.offsetHeight;

    if (arriba < caja.scrollTop) caja.scrollTop = arriba;
    else if (abajo > caja.scrollTop + caja.clientHeight) {
      caja.scrollTop = abajo - caja.clientHeight;
    }
  }, [cursor, abierto]);

  /*
   * Elegir ALTERNA, no añade.
   *
   * Volver a tocar un nombre ya elegido lo quita: es lo que se espera de una
   * lista con palomita, y ahorra tener que ir a buscar su ficha para corregir
   * un clic de más.
   */
  const alternar = (v: string) => {
    if (valores.includes(v)) {
      onChange(valores.filter((x) => x !== v));
      return;
    }
    if (lleno) return;
    onChange([...valores, v]);
    // La lista NO se cierra: casi siempre se eligen dos o tres seguidas, y
    // reabrirla cada vez convierte tres clics en nueve.
    setTexto("");
    setCursor(0);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setCursor((c) => Math.min(c + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtradas[cursor]) alternar(filtradas[cursor]);
    } else if (e.key === "Escape") {
      setAbierto(false);
      setTexto("");
    } else if (e.key === "Backspace" && !texto && valores.length > 0) {
      // Borrar con el campo vacío quita la última ficha, como en cualquier
      // campo de destinatarios.
      onChange(valores.slice(0, -1));
    }
  };

  return (
    <div ref={cajaRef} style={{ position: "relative" }}>
      {name && <input type="hidden" name={name} value={valores.join(" · ")} />}

      {/* Lo elegido, para repasarlo sin abrir la lista. */}
      {valores.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
            marginBottom: 6,
          }}
        >
          {valores.map((v) => (
            <span
              key={v}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "var(--cv-faint)",
                border: "1px solid var(--cv-line-soft)",
                borderRadius: 999,
                padding: "4px 6px 4px 10px",
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--cv-ink-2)",
                maxWidth: "100%",
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {v}
              </span>
              <button
                type="button"
                onClick={() => onChange(valores.filter((x) => x !== v))}
                aria-label={`Quitar a ${v}`}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--cv-ink-4)",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 0,
                  flexShrink: 0,
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        ref={campoRef}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "8px 10px 8px 12px",
          borderRadius: 11,
          border: `1px solid ${abierto ? "var(--cv-green)" : "var(--cv-line)"}`,
          background: "#fff",
          transition: "border-color .18s ease",
        }}
      >
        <input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setCursor(0);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclas}
          placeholder={
            lleno
              ? `Máximo ${maximo}`
              : valores.length > 0
                ? "Añadir a alguien más…"
                : placeholder
          }
          aria-label={ariaLabel}
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 12.5,
            fontFamily: "inherit",
            color: "var(--cv-ink)",
          }}
        />
        {/*
          La flecha CIERRA, no solo decora.

          Es lo primero que se toca cuando alguien quiere quitarse la lista de
          encima, y hasta ahora no hacía nada: había que adivinar que se
          cerraba picando fuera.
        */}
        <button
          type="button"
          onClick={() => (abierto ? cerrar() : setAbierto(true))}
          aria-label={abierto ? "Cerrar la lista" : "Abrir la lista"}
          aria-expanded={abierto}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            lineHeight: 0,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            style={{
              color: "var(--cv-ink-4)",
              transform: abierto ? "rotate(180deg)" : "none",
              transition: "transform .18s ease",
            }}
          />
        </button>
      </div>

      {abierto && (
        <div
          ref={listaRef}
          className="soh-scroll-lt cv-pop"
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            ...(haciaArriba
              ? { bottom: "calc(100% + 4px)" }
              : { top: "calc(100% + 4px)" }),
            left: 0,
            right: 0,
            maxHeight: ALTO_LISTA,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid var(--cv-line)",
            borderRadius: 12,
            boxShadow: "0 14px 34px rgba(7,23,43,.16)",
            zIndex: 30,
            padding: 4,
          }}
        >
          {filtradas.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "12px 11px",
                fontSize: 11.5,
                color: "var(--cv-ink-4)",
              }}
            >
              Nadie coincide. Prueba con otra palabra.
            </p>
          ) : (
            filtradas.map((o, i) => {
              const activa = i === cursor;
              const elegida = valores.includes(o);
              // Con el tope alcanzado, lo no elegido se apaga en vez de
              // desaparecer: así se ve que la lista sigue ahí.
              const apagada = lleno && !elegida;
              return (
                <button
                  key={o}
                  type="button"
                  data-i={i}
                  role="option"
                  aria-selected={elegida}
                  disabled={apagada}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => alternar(o)}
                  style={{
                    ...fila,
                    background: activa ? "var(--cv-hover)" : "transparent",
                    color: apagada
                      ? "var(--cv-ink-4)"
                      : elegida
                        ? "var(--cv-green-ink)"
                        : "var(--cv-ink)",
                    fontWeight: elegida ? 700 : 500,
                    cursor: apagada ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o}
                  </span>
                  {elegida && <Check size={13} style={{ flexShrink: 0 }} />}
                </button>
              );
            })
          )}

          {/*
            Una salida al alcance del pulgar.

            En el móvil, "pica fuera para cerrar" significa acertarle a un
            hueco que la propia lista está tapando. Con algo elegido, esto es
            lo que se busca: ya está, quítate.
          */}
          {valores.length > 0 && (
            <button
              type="button"
              onClick={cerrar}
              style={{
                ...fila,
                position: "sticky",
                bottom: 0,
                justifyContent: "center",
                marginTop: 2,
                background: "#fff",
                borderTop: "1px solid var(--cv-line-soft)",
                borderRadius: 0,
                color: "var(--cv-green-ink)",
                fontWeight: 700,
                fontSize: 11.5,
              }}
            >
              Listo · {valores.length}{" "}
              {valores.length === 1 ? "elegido" : "elegidos"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Lo que mide la lista abierta: hace falta para saber si cabe debajo. */
const ALTO_LISTA = 240;

const fila: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 11px",
  borderRadius: 9,
  border: "none",
  textAlign: "left",
  fontSize: 12.5,
  fontFamily: "inherit",
  cursor: "pointer",
};
