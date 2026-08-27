import { google } from "googleapis";

// Sin `server-only` a propósito: este módulo lo usan tanto el servidor de Next
// como los scripts de ingesta que corren en Node suelto (`npx tsx`), y
// `server-only` revienta fuera del empaquetador. No hay riesgo de que llegue al
// cliente: nada del navegador lo importa, y las credenciales se leen de
// variables de entorno sin prefijo NEXT_PUBLIC.

/**
 * Lectura de las hojas del gestor antiguo.
 *
 * Se conecta con las credenciales de una cuenta que tenga acceso a la BDD
 * maestra. A diferencia del gestor anterior —que escribía en las hojas con la
 * sesión de quien estuviera usándolo—, aquí SOLO SE LEE: la fuente de verdad
 * pasa a ser la base de datos, y las hojas quedan como archivo histórico.
 *
 * Las credenciales salen de una cuenta de servicio (GOOGLE_SERVICE_ACCOUNT_*)
 * o de un token de usuario (GOOGLE_OAUTH_REFRESH_TOKEN). La primera es la buena
 * para un proceso de ingesta que corre solo.
 */

/**
 * Dónde vive el gestor antiguo.
 *
 * Van en el código y no en variables de entorno a propósito: son constantes,
 * no configuración. Estos archivos son los mismos en cualquier máquina y en
 * cualquier despliegue —solo hay un «SOH-SI-BD_BASES DE DATOS»—, así que
 * meterlos en el `.env` obligaría a repetirlos en cada entorno sin ganar nada
 * y con el riesgo de que uno se quede desfasado.
 *
 * Lo que SÍ es configuración son las credenciales: quién tiene permiso de
 * lectura sobre estos archivos. Eso sigue en el `.env`.
 *
 * Es el mismo criterio que sigue el Digital Core (ver `lib/gestor/sheets.ts`).
 */
export const BDD_MAESTRA = "18FrU-jbGkK-c0CeV7_xA0GLGKZS4pOeDLBS1K4XeTV4";

export const HOJAS = {
  actividad: "BDD ACTIVIDAD V02",
  permisos: "BDD PERMISOS",
  mantenimiento: "BDD MANTENIMIENTO",
  colaboradores: "BDD COLABORADORES",
} as const;

function credenciales() {
  const correo = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const llave = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (correo && llave) {
    return new google.auth.JWT({
      email: correo,
      // Las llaves llegan de la variable de entorno con los saltos de línea
      // escapados; sin deshacerlos, la firma falla.
      key: llave.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }

  const refresco = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (refresco) {
    const cliente = new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET,
    );
    cliente.setCredentials({ refresh_token: refresco });
    return cliente;
  }

  throw new Error(
    "Faltan credenciales de Google. Define GOOGLE_SERVICE_ACCOUNT_EMAIL y " +
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, o GOOGLE_OAUTH_REFRESH_TOKEN.",
  );
}

export function clienteHojas() {
  return google.sheets({ version: "v4", auth: credenciales() });
}

/**
 * Lee un rango completo y devuelve las filas en crudo.
 *
 * `UNFORMATTED_VALUE` para que las fechas lleguen como número de serie de
 * Sheets y las horas como decimal: el texto formateado depende de la
 * configuración regional del archivo y no es de fiar.
 */
export async function leerRango(
  spreadsheetId: string,
  rango: string,
): Promise<unknown[][]> {
  const hojas = clienteHojas();
  const r = await hojas.spreadsheets.values.get({
    spreadsheetId,
    range: rango,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  return (r.data.values ?? []) as unknown[][];
}

/**
 * Convierte el número de serie de Sheets a un día AAAA-MM-DD.
 *
 * La época de Sheets es el 30 de diciembre de 1899. Se calcula en UTC y se
 * devuelve solo la parte de fecha: estas celdas son días de calendario, no
 * instantes, y meterles zona horaria solo puede moverlas de día.
 */
export function serialADia(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;

  const dias = Math.floor(serial);
  const epoca = Date.UTC(1899, 11, 30);
  const fecha = new Date(epoca + dias * 86_400_000);

  const p = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${p(fecha.getUTCMonth() + 1)}-${p(fecha.getUTCDate())}`;
}

/// La parte de hora de un serial de Sheets, como minutos desde medianoche.
export function serialAMinutos(serial: number): number | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  const fraccion = serial - Math.floor(serial);
  return Math.round(fraccion * 24 * 60);
}

/**
 * Interpreta una celda de fecha, venga como venga.
 *
 * Las hojas tienen mezcla: la mayoría son seriales, pero hay filas escritas a
 * mano con texto. Se aceptan las tres formas que aparecen en los datos.
 */
export function aDia(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;

  if (typeof valor === "number") return serialADia(valor);

  const texto = String(valor).trim();
  if (!texto) return null;

  // AAAA-MM-DD (ya normalizada)
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Formato mexicano, día primero. En las hojas conviven cuatro variantes:
  // d/m/aaaa, dd/mm/aaaa, dd/mm/aa y dd-mm-aa. Se aceptan las cuatro.
  const separadas = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (separadas) {
    const dia = Number(separadas[1]);
    const mes = Number(separadas[2]);
    let anio = Number(separadas[3]);
    // Un año de dos cifras: por debajo de 70 es de este siglo. El gestor
    // arrancó en 2023, así que no hay ambigüedad real.
    if (anio < 100) anio += anio < 70 ? 2000 : 1900;
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${anio}-${p(mes)}-${p(dia)}`;
  }

  const parseada = new Date(texto);
  if (!Number.isNaN(parseada.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${parseada.getUTCFullYear()}-${p(parseada.getUTCMonth() + 1)}-${p(parseada.getUTCDate())}`;
  }

  return null;
}

/// Número tolerante: acepta "1.5", "1,5", 1.5 y devuelve null si no hay nada.
export function aNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

  const limpio = String(valor).trim().replace(",", ".");
  if (!limpio) return null;

  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/// Texto limpio, o null si la celda está vacía.
export function aTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

/**
 * Primer valor de una celda que pudo quedar con una lista concatenada.
 *
 * El script antiguo escribía a veces el arreglo entero en cada celda (ver
 * docs/MAPA-HOJAS.md), de modo que el esfuerzo puede llegar como
 * "PROYECTO,CAMBIOS,PROYECTO". Nos quedamos con el primero.
 */
export function primerValor(valor: unknown): string | null {
  const texto = aTexto(valor);
  if (texto === null) return null;
  return texto.split(",")[0].trim() || null;
}
