"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/**
 * Campo que se escribe Y se elige.
 *
 * Un `<select>` con 74 proyectos obliga a recorrer la lista entera; un campo
 * libre acepta cualquier cosa y ensucia los datos. Este hace las dos: filtras
 * escribiendo y eliges de lo que queda, con el teclado o con el ratón.
 *
 * `permitirLibre` decide qué pasa con lo que no está en la lista: en proyectos
 * y entregables conviene cerrarlo —el catálogo es la verdad—; en un campo como
 * "quién te cubre" conviene abrirlo.
 */
export function CvCombo({
  name,
  opciones,
  valor,
  onChange,
  placeholder = "Escribe o elige…",
  requerido = false,
  permitirLibre = false,
  desactivado = false,
  ariaLabel,
}: {
  /** Para que el valor viaje en un `<form>` sin estado externo. */
  name?: string;
  opciones: string[];
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  requerido?: boolean;
  permitirLibre?: boolean;
  desactivado?: boolean;
  ariaLabel?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [cursor, setCursor] = useState(0);
  const cajaRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  // Lo que se ve: mientras se escribe manda el texto; si no, el valor elegido.
  const visible = abierto ? texto : valor;

  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!abierto || !t) return opciones;
    // Las que empiezan igual van primero: escribir "co" debe ofrecer
    // "COTIZADOR" antes que "PROYECTO CON…".
    const empiezan = opciones.filter((o) => o.toLowerCase().startsWith(t));
    const contienen = opciones.filter(
      (o) => !o.toLowerCase().startsWith(t) && o.toLowerCase().includes(t),
    );
    return [...empiezan, ...contienen];
  }, [opciones, texto, abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) {
        setAbierto(false);
        setTexto("");
      }
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  // La opción marcada siempre visible al moverse con el teclado.
  useEffect(() => {
    if (!abierto) return;
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor, abierto]);

  const elegir = (v: string) => {
    onChange(v);
    setTexto("");
    setAbierto(false);
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
      if (filtradas[cursor]) elegir(filtradas[cursor]);
      else if (permitirLibre && texto.trim()) elegir(texto.trim());
    } else if (e.key === "Escape") {
      setAbierto(false);
      setTexto("");
    }
  };

  return (
    <div ref={cajaRef} style={{ position: "relative" }}>
      {/* El valor real viaja en un campo oculto: así funciona dentro de un
          formulario sin que el padre tenga que llevar el estado. */}
      {name && <input type="hidden" name={name} value={valor} required={requerido} />}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "8px 10px 8px 12px",
          borderRadius: 11,
          border: `1px solid ${abierto ? "var(--cv-green)" : "var(--cv-line)"}`,
          background: desactivado ? "var(--cv-hover)" : "#fff",
          transition: "border-color .18s ease",
        }}
      >
        <input
          value={visible}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setCursor(0);
            // Escribir sobre un valor ya elegido lo descarta: si no, quedaría
            // guardado algo distinto de lo que se lee.
            if (valor) onChange("");
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclas}
          placeholder={placeholder}
          aria-label={ariaLabel}
          disabled={desactivado}
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
        {valor && !desactivado && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setTexto("");
            }}
            aria-label="Limpiar"
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
            <X size={13} />
          </button>
        )}
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            color: "var(--cv-ink-4)",
            flexShrink: 0,
            transform: abierto ? "rotate(180deg)" : "none",
            transition: "transform .18s ease",
          }}
        />
      </div>

      {abierto && !desactivado && (
        <div
          ref={listaRef}
          className="soh-scroll-lt cv-pop"
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 240,
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
            permitirLibre && texto.trim() ? (
              <button
                type="button"
                onClick={() => elegir(texto.trim())}
                className="cv-row-h"
                style={{
                  ...fila,
                  color: "var(--cv-green-ink)",
                  fontWeight: 600,
                }}
              >
                Usar «{texto.trim()}»
              </button>
            ) : (
              <p
                style={{
                  margin: 0,
                  padding: "12px 11px",
                  fontSize: 11.5,
                  color: "var(--cv-ink-4)",
                }}
              >
                Nada coincide. Prueba con otra palabra.
              </p>
            )
          ) : (
            filtradas.map((o, i) => {
              const activa = i === cursor;
              const elegida = o === valor;
              return (
                <button
                  key={o}
                  type="button"
                  data-i={i}
                  role="option"
                  aria-selected={elegida}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => elegir(o)}
                  style={{
                    ...fila,
                    background: activa ? "var(--cv-hover)" : "transparent",
                    color: elegida ? "var(--cv-green-ink)" : "var(--cv-ink)",
                    fontWeight: elegida ? 700 : 500,
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
        </div>
      )}
    </div>
  );
}

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
