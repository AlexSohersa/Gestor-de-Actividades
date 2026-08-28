import { CvTopbar } from "@/components/conexion/CvTopbar";
import { CvSidebar } from "@/components/conexion/CvSidebar";
import {
  exigirPersona,
  registrarVisitaWired,
} from "@/modules/identidad/infrastructure/wiring";
import { veToda } from "@/modules/identidad/domain/persona.entity";
import { estadoDeAcceso, urlDelPortal } from "@/lib/portal/acceso";
import { SinAcceso } from "@/components/SinAcceso";

/**
 * El andamiaje de la herramienta: barra superior, menú lateral y lienzo.
 *
 * Es la misma estructura del portal, para que quien pase de una a otra no note
 * el salto: la barra ocupa todo el ancho arriba y el menú cuelga debajo, a la
 * izquierda del contenido.
 *
 * La identidad se resuelve UNA vez por petición —`personaActual` está memorizada
 * con `cache`— y las pantallas hijas la reutilizan sin volver a consultar.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Quién reparte las herramientas es el portal, no cada herramienta. Se
     comprueba aquí —antes de dibujar nada— porque esconder la tarjeta en el
     Core no protege la dirección: se puede escribir a mano, o quedar en un
     marcador de cuando sí se podía entrar. */
  const acceso = await estadoDeAcceso();
  if (acceso && !acceso.puede) {
    return <SinAcceso correo={acceso.correo} urlPortal={urlDelPortal()} />;
  }

  const persona = await exigirPersona();
  const esAdmin = veToda(persona);

  // Deja constancia de la visita sin hacer esperar a la página: si falla, no
  // pasa nada, es una bitácora.
  void registrarVisitaWired(persona.id).catch(() => {});

  return (
    // `height` fija, no `minHeight`: con minHeight el contenedor crece con el
    // contenido y scrollean los dos, la página y el <main>.
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <CvTopbar
        name={persona.nombre}
        email={persona.correo}
        image={persona.foto}
      />

      {/* `minWidth: 0` permite que los hijos se encojan: sin él, un hijo ancho
          impide que el flex reparta bien el espacio. */}
      <main style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex" }}>
        <CvSidebar esAdmin={esAdmin} ocultas={persona.seccionesOcultas} />

        <div
          className="soh-scroll-lt cv-canvas"
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {/*
            `cv-shell` declara el CONTENEDOR de las consultas `@container`.
            Sin él, rejillas como la de ausencias nunca pasan a dos columnas y
            todo queda apilado: una consulta de contenedor no puede medir al
            elemento que la usa, tiene que mirar a su padre.

            Sin padding propio: cada pantalla ya trae el suyo, y sumarlos
            dejaría el contenido con el doble de margen.
          */}
          <div className="cv-shell">{children}</div>
        </div>
      </main>
    </div>
  );
}
