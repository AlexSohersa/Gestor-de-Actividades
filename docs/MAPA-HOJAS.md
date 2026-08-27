# Mapa de las hojas del gestor antiguo

Fuente: `docs/scripts Gestor.gs` (el Apps Script del gestor de spreadsheets).
Este documento existe para que la ingesta sepa qué columna es qué, y para dejar
constancia de las trampas que tiene el formato original.

Spreadsheet maestro: `18FrU-jbGkK-c0CeV7_xA0GLGKZS4pOeDLBS1K4XeTV4`
(«SOH-SI-BD_BASES DE DATOS»).

---

## BDD ACTIVIDAD V02

| Col | Letra | Dato |
|-----|-------|------|
| 1  | A | FECHA |
| 2  | B | COLABORADOR (nombre, MAYÚSCULAS) |
| 3  | C | HORAS |
| 4  | D | PROYECTO (la constante `AUSENCIAS` cuando la fila es un permiso) |
| 5  | E | ENTREGABLE (vacío en ausencias) |
| 6  | F | DISCIPLINA (vacío en ausencias) |
| 7  | G | TIPO de actividad (o tipo de permiso) |
| 8  | H | COMENTARIOS |
| 9  | I | ¿PAGAR? |
| 10 | J | ENVÍO: `NORMAL` · `EXTRA` · `AUSENCIA` |
| 11 | K | **AMBIGUA — depende de J. Ver abajo.** |
| 12 | L | ESFUERZO (solo en filas `NORMAL`) |

### La columna K es ambigua

El script tiene un error real (dos `setValues` seguidos sobre la misma columna,
el segundo pisa al primero) que hace que K signifique cosas distintas:

- `J = NORMAL`   → K vacía. El esfuerzo está en L.
- `J = EXTRA`    → K contiene el **ESFUERZO** (no el coordinador), y L queda vacía.
- `J = AUSENCIA` → K contiene el **COORDINADOR** que aprobó. A veces con varios
  nombres concatenados por coma, por otro fallo del mismo tipo.

La ingesta resuelve K según J. No se puede leer la columna sin mirar antes el
tipo de envío.

### El esfuerzo puede venir concatenado

Al reportar varias líneas de golpe, el script escribía el arreglo completo de
esfuerzos en cada celda de L. Una celda puede contener `PROYECTO,CAMBIOS,PROYECTO`
en vez de un solo valor. La ingesta se queda con el primer valor reconocido.

---

## BDD PERMISOS

| Col | Letra | Dato |
|-----|-------|------|
| 1 | A | SOLICITANTE |
| 2 | B | TIPO DE PERMISO |
| 3 | C | FECHA |
| 4 | D | HORAS A AUSENTARSE |
| 5 | E | RAZÓN |
| 6 | F | ¿AUTORIZADO? |
| 7 | G | ¿PAGADO? (siempre igual a F; no son campos independientes) |
| 8 | H | COORDINADOR |
| 9 | I | PERIODO de liberación (solo si el tipo es VACACIONES) |

Una fila por DÍA, no por solicitud: una ausencia de tres días aparece tres veces.
La ingesta las vuelve a agrupar en una sola ausencia con rango.

---

## BDD MANTENIMIENTO (tickets)

| Col | Letra | Dato |
|-----|-------|------|
| 1 | A | FECHA (instante del reporte) |
| 2 | B | CÓDIGO de equipo |
| 3 | C | COLABORADOR |
| 4 | D | TIPO DE FALLA (SOFTWARE / HARDWARE) |
| 5 | E | PROBLEMA |
| 6 | F | DESCRIPCIÓN |
| 7 | G | PRIORIDAD |

---

## CHECK HO (home office)

Spreadsheet `1kESIhWsCT9NfFzk_yiSq_Mac8M7CyPl2QQWAOwAsH_w`, hoja `CHECK HO`,
datos desde la fila 2.

| Col | Letra | Dato |
|-----|-------|------|
| 1 | A | Número de colaborador |
| 2 | B | Nombre |
| 3 | C | Fecha |
| 4 | D | Hora de entrada |
| 5 | E | Hora de salida |

Las horas se guardaban con la época de Sheets (`1899-12-30`).

Regla del gestor antiguo: si no había fila del día y era pasada la 15:30, se
creaba directamente con hora de salida y sin entrada.

---

## Lo que NO está en la BDD maestra

- **Horas de cursos**: van a otro archivo
  (`1PGcjyibuUmwWLEnpr9z1zarW4MKuBfHiIekOrI49Amk`, hoja `HORAS CURSOS`) y nunca
  llegaron a BDD ACTIVIDAD. Si se quieren, hay que importarlas aparte.
- **Los topes de jornada** (`REPORTE DIARIO!AI3`) y las horas ya reportadas
  (`U2`) eran fórmulas dentro de cada gestor personal, no datos del script. En
  esta herramienta el tope sale de `core.persona.horas_dia` y las horas ya
  reportadas, de una suma sobre `actividad.hora`.
- **La escala de antigüedad** para calcular periodos de vacaciones vive en
  `12MsH2hPwSe7DrubXhXCl1oKTg1rU4AuKgFwnM-ZoiJg`, hojas `ESCALA ANTIGÜEDAD` e
  `INFORMACION POR COLABORADOR`.

---

## Dos cosas que conviene atender

1. **Secreto expuesto**: `guardarCredenciales()` (al final del script) tiene en
   texto plano el tenant, el client id y el *client secret* de Dynamics.
   Cualquiera con permiso de edición sobre cualquier copia del gestor puede
   leerlo. Conviene rotar ese secreto y guardarlo en Script Properties.

2. **Aprobador final hardcodeado**: el nombre «MATEO CAÑOLA» está escrito en el
   código como aprobador final de permisos. Esa persona ya no está en el padrón
   (`core.persona`), así que ese circuito quedaría sin destinatario. En esta
   herramienta el aprobador sale de `core.persona.coordinador_id`.
