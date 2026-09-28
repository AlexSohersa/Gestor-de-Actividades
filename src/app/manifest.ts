import type { MetadataRoute } from "next";

/**
 * Lo que convierte la web en algo instalable en el celular.
 *
 * Con este archivo, Chrome y Safari ofrecen "Añadir a pantalla de inicio": la
 * herramienta queda como un icono más entre las apps, abre a pantalla completa
 * —sin barra de direcciones ni pestañas— y arranca directo en el checador.
 *
 * `start_url` apunta a `/checador` y no a la raíz porque quien instala esto en
 * el teléfono lo hace para marcar su jornada: son dos toques, el icono y el
 * botón. Desde ahí hay un enlace al gestor completo para lo demás.
 *
 * No hace falta publicar nada en ninguna tienda ni firmar nada: es la misma
 * página web, solo que el sistema la recuerda.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Checador · SOHERSA",
    short_name: "Checador",
    description:
      "Marca tu entrada, comida y salida desde el celular, en dos toques.",
    start_url: "/checador",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // El navy de la marca: es lo que pinta la barra de estado del teléfono y
    // la pantalla de arranque, así que tiene que ser el color de la cabecera
    // del checador o se ve una costura al abrir.
    background_color: "#0A1526",
    theme_color: "#0A1526",
    lang: "es-MX",
    icons: [
      {
        src: "/checador/icono.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
