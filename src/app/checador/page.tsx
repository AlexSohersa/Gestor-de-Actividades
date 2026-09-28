import { exigirPersona } from "@/modules/identidad/infrastructure/wiring";
import { estadoDeAcceso, urlDelPortal } from "@/lib/portal/acceso";
import { estadoHomeOffice } from "@/lib/gestor/homeoffice";
import { SinAcceso } from "@/components/SinAcceso";
import { ChecadorMovil } from "@/components/gestor/ChecadorMovil";

// Sin caché: la hora marcada ES el dato, y servir una versión tibia haría
// dudar de si el toque se registró.
export const revalidate = 0;

/**
 * El checador solo, para el celular.
 *
 * Misma jornada que el checador del gestor —la misma acción de servidor, la
 * misma fila de `actividad.checada`, con índice único por persona y día—, pero
 * sin nada alrededor: quien saca el teléfono al llegar no quiere esperar a que
 * cargue un tablero.
 *
 * Vive FUERA del grupo `(app)` a propósito: ese layout trae barra superior,
 * menú lateral y lienzo, que en una pantalla de 390px se comen el espacio y
 * obligan a buscar el botón. Aquí la página es el checador.
 *
 * El acceso se comprueba igual que en el resto —quien reparte las herramientas
 * es el portal—, porque estar fuera del layout no puede significar estar fuera
 * de la puerta.
 */
export default async function ChecadorPage() {
  const acceso = await estadoDeAcceso();
  if (acceso && !acceso.puede) {
    return <SinAcceso correo={acceso.correo} urlPortal={urlDelPortal()} />;
  }

  const persona = await exigirPersona();
  const estado = await estadoHomeOffice();

  return (
    <ChecadorMovil
      estado={estado}
      nombre={persona.nombreUsuario ?? persona.nombre}
    />
  );
}
