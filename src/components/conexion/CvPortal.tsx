"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Saca su contenido del árbol y lo cuelga del `<body>`.
 *
 * Hace falta para cualquier cosa con `position: fixed`. El lienzo de la
 * plataforma (`.cv-canvas`) tiene `position: relative`, y basta un ancestro
 * posicionado para que `fixed` deje de medirse contra la ventana y se mida
 * contra ese ancestro: el panel acababa encajonado dentro de la sección, con
 * su propio scroll, en vez de cubrir la pantalla.
 *
 * El montaje se aplaza a después de la hidratación porque en el servidor no
 * hay `document`.
 */
export function CvPortal({ children }: { children: React.ReactNode }) {
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
  }, []);

  if (!montado) return null;
  return createPortal(children, document.body);
}
