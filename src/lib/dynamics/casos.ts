import "server-only";

/**
 * Dynamics 365 — alta de casos de mantenimiento.
 *
 * Réplica de `crearCasoDynamics` del Apps Script (docs/scripts Gestor.gs), con
 * la misma cuenta y los mismos campos: si allí se daba de alta un caso, aquí
 * sale idéntico.
 *
 * La diferencia está en cómo se falla. El script escribía el error en un log
 * que nadie mira y seguía adelante; aquí el motivo VUELVE a la pantalla, para
 * que quien levanta el ticket sepa si su caso llegó o no.
 */

/** Cómo acabó el intento. Nunca lanza: el ticket vale aunque Dynamics falle. */
export type ResultadoDynamics =
  | { ok: true; idCaso: string }
  | { ok: false; motivo: string };

/**
 * Los datos de la cuenta, todos por variable de entorno.
 *
 * En el Apps Script el secreto estaba escrito a mano dentro del propio código
 * (`guardarCredenciales`), a la vista de cualquiera con acceso al documento.
 * Aquí no viaja con el código.
 */
function configuracion() {
  const tenant = process.env.DYNAMICS_TENANT_ID;
  const cliente = process.env.DYNAMICS_CLIENT_ID;
  const secreto = process.env.DYNAMICS_CLIENT_SECRET;
  const url = process.env.DYNAMICS_URL;
  const cuenta = process.env.DYNAMICS_CUENTA_ID;

  if (!tenant || !cliente || !secreto || !url || !cuenta) return null;
  return { tenant, cliente, secreto, url, cuenta };
}

/** ¿Está configurado? La pantalla lo usa para no prometer lo que no hará. */
export function dynamicsConfigurado(): boolean {
  return configuracion() !== null;
}

/*
 * El token dura una hora; se guarda mientras siga vivo.
 *
 * Sin esto, cada ticket pediría uno nuevo: una llamada de más a Microsoft por
 * cada alta, y más ocasiones de fallar por algo que ya se tenía.
 *
 * Se descarta un minuto antes de tiempo, para no usar uno que caduque justo
 * entre pedirlo y usarlo.
 */
let tokenEnMemoria: { valor: string; expiraEn: number } | null = null;

async function obtenerToken(): Promise<string | null> {
  const cfg = configuracion();
  if (!cfg) return null;

  if (tokenEnMemoria && Date.now() < tokenEnMemoria.expiraEn) {
    return tokenEnMemoria.valor;
  }

  const r = await fetch(
    `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: cfg.cliente,
        client_secret: cfg.secreto,
        scope: `${cfg.url}/.default`,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  const d = (await r.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };

  if (!d.access_token) {
    tokenEnMemoria = null;
    return null;
  }

  tokenEnMemoria = {
    valor: d.access_token,
    expiraEn: Date.now() + (d.expires_in ?? 3600) * 1000 - 60_000,
  };
  return d.access_token;
}

/**
 * Da de alta el caso y devuelve su id.
 *
 * Los cuatro campos fijos —área de servicio, tipo y la cuenta— son los que
 * usaba el script: Dynamics los exige y no dependen del ticket.
 */
export async function crearCasoDynamics(datos: {
  titulo: string;
  descripcion: string;
}): Promise<ResultadoDynamics> {
  const cfg = configuracion();
  if (!cfg) {
    return { ok: false, motivo: "Dynamics no está configurado en este entorno." };
  }

  let token: string | null;
  try {
    token = await obtenerToken();
  } catch (e) {
    return {
      ok: false,
      motivo: `No se pudo contactar con Microsoft: ${mensaje(e)}`,
    };
  }
  if (!token) {
    return {
      ok: false,
      motivo: "Microsoft rechazó las credenciales de Dynamics.",
    };
  }

  try {
    const r = await fetch(`${cfg.url}/api/data/v9.2/incidents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        title: datos.titulo,
        description: datos.descripcion,
        cad_area_servicio: 1,
        new_eltipodeproyectoesincidenciaosolicitud: 1,
        "customerid_account@odata.bind": `/accounts(${cfg.cuenta})`,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const cuerpo = await r.text();

    if (r.status !== 200 && r.status !== 201) {
      // El mensaje de Dynamics, no un "error 400" a secas: es lo único que
      // permite saber qué campo rechazó.
      let detalle = cuerpo.slice(0, 200);
      try {
        const j = JSON.parse(cuerpo) as { error?: { message?: string } };
        if (j.error?.message) detalle = j.error.message;
      } catch {
        /* si no es JSON, se queda el texto crudo */
      }
      return { ok: false, motivo: `Dynamics respondió ${r.status}: ${detalle}` };
    }

    const j = JSON.parse(cuerpo) as { incidentid?: string };
    if (!j.incidentid) {
      return { ok: false, motivo: "Dynamics aceptó el caso pero no devolvió su id." };
    }

    return { ok: true, idCaso: j.incidentid };
  } catch (e) {
    return { ok: false, motivo: `No se pudo crear el caso: ${mensaje(e)}` };
  }
}

function mensaje(e: unknown): string {
  if (e instanceof Error) {
    // `AbortSignal.timeout` lanza este nombre; "TimeoutError" no dice nada.
    if (e.name === "TimeoutError") return "tardó demasiado en responder";
    return e.message;
  }
  return String(e);
}
