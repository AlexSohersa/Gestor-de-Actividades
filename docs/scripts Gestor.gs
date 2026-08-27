var archivoGestor = SpreadsheetApp.getActiveSpreadsheet();
var sheetReporteDiario = archivoGestor.getSheetByName('REPORTE DIARIO');
var sheetReporteExtras = archivoGestor.getSheetByName('REPORTE EXTRAS');
var sheetAprobacionExtras = archivoGestor.getSheetByName('APROBACIÓN EXTRAS');
var sheetBasesDeDatos = archivoGestor.getSheetByName('BASES DE DATOS');
var sheetPermisos = archivoGestor.getSheetByName('PERMISOS');
var sheetAprobacionPermisos = archivoGestor.getSheetByName('APROBACIÓN PERMISOS');
var sheetCompromisos = archivoGestor.getSheetByName('COMPROMISOS');
var sheetLicencias = archivoGestor.getSheetByName('LICENCIAS');
var sheetMantenimiento = archivoGestor.getSheetByName('MANTENIMIENTO');

var archivoBDD = SpreadsheetApp.openById('18FrU-jbGkK-c0CeV7_xA0GLGKZS4pOeDLBS1K4XeTV4');
var sheetBDDActividad = archivoBDD.getSheetByName('BDD ACTIVIDAD V02');
var sheetBDDPermisos = archivoBDD.getSheetByName('BDD PERMISOS');

var archivoCompromisos = SpreadsheetApp.openById('1F9D7UoyXWqcmJ-M-Vew-qXerD3ZikVeGekaeveQgG5Q');
var sheetGestionCompromisos = archivoCompromisos.getSheetByName('GESTIÓN');

var archivoGestionLicencias = SpreadsheetApp.openById('1auhWchmMo64UOXUMbXuGdLfkDy9hjyieKw42R2s8OYg');
var sheetDatosLicencias = archivoGestionLicencias.getSheetByName('GESTIONAR LICENCIAS');
var sheetDatosUso = archivoGestionLicencias.getSheetByName('DATOS DE USO');

var colaborador = sheetReporteDiario.getRange('B3').getValue();



-----------reporte horas------------
function reportarHoras() {

    var ui = SpreadsheetApp.getUi();

    var fecha = sheetReporteDiario.getRange('C6').getValue();
    var fechaTxt = sheetReporteDiario.getRange('C6').getDisplayValue();
    var proyecto = sheetReporteDiario.getRange('B6').getValue();
    var entregables = sheetReporteDiario.getRange('B9:B13').getValues().filter(elemento => elemento != "");
    var tipos = sheetReporteDiario.getRange('C9:C13').getValues().filter(elemento => elemento != "");
    var esfuerzos = sheetReporteDiario.getRange('D9:D13').getValues().filter(elemento => elemento != "");
    var horas = sheetReporteDiario.getRange('E9:E13').getValues().filter(elemento => elemento != "");
    var horasAnteriores = sheetReporteDiario.getRange('U2').getValue();
    var horasPermitidas = sheetReporteDiario.getRange('AI3').getValue();
    var comentarios = sheetReporteDiario.getRange('F9:F13').getValues().filter(elemento => elemento != "");

    var arrayDisciplinas = sheetBasesDeDatos.getRange('V3:V').getValues().filter(elemento => elemento != "").flat();
    var arrayEntregables = sheetBasesDeDatos.getRange('W3:W').getValues().filter(elemento => elemento != "").flat();

    if (entregables[0] == null) { } else { var disciplina1 = arrayDisciplinas[arrayEntregables.indexOf(entregables[0].toString())]; }
    if (entregables[1] == null) { } else { var disciplina2 = arrayDisciplinas[arrayEntregables.indexOf(entregables[1].toString())]; }
    if (entregables[2] == null) { } else { var disciplina3 = arrayDisciplinas[arrayEntregables.indexOf(entregables[2].toString())]; }
    if (entregables[3] == null) { } else { var disciplina4 = arrayDisciplinas[arrayEntregables.indexOf(entregables[3].toString())]; }
    if (entregables[4] == null) { } else { var disciplina5 = arrayDisciplinas[arrayEntregables.indexOf(entregables[4].toString())]; }

    var disciplinas = [disciplina1, disciplina2, disciplina3, disciplina4, disciplina5].filter(elemento => elemento != null).map(disciplina => [disciplina]);

    if (entregables.length != disciplinas.length) {
        ui.alert('ERROR', 'Has cometido un error en tu registro. Recuerda que no puedes reportar actividad a diferentes proyectos en un solo click al botón. Si el problema persiste solicita asistencia.', ui.ButtonSet.OK)
    } else if (horas.length == 0) {
        ui.alert('ERROR', 'Estás intentando reportar CERO horas.', ui.ButtonSet.OK)
    } else if (fecha == "" || proyecto == "") {
        ui.alert('ERROR', 'Has omitido información.', ui.ButtonSet.OK)
    } else if (entregables.length != tipos.length || horas.length != esfuerzos.length || horas.length != comentarios.length || horas.length != tipos.length || entregables.length != comentarios.length) {
        ui.alert('ERROR', 'Has omitido información en alguna fila.', ui.ButtonSet.OK)
    } else if (fechaTxt.includes('domingo') == true || fechaTxt.includes('sábado') == true) {
        ui.alert('ERROR', 'Estás intentando reportar actividad en un día no laboral. Si deseas hacerlo deberá ser a través de la pestaña REPORTE EXTRAS', ui.ButtonSet.OK)
    } else {
        var sumahoras = horas.flat().reduce(function sumar(anterior, actual) { return anterior + actual; })
        if (sumahoras + horasAnteriores > horasPermitidas) {
            ui.alert('ERROR', 'Estás intentando reportar más horas de las permitidas. Deberás reportar las horas extras desde la pestaña correspondiente.', ui.ButtonSet.OK)
        } else {

            var check = ui.alert('ADVERTENCIA.', 'Se reportarán ' + sumahoras + ' horas para el día ' + fechaTxt, ui.ButtonSet.OK_CANCEL);
            if (check == 'CANCEL') { } else {
                var filaBDDActividad = sheetBDDActividad.getLastRow() + 1;
                sheetBDDActividad.getRange(filaBDDActividad, 1, entregables.length, 1).setValue(fecha);
                sheetBDDActividad.getRange(filaBDDActividad, 2, entregables.length, 1).setValue(colaborador);
                sheetBDDActividad.getRange(filaBDDActividad, 3, entregables.length, 1).setValues(horas);
                sheetBDDActividad.getRange(filaBDDActividad, 4, entregables.length, 1).setValue(proyecto);
                sheetBDDActividad.getRange(filaBDDActividad, 5, entregables.length, 1).setValues(entregables);
                sheetBDDActividad.getRange(filaBDDActividad, 6, entregables.length, 1).setValues(disciplinas);
                sheetBDDActividad.getRange(filaBDDActividad, 7, entregables.length, 1).setValues(tipos);
                sheetBDDActividad.getRange(filaBDDActividad, 8, entregables.length, 1).setValues(comentarios);
                sheetBDDActividad.getRange(filaBDDActividad, 9, entregables.length, 1).setValue('PAGADO');
                sheetBDDActividad.getRange(filaBDDActividad, 10, entregables.length, 1).setValue('NORMAL');
                sheetBDDActividad.getRange(filaBDDActividad, 12, entregables.length, 1).setValue(esfuerzos);

                sheetReporteDiario.getRange('B9:F13').clearContent();
                sheetReporteDiario.getRange('B6').clearContent();
                sheetReporteDiario.getRange('C6').setFormula('=TODAY()')

                ui.alert('ÉXITO.', 'Se han reportado ' + sumahoras + ' horas para el día ' + fechaTxt, ui.ButtonSet.OK)
            }
        }
    }
}


--------reporte horas extra-------------
function reportarHorasExtra() {

  var ui = SpreadsheetApp.getUi();

  var checkCursos = sheetReporteExtras.getRange('G6').getValue();

  var fecha = sheetReporteExtras.getRange('C6').getValue();
  var fechaTxt = sheetReporteExtras.getRange('C6').getDisplayValue();
  var proyecto = sheetReporteExtras.getRange('B6').getValue();
  var coordinador = sheetReporteExtras.getRange('F6').getValue();
  var entregables = sheetReporteExtras.getRange('B9').getValue();
  var tipos = sheetReporteExtras.getRange('C9').getValue();
  var esfuerzos = sheetReporteExtras.getRange('D9').getValue();
  var horas = sheetReporteExtras.getRange('E9').getValue();
  var comentarios = sheetReporteExtras.getRange('F9').getValue();


  var arrayDisciplinas = sheetBasesDeDatos.getRange('AB3:AB').getValues().filter(elemento => elemento != "").flat();
  var arrayEntregables = sheetBasesDeDatos.getRange('AC3:AC').getValues().filter(elemento => elemento != "").flat();

  var disciplinas = arrayDisciplinas[arrayEntregables.indexOf(entregables.toString())];

  if (horas == 0) {
    ui.alert('ERROR', 'Estás intentando reportar CERO horas.', ui.ButtonSet.OK)
  } else if (coordinador == "" && checkCursos == false) {
    ui.alert('ERROR', 'Has omitido el campo "Enviar a"', ui.ButtonSet.OK)
  } else if (fecha == "" || proyecto == "") {
    ui.alert('ERROR', 'Has omitido información.', ui.ButtonSet.OK)
  } else if (entregables == "" || tipos == "" || horas == "" || comentarios == "") {
    ui.alert('ERROR', 'Has omitido información en alguna fila.', ui.ButtonSet.OK)
  } else {

    if (checkCursos == false) {

      var check = ui.alert('ADVERTENCIA.', 'Se reportarán ' + horas + ' horas EXTRA para el día ' + fechaTxt, ui.ButtonSet.OK_CANCEL);
      if (check == 'CANCEL') { } else {

        var archivoCoordinador = DriveApp.getFolderById('1sLEugTNTiZtr09eaywwKF4wCTv3fG9Mf').getFilesByName('SOH-SI-FO_' + coordinador + '_GESTOR DE ACTIVIDAD').next();
        var sheetAprobarHorasExtra = SpreadsheetApp.openById(archivoCoordinador.getId()).getSheetByName('APROBACIÓN EXTRAS');

        var filaAprobarHorasExtra = sheetAprobarHorasExtra.getLastRow() + 1;
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 3, 1, 1).setValue(fecha);
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 4, 1, 1).setValue(colaborador);
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 5, 1, 1).setValue(proyecto);
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 6, 1, 1).setValue(entregables);
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 7, 1, 1).setValue(disciplinas);
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 8, 1, 1).setValue(tipos);
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 9, 1, 1).setValue(esfuerzos);
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 10, 1, 1).setValue(horas);
        sheetAprobarHorasExtra.getRange(filaAprobarHorasExtra, 11, 1, 1).setValue(comentarios);

        sheetReporteExtras.getRange('B9:F9').clearContent();
        sheetReporteExtras.getRange('B6').clearContent();
        sheetReporteExtras.getRange('F6').clearContent();
        sheetReporteExtras.getRange('C6').setFormula('=TODAY()');

        ui.alert('ÉXITO.', 'Horas extras enviadas a ' + coordinador + ' para su aprobación.', ui.ButtonSet.OK)
      }
    } else {



      var check = ui.alert('ADVERTENCIA.', 'Estás a punto de reportar ' + horas + ' horas EXTRA trabajadas en CURSOS para el día ' + fechaTxt, ui.ButtonSet.OK_CANCEL);
      if (check == 'CANCEL') { } else {

        var sheetHorasCurso = SpreadsheetApp.openById('1PGcjyibuUmwWLEnpr9z1zarW4MKuBfHiIekOrI49Amk').getSheetByName('HORAS CURSOS');
        var filaColocar = sheetHorasCurso.getRange('L5:L300').getValues().filter(elemento => elemento != "").length + 5;

        sheetHorasCurso.getRange(filaColocar, 11, 1, 1).setValue(fecha);
        sheetHorasCurso.getRange(filaColocar, 12, 1, 1).setValue(colaborador);
        sheetHorasCurso.getRange(filaColocar, 13, 1, 1).setValue(proyecto);
        sheetHorasCurso.getRange(filaColocar, 14, 1, 1).setValue(entregables);
        sheetHorasCurso.getRange(filaColocar, 15, 1, 1).setValue(disciplinas);
        sheetHorasCurso.getRange(filaColocar, 16, 1, 1).setValue(tipos);
        sheetHorasCurso.getRange(filaColocar, 17, 1, 1).setValue(esfuerzos);
        sheetHorasCurso.getRange(filaColocar, 18, 1, 1).setValue(horas);
        sheetHorasCurso.getRange(filaColocar, 19, 1, 1).setValue(comentarios);

        sheetReporteExtras.getRange('B9:F9').clearContent();
        sheetReporteExtras.getRange('B6').clearContent();
        sheetReporteExtras.getRange('F6').clearContent();
        sheetReporteExtras.getRange('C6').setFormula('=TODAY()');
        sheetReporteExtras.getRange('G6').setValue(false);

      }
    }
  }
}

---------AprobarHorasExtra-----------------
function aprobarHorasExtra() {

  var ui = SpreadsheetApp.getUi();

  var aprobar = sheetAprobacionExtras.getRange('B6:B').getValues().filter(elemento => elemento != "");
  var fechas = sheetAprobacionExtras.getRange('C6:C').getValues().filter(elemento => elemento != "");
  var colaboradores = sheetAprobacionExtras.getRange('D6:D').getValues().filter(elemento => elemento != "");
  var proyectos = sheetAprobacionExtras.getRange('E6:E').getValues().filter(elemento => elemento != "");
  var entregables = sheetAprobacionExtras.getRange('F6:F').getValues().filter(elemento => elemento != "");
  var disciplinas = sheetAprobacionExtras.getRange('G6:G').getValues().filter(elemento => elemento != "");
  var tipos = sheetAprobacionExtras.getRange('H6:H').getValues().filter(elemento => elemento != "");
  var esfuerzos = sheetAprobacionExtras.getRange('I6:I').getValues().filter(elemento => elemento != "");
  var horas = sheetAprobacionExtras.getRange('J6:J').getValues().filter(elemento => elemento != "");
  var justificaciones = sheetAprobacionExtras.getRange('K6:K').getValues().filter(elemento => elemento != "");
  var coordinadores = sheetAprobacionExtras.getRange(6,12,sheetAprobacionExtras.getLastRow()-5,1).getValues();

  if (aprobar.length != fechas.length || aprobar.length != colaboradores.length || aprobar.length != horas.length || aprobar.length != entregables.length) {
    ui.alert('ERROR', 'Has omitido la aprobación de algún reporte.', ui.ButtonSet.OK)
  } else {
    
    var check = Browser.inputBox('AUTENTICACIÓN REQUERIDA.\n\nEstás a punto de enviar la aprobación/rechazo de las horas extras que te fueron enviadas a revisión hasta el día de hoy. Esta acción no puede deshacerse.\n\n Para confirmar la aprobación/rechazo de las horas, ingresa la contraseña de coordinación.');
    if (check != sheetBasesDeDatos.getRange('BW3').getValue()) { ui.alert('CONTRASEÑA INCORRECTA.', 'Vuelve a intentarlo.', ui.ButtonSet.OK) } else {
      var filaBDDActividad = sheetBDDActividad.getLastRow() + 1;
      sheetBDDActividad.getRange(filaBDDActividad, 1, entregables.length, 1).setValues(fechas);
      sheetBDDActividad.getRange(filaBDDActividad, 2, entregables.length, 1).setValues(colaboradores);
      sheetBDDActividad.getRange(filaBDDActividad, 3, entregables.length, 1).setValues(horas);
      sheetBDDActividad.getRange(filaBDDActividad, 4, entregables.length, 1).setValues(proyectos);
      sheetBDDActividad.getRange(filaBDDActividad, 5, entregables.length, 1).setValues(entregables);
      sheetBDDActividad.getRange(filaBDDActividad, 6, entregables.length, 1).setValues(disciplinas);
      sheetBDDActividad.getRange(filaBDDActividad, 7, entregables.length, 1).setValues(tipos);
      sheetBDDActividad.getRange(filaBDDActividad, 8, entregables.length, 1).setValues(justificaciones);
      sheetBDDActividad.getRange(filaBDDActividad, 9, entregables.length, 1).setValues(aprobar);
      sheetBDDActividad.getRange(filaBDDActividad, 10, entregables.length, 1).setValue('EXTRA');
      sheetBDDActividad.getRange(filaBDDActividad, 11, entregables.length, 1).setValues(coordinadores);
      sheetBDDActividad.getRange(filaBDDActividad, 11, entregables.length, 1).setValues(esfuerzos);
      sheetAprobacionExtras.getRange('B6:L').clearContent();

      ui.alert('ÉXITO.', 'Los datos de horas extra han sido enviados a la base de datos maestra.', ui.ButtonSet.OK)
    }
  }
}

---------enviarPermisoASegundoFiltro---------------
function enviarPermisoASegundoFiltro() {

  var ui = SpreadsheetApp.getUi();

  var aprobadorFinal = 'MATEO CAÑOLA' // COLOCA AQUI EL NOMBRE DE USUARIO DE LA PERSONA ENCARGADA DEL SEGUNDO FILTRO DE AUTORIZACIÒN DE HORAS EXTRAS, TAL Y COMO APARECE EN SU ARCHIVO GESTOR DE ACTIVIDAD PERSONAL, ANTES DEL _.
                                      // ASEGÙRATE DE QUE LA PERSONA DESIGNADA COMO APROBADORFINAL TENGA UNA COLUMNA EXTRA A LA DERECHA (COLUMNA K) EN EL GRÀFICO DE LA PESTAÑA APROBACIÒN EXTRAS, YA QUE EN ELLA APARECERA EL COORDINADOR QUE FUNGIO COMO PRIMER FILTRO.

  var aprobar = sheetAprobacionPermisos.getRange('B6:B').getValues().filter(elemento => elemento != "");
  var nombres = sheetAprobacionPermisos.getRange('C6:C').getValues().filter(elemento => elemento != "");
  var tipoPermiso = sheetAprobacionPermisos.getRange('D6:D').getValues().filter(elemento => elemento != "");
  var fecha = sheetAprobacionPermisos.getRange('E6:E').getValues().filter(elemento => elemento != "");
  var horasAusentarse = sheetAprobacionPermisos.getRange('F6:F').getValues().filter(elemento => elemento != "");
  var razonAusencia = sheetAprobacionPermisos.getRange('G6:G').getValues().filter(elemento => elemento != "");
  

  if (aprobar.length != nombres.length || aprobar.length != tipoPermiso.length || aprobar.length != horasAusentarse.length || aprobar.length != fecha.length || aprobar.length != razonAusencia.length) {
    ui.alert('ERROR', 'Has omitido la aprobación de algún permiso.', ui.ButtonSet.OK)
  } else {

    var check = Browser.inputBox('AUTENTICACIÓN REQUERIDA.\n\nEstás a punto de enviar la aprobación/rechazo de las horas extras que te fueron enviadas a revisión hasta el día de hoy. Esta acción no puede deshacerse.\n\n Para confirmar la aprobación/rechazo de las horas, ingresa la contraseña de coordinación.');
    if (check != sheetBasesDeDatos.getRange('BW2').getValue()) { ui.alert('CONTRASEÑA INCORRECTA.', 'Vuelve a intentarlo.', ui.ButtonSet.OK) } else {
      var archivoCoordinador = DriveApp.getFolderById('111BAUBubLOrQC47LLCAmHuGeBYPUreRy').getFilesByName(aprobadorFinal + '_GESTOR DE ACTIVIDAD').next();
      var sheetAprobarPermisos = SpreadsheetApp.openById(archivoCoordinador.getId()).getSheetByName('APROBACIÓN PERMISOS');

      var filaAprobarPermisos = sheetAprobarPermisos.getLastRow() + 1;
      sheetAprobarPermisos.getRange(filaAprobarPermisos, 2, aprobar.length, 1).setValues(aprobar);
      sheetAprobarPermisos.getRange(filaAprobarPermisos, 3, aprobar.length, 1).setValues(nombres);
      sheetAprobarPermisos.getRange(filaAprobarPermisos, 4, aprobar.length, 1).setValues(tipoPermiso);
      sheetAprobarPermisos.getRange(filaAprobarPermisos, 5, aprobar.length, 1).setValues(fecha);
      sheetAprobarPermisos.getRange(filaAprobarPermisos, 6, aprobar.length, 1).setValues(horasAusentarse);
      sheetAprobarPermisos.getRange(filaAprobarPermisos, 7, aprobar.length, 1).setValues(razonAusencia);
      sheetAprobarPermisos.getRange(filaAprobarPermisos, 8, aprobar.length, 1).setValue(colaborador);

      sheetAprobacionPermisos.getRange('B6:G').clearContent();

      ui.alert('ÉXITO.', 'Solicitudes enviadas a ' + aprobadorFinal + ' para su aprobación final.', ui.ButtonSet.OK)
    }
  }
}

-----aprobar permisos---
// ============================================================
// NUEVO: IDs necesarios para calcular el período de vacaciones
// ============================================================
var ID_CALCULO_ANTIGUEDAD = '12MsH2hPwSe7DrubXhXCl1oKTg1rU4AuKgFwnM-ZoiJg';
var FOLDER_GESTORES       = '1sLEugTNTiZtr09eaywwKF4wCTv3fG9Mf';

function aprobarPermisos() {

  var ui = SpreadsheetApp.getUi();

  var aprobar         = sheetAprobacionPermisos.getRange('B6:B').getValues().filter(elemento => elemento != "");
  var nombres         = sheetAprobacionPermisos.getRange('C6:C').getValues().filter(elemento => elemento != "");
  var tipoPermiso     = sheetAprobacionPermisos.getRange('D6:D').getValues().filter(elemento => elemento != "");
  var fechas          = sheetAprobacionPermisos.getRange('E6:E').getValues().filter(elemento => elemento != "");
  var fechasTxt       = sheetAprobacionPermisos.getRange('E6:E').getDisplayValues().filter(elemento => elemento != "");
  var horasAusentarse = sheetAprobacionPermisos.getRange('F6:F').getValues().filter(elemento => elemento != "");
  var razonAusencia   = sheetAprobacionPermisos.getRange('G6:G').getValues().filter(elemento => elemento != "");
  var coordinadores   = sheetAprobacionPermisos.getRange(6, 8, sheetAprobacionPermisos.getLastRow() - 5, 1).getValues();

  if (aprobar.length != nombres.length || aprobar.length != tipoPermiso.length || aprobar.length != fechas.length || aprobar.length != horasAusentarse.length) {
    ui.alert('ERROR', 'Has omitido la aprobación de algún reporte.', ui.ButtonSet.OK);
  } else {

    var check = Browser.inputBox('AUTENTICACIÓN REQUERIDA.\n\nEstás a punto de enviar la aprobación/rechazo de las horas extras que te fueron enviadas a revisión hasta el día de hoy. Esta acción no puede deshacerse.\n\n Para confirmar la aprobación/rechazo de las horas, ingresa la contraseña de coordinación.');
    if (check != sheetBasesDeDatos.getRange('BW3').getValue()) {
      ui.alert('CONTRASEÑA INCORRECTA.', 'Vuelve a intentarlo.', ui.ButtonSet.OK);
    } else {

      // ── NUEVO: Construir mapa HASTA → período desde ESCALA ANTIGÜEDAD ──
      var ssAntiguedad = SpreadsheetApp.openById(ID_CALCULO_ANTIGUEDAD);
      var sheetEscala  = ssAntiguedad.getSheetByName('ESCALA ANTIGÜEDAD');
      var dataEscala   = sheetEscala.getRange(3, 1, sheetEscala.getLastRow() - 2, 7).getValues();
      var mapaHasta    = {};
      for (var e = 0; e < dataEscala.length; e++) {
        var per  = Number(dataEscala[e][2]); // col C = POR PERIODOS DE LIBERACIÓN
        var hast = Number(dataEscala[e][6]); // col G = HASTA
        if (!hast || !per) continue;
        if (!(hast in mapaHasta) || per > mapaHasta[hast]) mapaHasta[hast] = per;
      }

      // ── NUEVO: Cargar fechas de arranque de cada colaborador ──
      var sheetInfoColab = ssAntiguedad.getSheetByName('INFORMACION POR COLABORADOR');
      var dataInfoColab  = sheetInfoColab.getRange(3, 1, sheetInfoColab.getLastRow() - 2, 3).getValues();
      var arranqueCache  = {};
      for (var k = 0; k < dataInfoColab.length; k++) {
        var nom = dataInfoColab[k][1].toString().trim(); // col B = NOMBRE DE USUARIO
        var fec = dataInfoColab[k][2];                   // col C = FECHA DE ARRANQUE
        if (nom && fec) arranqueCache[nom] = new Date(fec);
      }

      // ── NUEVO: calcularPeriodo() ──────────────────────────────
      function calcularPeriodo(arranque, fechaVenc) {
        var anios = (new Date(fechaVenc) - new Date(arranque)) / (1000 * 60 * 60 * 24 * 365.25);
        var hasta = Math.round(anios * 2) / 2;
        return mapaHasta[hasta] !== undefined ? Math.floor(mapaHasta[hasta]) : Math.floor(hasta);
      }

      // ── NUEVO: Cache de gestores (abre cada gestor solo una vez) ─
      var gestorCache = {};
      function getPeriodosDeGestor(nombre) {
        if (gestorCache[nombre] !== undefined) return gestorCache[nombre];
        var periodos = [];
        try {
          var archs = DriveApp.getFolderById(FOLDER_GESTORES)
            .getFilesByName('SOH-SI-FO_' + nombre + '_GESTOR DE ACTIVIDAD');
          if (!archs.hasNext()) { gestorCache[nombre] = periodos; return periodos; }
          var sheetPerm    = SpreadsheetApp.openById(archs.next().getId()).getSheetByName('PERMISOS');
          var fechaArranque = arranqueCache[nombre];
          [{ d: 'H13', f: 'J13' }, { d: 'H15', f: 'J15' }].forEach(function(b) {
            var dias  = Number(sheetPerm.getRange(b.d).getValue());
            var fecha = sheetPerm.getRange(b.f).getValue();
            if (dias > 0 && fecha && fechaArranque) {
              periodos.push({ fechaVenc: new Date(fecha), dias: Math.round(dias), periodo: calcularPeriodo(fechaArranque, fecha) });
            }
          });
          periodos.sort(function(a, b) { return a.fechaVenc - b.fechaVenc; });
        } catch(e) { Logger.log('Error gestor ' + nombre + ': ' + e.message); }
        gestorCache[nombre] = periodos;
        return periodos;
      }

      // ── NUEVO: Tracker de consumo (descuenta 1 día por fila) ─────
      var consumoTracker = {};
      function getPeriodoVacacion(nombre) {
        var n = nombre.toString().trim();
        if (!consumoTracker[n]) {
          consumoTracker[n] = getPeriodosDeGestor(n).map(function(p) { return { dias: p.dias, periodo: p.periodo }; });
        }
        var bloques = consumoTracker[n];
        for (var p = 0; p < bloques.length; p++) {
          if (bloques[p].dias > 0) { bloques[p].dias--; return bloques[p].periodo; }
        }
        return '';
      }

      // ── NUEVO: Calcular período por cada fila ─────────────────────
      var periodosPorFila = [];
      for (var i = 0; i < aprobar.length; i++) {
        var per = '';
        if (tipoPermiso[i][0].toString().trim().toUpperCase() === 'VACACIONES') {
          per = getPeriodoVacacion(nombres[i][0].toString().trim());
        }
        periodosPorFila.push([per]);
      }

      // ── Escribir en BDD ACTIVIDAD (igual que antes) ───────────────
      var filaBDDActividad = sheetBDDActividad.getLastRow() + 1;
      sheetBDDActividad.getRange(filaBDDActividad, 1, aprobar.length, 1).setValues(fechas);
      sheetBDDActividad.getRange(filaBDDActividad, 2, aprobar.length, 1).setValues(nombres);
      sheetBDDActividad.getRange(filaBDDActividad, 3, aprobar.length, 1).setValues(horasAusentarse);
      sheetBDDActividad.getRange(filaBDDActividad, 4, aprobar.length, 1).setValue('AUSENCIAS');
      sheetBDDActividad.getRange(filaBDDActividad, 7, aprobar.length, 1).setValues(tipoPermiso);
      sheetBDDActividad.getRange(filaBDDActividad, 8, aprobar.length, 1).setValues(razonAusencia);
      sheetBDDActividad.getRange(filaBDDActividad, 9, aprobar.length, 1).setValues(aprobar);
      sheetBDDActividad.getRange(filaBDDActividad, 10, aprobar.length, 1).setValue('AUSENCIA');
      sheetBDDActividad.getRange(filaBDDActividad, 11, aprobar.length, 1).setValue(coordinadores);

      // ── Escribir en BDD PERMISOS (igual que antes + col I nueva) ──
      var filaBDDPermisos = sheetBDDPermisos.getLastRow() + 1;
      sheetBDDPermisos.getRange(filaBDDPermisos, 1, aprobar.length, 1).setValues(nombres);
      sheetBDDPermisos.getRange(filaBDDPermisos, 2, aprobar.length, 1).setValues(tipoPermiso);
      sheetBDDPermisos.getRange(filaBDDPermisos, 3, aprobar.length, 1).setValues(fechas);
      sheetBDDPermisos.getRange(filaBDDPermisos, 4, aprobar.length, 1).setValues(horasAusentarse);
      sheetBDDPermisos.getRange(filaBDDPermisos, 5, aprobar.length, 1).setValues(razonAusencia);
      sheetBDDPermisos.getRange(filaBDDPermisos, 6, aprobar.length, 1).setValues(aprobar);
      sheetBDDPermisos.getRange(filaBDDPermisos, 7, aprobar.length, 1).setValues(aprobar);
      sheetBDDPermisos.getRange(filaBDDPermisos, 8, aprobar.length, 1).setValues(coordinadores);
      sheetBDDPermisos.getRange(filaBDDPermisos, 9, aprobar.length, 1).setValues(periodosPorFila); // NUEVO: col I = PERÍODO LIBERACIÓN

      // ── Correos ─────────────────────────────────
      for (var i = 0; i <= aprobar.length - 1; i++) {
        var arrayNombres = sheetBasesDeDatos.getRange('AH3:AH').getValues().filter(elemento => elemento != "").flat();
        var arrayCorreos = sheetBasesDeDatos.getRange('AJ3:AJ').getValues().filter(elemento => elemento != "").flat();
        var correo = arrayCorreos[arrayNombres.indexOf(nombres[i].toString())];
        MailApp.sendEmail({
          to      : correo,
          subject : 'TU SOLICITUD DE ' + tipoPermiso[i] + ' FUE ' + aprobar[i],
          body    : 'Hola ' + nombres[i] + ',\n\nTu solicitud de ' + tipoPermiso[i] + ' para el día ' + fechasTxt[i] + ' fue ' + aprobar[i] + '.\n\nSi crees que se trata de un error o estás inconforme con el estatus acércate directamente a tu coordinador.',
        });
      }

      sheetAprobacionPermisos.getRange('B6:H').clearContent();

      ui.alert('ÉXITO.', 'Los datos de solicitudes han sido enviados a la base de datos maestra.', ui.ButtonSet.OK);
    }
  }
}

----duplicar archivos-------------
function duplicarArchivos() {
  // ID del archivo que deseas duplicar (obtén esto de la URL del archivo)
  var archivoOriginalId = "15EltoPIznu_7b055Kh6y4yorAkL6hTq-IwtMcGV6hfU";

  // Nombres que asignarás (reemplázalos con los nombres que desees)
  var nombresSheet = SpreadsheetApp.openById("18FrU-jbGkK-c0CeV7_xA0GLGKZS4pOeDLBS1K4XeTV4").getSheetByName('BDD COLABORADORES');
  var nombres = nombresSheet.getRange(2,4,nombresSheet.getLastRow()-1,1).getValues();

  // Obtiene el archivo original
  var archivoOriginal = DriveApp.getFileById(archivoOriginalId);

  // Itera sobre los nombres y crea las copias
  for (var i = 0; i < nombres.length; i++) {
    // Crea una copia del archivo original
    var copiaArchivo = archivoOriginal.makeCopy(nombres[i] + "_GESTOR DE ACTIVIDAD");

    Logger.log('Archivo creado: ' + copiaArchivo.getName());

    Utilities.sleep(5000);

    var urlSpreadsheetNuevo = copiaArchivo.getUrl();
    var spreadsheetNuevo = SpreadsheetApp.openByUrl(urlSpreadsheetNuevo);

    spreadsheetNuevo.getSheetByName('REPORTE DIARIO').getRange('B3').setValue(nombres[i]);
    SpreadsheetApp.flush();

    Logger.log('Nombre actualizado en archivo: ' + copiaArchivo.getName());
  }


}


----------actualizarEstatusCompromiso------------
function actualizarEstatusCompromiso() {

  var ui = SpreadsheetApp.getUi();

  var compromiso = sheetCompromisos.getRange('B6').getValue();
  var id = sheetCompromisos.getRange('D6').getValue();
  var estatus = sheetCompromisos.getRange('F6').getValue();
  var comentarios = sheetCompromisos.getRange('B9').getValue();
  var hoy = Utilities.formatDate(new Date(), "America/Mexico_City", "dd/MM/yyyy");

  var arrayIDs = sheetGestionCompromisos.getRange('B7:B').getValues().filter(elemento => elemento != "").flat();

  if (compromiso == "" || id == "" || estatus == "") {
    ui.alert('ERROR', 'Has omitido información.', ui.ButtonSet.OK)
  } else if (arrayIDs.indexOf(id) == -1) {
    ui.alert('ERROR', 'No se encuentra el compromiso. Solicita ayuda.', ui.ButtonSet.OK)
  } else {

    var filaCompromiso = Number(arrayIDs.indexOf(id)) + Number(7);
    sheetGestionCompromisos.getRange(filaCompromiso, 9, 1, 1).setValue(hoy);
    sheetGestionCompromisos.getRange(filaCompromiso, 10, 1, 1).setValue(comentarios);

    if (estatus == "CANCELADO") {
      sheetGestionCompromisos.getRange(filaCompromiso, 7, 1, 1).setValue(estatus);
    }

    sheetCompromisos.getRange('B6').clearContent();
    sheetCompromisos.getRange('F6').clearContent();
    sheetCompromisos.getRange('B9').clearContent();

    ui.alert('ÉXITO.', 'Se ha registrado el nuevo estatus del compromiso.', ui.ButtonSet.OK)
  }
}


-----asignarcompromiso-----
function asignarCompromiso() {

  var ui = SpreadsheetApp.getUi();

  var titulo = sheetCompromisos.getRange('D14').getValue();
  var detalles = sheetCompromisos.getRange('E14').getValue();
  var id = sheetCompromisos.getRange('I14').getValue();
  var proyecto = sheetCompromisos.getRange('D17').getValue();
  var valor = sheetCompromisos.getRange('E17').getValue();
  var entregable = sheetCompromisos.getRange('F17').getValue();
  var tipo = sheetCompromisos.getRange('G17').getValue();
  var fechaAcuerdo = sheetCompromisos.getRange('F20').getDisplayValue();
  var asignado = sheetCompromisos.getRange('G20').getValue();
  var correo = sheetCompromisos.getRange('I20').getValue().toString();
  var hoy = Utilities.formatDate(new Date(), "America/Mexico_City", "dd/MM/yyyy");

  var filaCompromisos = sheetGestionCompromisos.getLastRow() + 1;
  sheetGestionCompromisos.getRange(filaCompromisos, 2, 1, 1).setValue(id);
  sheetGestionCompromisos.getRange(filaCompromisos, 3, 1, 1).setValue(hoy);
  sheetGestionCompromisos.getRange(filaCompromisos, 4, 1, 1).setValue(titulo);
  sheetGestionCompromisos.getRange(filaCompromisos, 5, 1, 1).setValue(detalles);
  sheetGestionCompromisos.getRange(filaCompromisos, 6, 1, 1).setValue(fechaAcuerdo);
  sheetGestionCompromisos.getRange(filaCompromisos, 8, 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheetGestionCompromisos.getRange(filaCompromisos, 12, 1, 1).setValue(asignado);
  sheetGestionCompromisos.getRange(filaCompromisos, 13, 1, 1).setValue(proyecto);
  sheetGestionCompromisos.getRange(filaCompromisos, 14, 1, 1).setValue(entregable);
  sheetGestionCompromisos.getRange(filaCompromisos, 15, 1, 1).setValue(tipo);
  sheetGestionCompromisos.getRange(filaCompromisos, 7, 1, 1).setFormula('=IFS(AND(NOT(I' + filaCompromisos + '=""),I' + filaCompromisos + '<=F' + filaCompromisos + '),"CUMPLIDO",AND(NOT(I' + filaCompromisos + '=""),I' + filaCompromisos + '>F' + filaCompromisos + '),"RETRASADO",AND(I' + filaCompromisos + '="",F' + filaCompromisos + '>=TODAY()),"PENDIENTE",AND(I' + filaCompromisos + '="",F' + filaCompromisos + '<TODAY()),"INCUMPLIDO")');
  sheetGestionCompromisos.getRange(filaCompromisos, 16, 1, 1).setFormula('=IFERROR(IFS(G' + filaCompromisos + '="INCUMPLIDO",TODAY()-F' + filaCompromisos + ',G' + filaCompromisos + '="RETRASADO",I' + filaCompromisos + '-F' + filaCompromisos + '))');
  sheetGestionCompromisos.getRange(filaCompromisos, 17, 1, 1).setValue(valor);

  SpreadsheetApp.flush();

  MailApp.sendEmail({
    to: correo,
    subject: colaborador + ' TE ASIGNÓ "' + titulo + '" COMO COMPROMISO.',
    body: 'Acaba de serte asignado un nuevo compromiso:\n\nCOMPROMISO: ' + titulo + '\nDETALLES: ' + detalles + '\nPROYECTO: ' + proyecto + '\nENTREGABLE: ' + entregable + '\nFECHA ACORDADA: ' + fechaAcuerdo,
  });

  sheetCompromisos.getRange('D14').clearContent();
  sheetCompromisos.getRange('E14').clearContent();
  sheetCompromisos.getRange('D17').clearContent();
  sheetCompromisos.getRange('E17').clearContent();
  sheetCompromisos.getRange('F17').clearContent();
  sheetCompromisos.getRange('G17').clearContent();
  sheetCompromisos.getRange('F20').setValue(hoy);
  sheetCompromisos.getRange('G20').clearContent();

}


-------solicitar licencia---------
function solicitarLicencia() {

  var ui = SpreadsheetApp.getUi();

  var licencia = sheetLicencias.getRange('B8').getValue();
  var proyecto = sheetLicencias.getRange('B10').getValue();
  var usuariosActivos = sheetLicencias.getRange('H3').getValue();

  if (usuariosActivos >= 1) {
    ui.alert('LA LICENCIA ASOCIADA AL CORREO ' + licencia + ' ESTÁ SIENDO USADA POR MÁS USUARIOS QUE LOS PERMITIDOS.\n\nSi deseas usar esta licencia solicita asistencia de tu coordinador.');
  } else {
    var listaUsuarios = sheetDatosUso.getRange(5, 2, sheetDatosUso.getLastRow() - 4, 1).getValues().flat();
    var filaUsuario = listaUsuarios.indexOf(colaborador) + 5;

    var listaLicencias = sheetDatosLicencias.getRange(5, 2, sheetDatosLicencias.getLastRow() - 4, 1).getValues().flat();
    var filaLicencia = listaLicencias.indexOf(licencia) + 5;

    var contrasena = sheetDatosLicencias.getRange(filaLicencia, 3, 1, 1).getValue();

    if (filaUsuario == 4) {
      var filaDatos = sheetDatosUso.getLastRow()+1;
      sheetDatosUso.getRange(filaDatos, 2, 1, 1).setValue(colaborador);
      sheetDatosUso.getRange(filaDatos, 3, 1, 1).setValue(licencia);
      sheetDatosUso.getRange(filaDatos, 4, 1, 1).setValue(proyecto);
      sheetDatosUso.getRange(filaDatos, 5, 1, 1).setValue('En uso');
      sheetDatosUso.getRange(filaDatos, 6, 1, 1).setValue('Solicitada el ' + new Date().toDateString().slice(4, 15));
    } else {
      sheetDatosUso.getRange(filaUsuario, 3, 1, 1).setValue(licencia);
      sheetDatosUso.getRange(filaUsuario, 4, 1, 1).setValue(proyecto);
      sheetDatosUso.getRange(filaUsuario, 5, 1, 1).setValue('En uso');
      sheetDatosUso.getRange(filaUsuario, 6, 1, 1).setValue('Solicitada en ' + new Date().toDateString().slice(4, 15));
    }

    var correosCoordinadores = sheetBasesDeDatos.getRange('BT3:BT').getValues().filter(campo => campo != "").toString();

    MailApp.sendEmail({
      to: correosCoordinadores,
      subject: colaborador + ' está usando ' + licencia,
      body: 'Se acaba de aprobar automáticamente el uso de la licencia asociada al correo ' + licencia + ' al usuario ' + colaborador + '.\nEn caso de generar problemas, acercarse al usuario directamente y gestionar los cambios a través del formato de ASIGNACIÓN DE LICENCIAS. https://docs.google.com/spreadsheets/d/1auhWchmMo64UOXUMbXuGdLfkDy9hjyieKw42R2s8OYg/edit?gid=363670562#gid=363670562',
    });

    sheetLicencias.getRange('B8').clearContent();
    sheetLicencias.getRange('B10').clearContent();

    ui.alert('SOLICITUD APROBADA. AHORA PUEDES USAR LA LICENCIA SOLICITADA.\n\nCORREO: ' + licencia + '\n\nCONTRASEÑA: ' + contrasena);
  }
}

-----reportar falla---
function reportarFalla() {

  var ui = SpreadsheetApp.getUi();

  // Leer datos del formulario
  var colaborador = sheetMantenimiento.getRange('B3').getValue();
  var codigo = sheetMantenimiento.getRange('B9').getValue();
  var tipo = sheetMantenimiento.getRange('D6').getValue();
  var problema = sheetMantenimiento.getRange('D9').getValue() !== ''
    ? sheetMantenimiento.getRange('D9').getValue()
    : sheetMantenimiento.getRange('D12').getValue();
  var detalles = sheetMantenimiento.getRange('D18').getValue();
  var prioridad = sheetMantenimiento.getRange('D15').getValue();

  // Buscar correo del colaborador
  var sheetUsuarios = SpreadsheetApp.openById('1Fp4uPk7y7E_2C780JSTy3XcYZ1St_95SfNxxaEHjFmA').getSheetByName('PÚBLICO');
  var arrayNombresUsuarios = sheetUsuarios.getRange(2, 2, sheetUsuarios.getLastRow() - 1, 1).getValues().flat();
  var arrayCorreos = sheetUsuarios.getRange(2, 3, sheetUsuarios.getLastRow() - 1, 1).getValues().flat();

  var correoColaborador = arrayCorreos[arrayNombresUsuarios.indexOf(colaborador)] || 'Sin correo registrado';

  // Validación
  if (colaborador == '' || tipo == '' || problema == '' || detalles == '' || prioridad == '') {
    ui.alert('ERROR', 'Omitiste información relevante. Por favor revisa tu reporte y vuelve a enviarlo.', ui.ButtonSet.OK);
    return;
  }

  // Buscar ID equipo y Anydesk en inventario
  var sheetInventario = SpreadsheetApp.openById('1AOMZhO3_fm4oSKq53t3rePSyXQGXPKBr-9uPTi0xbcE').getSheetByName('EQUIPOS');
  var arrayNombres = sheetInventario.getRange(2, 14, sheetInventario.getLastRow() - 1, 1).getValues().flat();
  var arrayIDsEquipos = sheetInventario.getRange(2, 6, sheetInventario.getLastRow() - 1, 1).getValues().flat();
  var arrayAnydesk = sheetInventario.getRange(2, 15, sheetInventario.getLastRow() - 1, 1).getValues().flat();

  var idEquipo = arrayIDsEquipos[arrayNombres.indexOf(colaborador)];
  var anydesk = arrayAnydesk[arrayNombres.indexOf(colaborador)];

  // Registrar en hoja de gestión (orden: B=codigo, C=colaborador, D=idEquipo, E=anydesk, F=tipo, G=problema, H=detalles, I=prioridad, J=idDynamics)
  var sheetListado = SpreadsheetApp.openById('1YLD7SD1yeN8Q4qs4HlCj1AxGctBcq2CvNbX60K9eiJk').getSheetByName('GESTIÓN');
  var filaListado = sheetListado.getLastRow() + 1;

  sheetListado.getRange(filaListado, 2).setValue(codigo);
  sheetListado.getRange(filaListado, 3).setValue(colaborador);
  sheetListado.getRange(filaListado, 4).setValue(idEquipo);
  sheetListado.getRange(filaListado, 5).setValue(anydesk);
  sheetListado.getRange(filaListado, 6).setValue(tipo);
  sheetListado.getRange(filaListado, 7).setValue(problema);
  sheetListado.getRange(filaListado, 8).setValue(detalles);
  sheetListado.getRange(filaListado, 9).setValue(prioridad);

  // Armar descripción para Dynamics
  var descripcion = 'Solicitado por: ' + colaborador + '\n' +
    'Correo: ' + correoColaborador + '\n' +
    'Urgencia: ' + prioridad + '\n' +
    'Detalles: ' + detalles;

  // Crear caso en Dynamics
  var idCaso = crearCasoDynamics({
    titulo: problema,
    descripcion: descripcion
  });

  // Guardar ID de Dynamics en columna J
  if (idCaso) {
    sheetListado.getRange(filaListado, 10).setValue(idCaso);
  }

  // --- NUEVO: Guardar en BDD MANTENIMIENTO ---
  guardarEnBDD(codigo, colaborador, tipo, problema, detalles, prioridad);

  // --- NUEVO: Enviar correo de notificación ---
  enviarCorreoNotificacion(colaborador, correoColaborador, codigo, tipo, problema, detalles, prioridad, idCaso);

  // Limpiar formulario
  sheetMantenimiento.getRange('D6').clearContent();
  sheetMantenimiento.getRange('D9').clearContent();
  sheetMantenimiento.getRange('D12').clearContent();
  sheetMantenimiento.getRange('D15').clearContent();
  sheetMantenimiento.getRange('D18').clearContent();

  ui.alert('ÉXITO.', 'Se ha reportado la falla exitosamente.', ui.ButtonSet.OK);
}


// ─────────────────────────────────────────────
//  GUARDAR EN BDD MANTENIMIENTO
//  Columnas: A=FECHA  B=CÓDIGO  C=COLABORADOR
//            D=TIPO DE FALLA  E=PROBLEMA
//            F=DESCRIPCIÓN DEL PROBLEMA  G=URGENCIA
// ─────────────────────────────────────────────
function guardarEnBDD(codigo, colaborador, tipo, problema, detalles, prioridad) {
  var sheetBDD = SpreadsheetApp.openById('18FrU-jbGkK-c0CeV7_xA0GLGKZS4pOeDLBS1K4XeTV4')
                               .getSheetByName('BDD MANTENIMIENTO');
  var fila = sheetBDD.getLastRow() + 1;
  var fecha = new Date();

  sheetBDD.getRange(fila, 1).setValue(fecha);
  sheetBDD.getRange(fila, 2).setValue(codigo);
  sheetBDD.getRange(fila, 3).setValue(colaborador);
  sheetBDD.getRange(fila, 4).setValue(tipo);
  sheetBDD.getRange(fila, 5).setValue(problema);
  sheetBDD.getRange(fila, 6).setValue(detalles);
  sheetBDD.getRange(fila, 7).setValue(prioridad);
}


// ─────────────────────────────────────────────
//  ENVIAR CORREO DE NOTIFICACIÓN
// ─────────────────────────────────────────────
function enviarCorreoNotificacion(colaborador, correoColaborador, codigo, tipo, problema, detalles, prioridad, idCaso) {

  var destinatarios = ['elton@gruposohersa.com', 'rrhh@gruposohersa.com'];
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  var colorUrgencia = { 'Alta': '#c0392b', 'Media': '#e67e22', 'Baja': '#27ae60' };
  var colorPill = colorUrgencia[prioridad] || '#7f8c8d';

  var asunto = '🔧 Nuevo ticket de mantenimiento — ' + problema + ' [' + prioridad + ']';

  var cuerpoHTML = '' +
    '<!DOCTYPE html>' +
    '<html lang="es"><head><meta charset="UTF-8">' +
    '<style>' +
    '  body { margin:0; padding:0; background:#f4f6f8; font-family:Arial,sans-serif; }' +
    '  .wrapper { max-width:620px; margin:32px auto; background:#ffffff; border-radius:8px;' +
    '             overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.12); }' +
    '  .header  { background:#1a3c5e; padding:28px 36px; }' +
    '  .header h1 { margin:0; color:#ffffff; font-size:20px; font-weight:700; letter-spacing:.5px; }' +
    '  .header p  { margin:6px 0 0; color:#a8c0d6; font-size:13px; }' +
    '  .body    { padding:32px 36px; }' +
    '  .badge   { display:inline-block; padding:4px 14px; border-radius:20px; font-size:12px;' +
    '             font-weight:700; color:#fff; background:' + colorPill + '; margin-bottom:24px; }' +
    '  table    { width:100%; border-collapse:collapse; }' +
    '  td       { padding:10px 12px; font-size:14px; color:#2c3e50; vertical-align:top; }' +
    '  tr:nth-child(odd) td { background:#f8fafc; }' +
    '  .label   { font-weight:700; color:#1a3c5e; width:38%; white-space:nowrap; }' +
    '  .desc-box { background:#f0f4f8; border-left:4px solid #1a3c5e; padding:14px 16px;' +
    '              border-radius:4px; font-size:14px; color:#2c3e50; line-height:1.6;' +
    '              margin-top:20px; white-space:pre-wrap; }' +
    '  .footer  { background:#f4f6f8; padding:18px 36px; text-align:center;' +
    '             font-size:12px; color:#95a5a6; border-top:1px solid #e0e6ed; }' +
    '</style></head><body>' +

    '<div class="wrapper">' +

    '  <div class="header">' +
    '    <h1>Ticket de Mantenimiento</h1>' +
    '    <p>Grupo Sohersa &mdash; Sistema de Gestión de TI &mdash; ' + fecha + '</p>' +
    '  </div>' +

    '  <div class="body">' +
    '    <span class="badge">Urgencia: ' + prioridad + '</span>' +

    '    <table>' +
    '      <tr><td class="label">Colaborador</td><td>' + colaborador + '</td></tr>' +
    '      <tr><td class="label">Correo</td><td>' + correoColaborador + '</td></tr>' +
    '      <tr><td class="label">Código</td><td>' + (codigo || '—') + '</td></tr>' +
    '      <tr><td class="label">Tipo de falla</td><td>' + tipo + '</td></tr>' +
    '      <tr><td class="label">Problema</td><td>' + problema + '</td></tr>' +
    (idCaso ? '      <tr><td class="label">ID Dynamics</td><td>' + idCaso + '</td></tr>' : '') +
    '    </table>' +

    '    <p style="margin:20px 0 6px;font-weight:700;font-size:13px;color:#1a3c5e;">DESCRIPCIÓN DEL PROBLEMA</p>' +
    '    <div class="desc-box">' + detalles + '</div>' +

    '  </div>' +

    '  <div class="footer">' +
    '    Este correo fue generado automáticamente por el sistema de reportes de fallas de TI.<br>' +
    '    Por favor no responda directamente a este mensaje.' +
    '  </div>' +

    '</div>' +
    '</body></html>';

  destinatarios.forEach(function(correo) {
    MailApp.sendEmail({
      to: correo,
      subject: asunto,
      htmlBody: cuerpoHTML
    });
  });
}





function reportarFalla_TEST() {

  var ui = SpreadsheetApp.getUi();

  // Leer datos del formulario
  var colaborador = sheetMantenimiento.getRange('B3').getValue();
  var codigo      = sheetMantenimiento.getRange('B9').getValue();
  var tipo        = sheetMantenimiento.getRange('D6').getValue();
  var problema    = sheetMantenimiento.getRange('D9').getValue() !== ''
    ? sheetMantenimiento.getRange('D9').getValue()
    : sheetMantenimiento.getRange('D12').getValue();
  var detalles  = sheetMantenimiento.getRange('D18').getValue();
  var prioridad = sheetMantenimiento.getRange('D15').getValue();

  // Buscar correo del colaborador
  var sheetUsuarios = SpreadsheetApp.openById('1Fp4uPk7y7E_2C780JSTy3XcYZ1St_95SfNxxaEHjFmA').getSheetByName('PÚBLICO');
  var arrayNombresUsuarios = sheetUsuarios.getRange(2, 2, sheetUsuarios.getLastRow() - 1, 1).getValues().flat();
  var arrayCorreos         = sheetUsuarios.getRange(2, 3, sheetUsuarios.getLastRow() - 1, 1).getValues().flat();
  var correoColaborador    = arrayCorreos[arrayNombresUsuarios.indexOf(colaborador)] || 'Sin correo registrado';

  // Validación
  if (colaborador == '' || tipo == '' || problema == '' || detalles == '' || prioridad == '') {
    ui.alert('ERROR', 'Omitiste información relevante. Por favor revisa tu reporte y vuelve a enviarlo.', ui.ButtonSet.OK);
    return;
  }

  // Guardar en BDD MANTENIMIENTO
  guardarEnBDD(codigo, colaborador, tipo, problema, detalles, prioridad);

  // Enviar correo SOLO a ti (modo prueba, sin Dynamics)
  var idCaso = '⚠️ PRUEBA — sin Dynamics';
  enviarCorreoNotificacion_TEST(colaborador, correoColaborador, codigo, tipo, problema, detalles, prioridad, idCaso);

  ui.alert('PRUEBA OK', 'BDD guardada y correo enviado a a.orozco@gruposohersa.com.\nDynamics NO fue tocado.', ui.ButtonSet.OK);
}


function enviarCorreoNotificacion_TEST(colaborador, correoColaborador, codigo, tipo, problema, detalles, prioridad, idCaso) {

  var destinatarios = ['a.orozco@gruposohersa.com'];   // ← solo tú en prueba
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  var colorUrgencia = { 'Alta': '#c0392b', 'Media': '#e67e22', 'Baja': '#27ae60' };
  var colorPill = colorUrgencia[prioridad] || '#7f8c8d';

  var asunto = '🧪 [PRUEBA] Ticket de mantenimiento — ' + problema + ' [' + prioridad + ']';

  var cuerpoHTML = '' +
    '<!DOCTYPE html>' +
    '<html lang="es"><head><meta charset="UTF-8">' +
    '<style>' +
    '  body { margin:0; padding:0; background:#f4f6f8; font-family:Arial,sans-serif; }' +
    '  .wrapper { max-width:620px; margin:32px auto; background:#ffffff; border-radius:8px;' +
    '             overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.12); }' +
    '  .banner  { background:#7f8c8d; padding:10px 36px; font-size:13px; color:#fff; font-weight:700; }' +
    '  .header  { background:#1a3c5e; padding:28px 36px; }' +
    '  .header h1 { margin:0; color:#ffffff; font-size:20px; font-weight:700; letter-spacing:.5px; }' +
    '  .header p  { margin:6px 0 0; color:#a8c0d6; font-size:13px; }' +
    '  .body    { padding:32px 36px; }' +
    '  .badge   { display:inline-block; padding:4px 14px; border-radius:20px; font-size:12px;' +
    '             font-weight:700; color:#fff; background:' + colorPill + '; margin-bottom:24px; }' +
    '  table    { width:100%; border-collapse:collapse; }' +
    '  td       { padding:10px 12px; font-size:14px; color:#2c3e50; vertical-align:top; }' +
    '  tr:nth-child(odd) td { background:#f8fafc; }' +
    '  .label   { font-weight:700; color:#1a3c5e; width:38%; white-space:nowrap; }' +
    '  .desc-box { background:#f0f4f8; border-left:4px solid #1a3c5e; padding:14px 16px;' +
    '              border-radius:4px; font-size:14px; color:#2c3e50; line-height:1.6;' +
    '              margin-top:20px; white-space:pre-wrap; }' +
    '  .footer  { background:#f4f6f8; padding:18px 36px; text-align:center;' +
    '             font-size:12px; color:#95a5a6; border-top:1px solid #e0e6ed; }' +
    '</style></head><body>' +

    '<div class="wrapper">' +
    '  <div class="banner">⚠️ CORREO DE PRUEBA — Dynamics no fue utilizado</div>' +

    '  <div class="header">' +
    '    <h1>Ticket de Mantenimiento</h1>' +
    '    <p>Grupo Sohersa &mdash; Sistema de Gestión de TI &mdash; ' + fecha + '</p>' +
    '  </div>' +

    '  <div class="body">' +
    '    <span class="badge">Urgencia: ' + prioridad + '</span>' +

    '    <table>' +
    '      <tr><td class="label">Colaborador</td><td>' + colaborador + '</td></tr>' +
    '      <tr><td class="label">Correo</td><td>' + correoColaborador + '</td></tr>' +
    '      <tr><td class="label">Código</td><td>' + (codigo || '—') + '</td></tr>' +
    '      <tr><td class="label">Tipo de falla</td><td>' + tipo + '</td></tr>' +
    '      <tr><td class="label">Problema</td><td>' + problema + '</td></tr>' +
    '      <tr><td class="label">ID Dynamics</td><td>' + idCaso + '</td></tr>' +
    '    </table>' +

    '    <p style="margin:20px 0 6px;font-weight:700;font-size:13px;color:#1a3c5e;">DESCRIPCIÓN DEL PROBLEMA</p>' +
    '    <div class="desc-box">' + detalles + '</div>' +
    '  </div>' +

    '  <div class="footer">' +
    '    Este correo fue generado automáticamente por el sistema de reportes de fallas de TI.<br>' +
    '    Por favor no responda directamente a este mensaje.' +
    '  </div>' +

    '</div>' +
    '</body></html>';

  destinatarios.forEach(function(correo) {
    MailApp.sendEmail({ to: correo, subject: asunto, htmlBody: cuerpoHTML });
  });
}

----notificacionhoras---
function notificacionHoras() {

  var hoy = new Date();
  var quincenaPasada = new Date(sheetReporteDiario.getRange('AE10').getValue());
  var diferenciaDias = (hoy - quincenaPasada) / (1000 * 60 * 60 * 24);

  if (diferenciaDias >= 4 && diferenciaDias <= 13.9) {

    var horasRegistradas = sheetReporteDiario.getRange('X10').getValue();
    var horasQuincena = sheetReporteDiario.getRange('AI11').getValue();
    var horasFaltantes = horasQuincena - horasRegistradas;

    if (horasRegistradas < horasQuincena) {

      var ui = SpreadsheetApp.getUi();

      ui.alert('HORAS FALTANTES', 'Tienes ' + horasFaltantes + ' horas pendientes por registrar en la quincena pasada. Asegúrate de hacerlo al menos dos días antes de la próxima fecha de pago para recibir tu sueldo completo.', ui.ButtonSet.OK)
    }

  }

}

---checar home office-----------
function checkHO() {
  Logger.log("=== INICIO DE EJECUCIÓN ===");
  Logger.log("Colaborador: " + colaborador);
  
  var ui = SpreadsheetApp.getUi();

  // Obtener fecha y hora actual
  const ahora = new Date();
  const fechaHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  
  // Crear objeto Date solo con la hora de hoy (fecha base: 30/12/1899 que usa Google Sheets para horas)
  const horaObj = new Date(1899, 11, 30, ahora.getHours(), ahora.getMinutes(), 0);
  
  Logger.log("Fecha: " + fechaHoy);
  Logger.log("Hora: " + Utilities.formatDate(ahora, Session.getScriptTimeZone(), "HH:mm"));
  
  // Verificar si es después de las 3:30 PM
  const horaActual = ahora.getHours() + ahora.getMinutes() / 60;
  const esDespuesDeLasTresTreinta = horaActual >= 15.5; // 15:30 = 15.5 horas
  Logger.log("¿Es después de las 3:30 PM?: " + esDespuesDeLasTresTreinta);
  
  // Buscar número del colaborador en el archivo de referencia
  Logger.log("Buscando número de colaborador...");
  const ssReferencia = SpreadsheetApp.openById('18FrU-jbGkK-c0CeV7_xA0GLGKZS4pOeDLBS1K4XeTV4');
  const hojaReferencia = ssReferencia.getSheetByName('BDD COLABORADORES');
  const datosReferencia = hojaReferencia.getDataRange().getValues();
  
  let numeroColaborador = null;
  for (let i = 1; i < datosReferencia.length; i++) { // Empezar en 1 para saltar encabezados
    if (datosReferencia[i][3] === colaborador) { // Columna D (índice 3)
      numeroColaborador = datosReferencia[i][11]; // Columna L (índice 11)
      Logger.log("Número encontrado: " + numeroColaborador);
      break;
    }
  }
  
  if (numeroColaborador === null) {
    Logger.log("⚠️ ADVERTENCIA: No se encontró el número del colaborador en V02");
    throw new Error("No se encontró el número del colaborador '" + colaborador + "' en la hoja de referencia");
  }
  
  // Abrir spreadsheet y hoja de registro
  const ss = SpreadsheetApp.openById('1kESIhWsCT9NfFzk_yiSq_Mac8M7CyPl2QQWAOwAsH_w');
  Logger.log("Spreadsheet URL: " + ss.getUrl());
  
  const hoja = ss.getSheetByName('CHECK HO');
  Logger.log("Hoja encontrada: " + (hoja ? "SÍ" : "NO"));
  
  if (!hoja) {
    Logger.log("HOJAS DISPONIBLES:");
    ss.getSheets().forEach(function(h) {
      Logger.log("  - '" + h.getName() + "'");
    });
    throw new Error("No se encontró la hoja 'CHECK HO'");
  }
  
  // Obtener todos los datos
  const ultimaFila = hoja.getLastRow();
  Logger.log("Última fila con datos: " + ultimaFila);
  
  const datos = ultimaFila > 1 ? hoja.getRange(2, 1, ultimaFila - 1, 5).getValues() : [];
  Logger.log("Registros encontrados: " + datos.length);
  
  // Buscar si ya existe un registro para hoy y este colaborador
  let filaExistente = -1;
  for (let i = 0; i < datos.length; i++) {
    const fechaRegistro = datos[i][2]; // Columna C (fecha)
    
    // Comparar fechas (ignorando la hora)
    if (fechaRegistro instanceof Date) {
      const fechaRegistroSinHora = new Date(fechaRegistro.getFullYear(), fechaRegistro.getMonth(), fechaRegistro.getDate());
      if (datos[i][1] === colaborador && fechaRegistroSinHora.getTime() === fechaHoy.getTime()) { // Columna B (colaborador)
        filaExistente = i + 2; // +2 porque empezamos en fila 2 y el índice es 0-based
        break;
      }
    }
  }
  
  if (filaExistente !== -1) {
    // Ya existe registro, actualizar columna OUT (E)
    Logger.log(`Escribiendo OUT en fila ${filaExistente}, columna 5`);
    hoja.getRange(filaExistente, 5).setValue(horaObj);
    SpreadsheetApp.flush();
    Logger.log(`✓ Registrado OUT para ${colaborador} a las ${Utilities.formatDate(ahora, Session.getScriptTimeZone(), "HH:mm")}`);
    
    // Mostrar mensaje de confirmación
    const horaFormateada = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "hh:mm a");
    ui.alert("COMPLETADO","Salida: " + horaFormateada, ui.ButtonSet.OK);
    
  } else if (esDespuesDeLasTresTreinta) {
    // No hay registro y es después de las 3:30 PM, registrar directamente en OUT
    const nuevaFila = ultimaFila + 1;
    Logger.log(`Escribiendo nuevo registro OUT en fila ${nuevaFila}`);
    hoja.getRange(nuevaFila, 1).setValue(numeroColaborador);
    hoja.getRange(nuevaFila, 2).setValue(colaborador);
    hoja.getRange(nuevaFila, 3).setValue(fechaHoy);
    hoja.getRange(nuevaFila, 5).setValue(horaObj);
    SpreadsheetApp.flush();
    Logger.log(`✓ Registrado OUT directo para ${colaborador} a las ${Utilities.formatDate(ahora, Session.getScriptTimeZone(), "HH:mm")} (después de 3:30 PM)`);
    
    // Mostrar mensaje de confirmación
    const horaFormateada = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "hh:mm a");
    ui.alert("COMPLETADO","Salida: " + horaFormateada, ui.ButtonSet.OK);
    
  } else {
    // No hay registro y es antes de las 3:30 PM, registrar en IN
    const nuevaFila = ultimaFila + 1;
    Logger.log(`Escribiendo nuevo registro IN en fila ${nuevaFila}`);
    hoja.getRange(nuevaFila, 1).setValue(numeroColaborador);
    hoja.getRange(nuevaFila, 2).setValue(colaborador);
    hoja.getRange(nuevaFila, 3).setValue(fechaHoy);
    hoja.getRange(nuevaFila, 4).setValue(horaObj);
    SpreadsheetApp.flush();
    Logger.log(`✓ Registrado IN para ${colaborador} a las ${Utilities.formatDate(ahora, Session.getScriptTimeZone(), "HH:mm")}`);
    
    // Mostrar mensaje de confirmación
    const horaFormateada = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "hh:mm a");
    ui.alert("COMPLETADO","Entrada: " + horaFormateada, ui.ButtonSet.OK);
  }
  
  Logger.log("=== FIN DE EJECUCIÓN ===");
}


----Dynamics-------
function crearCasoDynamics(datosCaso) {
  const token = obtenerTokenDynamics();
  if (!token) {
    Logger.log('No se pudo obtener token, abortando.');
    return null;
  }

  const dynamicsUrl = PropertiesService.getScriptProperties().getProperty('DYNAMICS_URL');
  const url = `${dynamicsUrl}/api/data/v9.2/incidents`;

  const payload = {
    title: datosCaso.titulo,
    description: datosCaso.descripcion,
    cad_area_servicio: 1,
    new_eltipodeproyectoesincidenciaosolicitud: 1,
    "customerid_account@odata.bind": `/accounts(febc09e3-8e71-ee11-9ae7-6045bdefa382)`
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Prefer': 'return=representation'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const data = JSON.parse(response.getContentText());

  if (status === 200 || status === 201) {
    Logger.log('Caso creado! ID: ' + data.incidentid);
    return data.incidentid;
  } else {
    Logger.log('Error: ' + JSON.stringify(data));
    return null;
  }
}

function obtenerTokenDynamics() {

  try {
    props.getProperty('X');
  } catch (e) {
    guardarCredenciales();
  }

  const props = PropertiesService.getScriptProperties();
  const tenantId = props.getProperty('DYNAMICS_TENANT_ID');
  const clientId = props.getProperty('DYNAMICS_CLIENT_ID');
  const clientSecret = props.getProperty('DYNAMICS_CLIENT_SECRET');
  const dynamicsUrl = props.getProperty('DYNAMICS_URL');

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const payload = {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${dynamicsUrl}/.default`
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    payload: payload,
    muteHttpExceptions: true
  });

  const data = JSON.parse(response.getContentText());

  if (data.access_token) {
    Logger.log('Token obtenido correctamente');
    return data.access_token;
  } else {
    Logger.log('Error obteniendo token: ' + JSON.stringify(data));
    return null;
  }
}

function guardarCredenciales() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'DYNAMICS_TENANT_ID': '267e7400-d5af-4805-bce9-1e4247c0c3a7',
    'DYNAMICS_CLIENT_ID': '5ba6cde1-9096-4df8-85aa-ae723a6d4b2b',
    'DYNAMICS_CLIENT_SECRET': '«CENSURADO — ver el Apps Script original»',
    'DYNAMICS_URL': 'https://ccad.crm.dynamics.com',
    'X': true
  });
  Logger.log('Credenciales guardadas');
}


