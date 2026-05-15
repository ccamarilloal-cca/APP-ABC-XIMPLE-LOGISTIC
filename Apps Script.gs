// ============================================================
// APPS SCRIPT.gs — HUB NAL · ABC XIMPLE LOGISTICS
// Pegar en Google Apps Script de tu Sheets y desplegar como Web App
// ============================================================

// ── CONFIGURACIÓN ────────────────────────────────────────────
const SHEETS_CONFIG = {
  ESTATUS:      'Estatus_Diario',
  INCIDENCIAS:  'Incidencias',
  RENDIMIENTOS: 'Rendimientos',
  SOLICITUDES:  'Solicitudes_Mtto',
  DATA:         'Data',
  MOVIMIENTOS:  'Movimientos_RH',
  WHATSAPP:     'Whats App',
  URGENCIAS:    'Urgencias',
};

const UNIDADES_NAL = [
  '014-ABC','019-ABC','023-ABC','026-ABC','030-ABC','034-ABC','035-ABC',
  '046-ABC','060-ABC','065-ABC','067-ABC','078-ABC','084-ABC','085-ABC',
  '089-ABC','090-ABC','095-ABC','096-ABC','097-ABC','100-ABC','102-ABC',
  '104-ABC','105-ABC','111-ABC','115-ABC','119-ABC','125-ABC','132-ABC',
  '144-ABC','151-ABC','160-ABC','161-ABC','162-ABC','163-ABC','164-ABC',
  '165-ABC','166-ABC','172-ABC','173-ABC','175-ABC','176-ABC','178-ABC',
  '182-ABC','307-ABC','308-ABC','309-ABC','310-ABC','311-ABC','312-ABC',
  '314-ABC','315-ABC','326-ABC','328-ABC','329-ABC','333-ABC','347-ABC',
  '349-ABC','350-ABC','351-ABC','352-ABC','355-ABC','368-ABC','369-ABC',
  '370-ABC','371-ABC','376-ABC','377-ABC','378-ABC','379-ABC','380-ABC',
  '382-ABC','384-ABC','385-ABC','422-ABC','436-ABC','437-ABC','438-ABC',
  '440-ABC','443-ABC','448-ABC','450-ABC','462-ABC','472-ABC',
];

// ── PUNTO DE ENTRADA GET ─────────────────────────────────────
function doGet(e) {
  const params = e.parameter;
  const action = params.action || 'all';
  let data;

  try {
    switch(action) {
      case 'estatus':     data = getEstatus();     break;
      case 'incidencias': data = getIncidencias(); break;
      case 'rendimientos':data = getRendimientos(); break;
      case 'solicitudes': data = getSolicitudes();  break;
      case 'data':        data = getData();         break;
      case 'movimientos': data = getMovimientos();  break;
      case 'urgencias':   data = getUrgencias();    break;
      case 'whatsapp':    data = processWhatsapp(); break;
      default:            data = getAll();
    }
    return buildResponse(data);
  } catch(err) {
    return buildResponse({ error: err.toString() }, 500);
  }
}

// ── CORS + RESPONSE ──────────────────────────────────────────
function buildResponse(data, code) {
  const output = ContentService
    .createTextOutput(JSON.stringify({ ok: !data.error, data, ts: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── HELPER: leer hoja como JSON ──────────────────────────────
function sheetToJson(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h).trim());
  return rows.slice(1)
    .filter(r => r.some(c => c !== '' && c !== null && c !== undefined))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
      return obj;
    });
}

// ── HELPER: normalizar unidad ────────────────────────────────
function normalizeUnit(u) {
  if (!u) return '';
  const s = String(u).trim().toUpperCase();
  if (s.includes('-ABC')) return s;
  if (/^\d+$/.test(s)) return s + '-ABC';
  return s;
}

function esNAL(u) {
  return UNIDADES_NAL.includes(normalizeUnit(u));
}

// ── ESTATUS DIARIO ───────────────────────────────────────────
function getEstatus() {
  const rows = sheetToJson(SHEETS_CONFIG.ESTATUS);
  // Encontrar la fecha más reciente
  const fechas = rows
    .map(r => r['Fecha'] || r['fecha'] || '')
    .filter(f => f)
    .map(f => new Date(f))
    .filter(f => !isNaN(f));
  
  const maxFecha = fechas.length ? new Date(Math.max(...fechas)) : null;
  
  // Filtrar solo NAL y solo la fecha más reciente
  const filtered = rows.filter(r => {
    const u = r['Unidad'] || r['unidad'] || '';
    if (!esNAL(u)) return false;
    if (maxFecha) {
      const f = new Date(r['Fecha'] || r['fecha'] || '');
      return f.toDateString() === maxFecha.toDateString();
    }
    return true;
  });

  return {
    fecha: maxFecha ? maxFecha.toISOString().substring(0,10) : '',
    unidades: filtered.map(r => ({
      unidad:    normalizeUnit(r['Unidad'] || r['unidad'] || ''),
      operador:  r['Operador'] || r['operador'] || 'SIN ASIGNAR',
      motivo:    r['Motivo'] || r['motivo'] || '',
      code:      parseCode(r['Motivo'] || r['motivo'] || ''),
      ruta:      r['NombreRuta'] || r['nombre_ruta'] || '',
      monto:     parseFloat(r['Monto'] || r['monto'] || 0) || 0,
      coord:     r['Coordinador'] || r['coordinador'] || '',
      obs:       r['Comentarios'] || r['comentarios'] || '',
      estatus:   r['Estatus'] || r['estatus'] || '',
    }))
  };
}

function parseCode(motivo) {
  if (!motivo) return '';
  const m = String(motivo).trim();
  return m.split(' - ')[0].trim().split(' ')[0].trim();
}

// ── INCIDENCIAS ───────────────────────────────────────────────
function getIncidencias() {
  const rows = sheetToJson(SHEETS_CONFIG.INCIDENCIAS);
  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  
  const filtered = rows.filter(r => {
    const u = r['Unidad'] || r['unidad'] || '';
    if (!esNAL(u)) return false;
    const f = new Date(r['FechaIncidencia'] || r['Fecha'] || '');
    if (isNaN(f)) return false;
    return f.getMonth() + 1 === mesActual && f.getFullYear() === anioActual;
  });

  return filtered.map(r => ({
    folio:    r['Folio'] || '',
    fecha:    formatDate(r['FechaIncidencia'] || r['Fecha'] || ''),
    unidad:   normalizeUnit(r['Unidad'] || ''),
    operador: r['Operador'] || '',
    tipo:     r['Tipo'] || '',
    subtipo:  r['SubTipo'] || '',
    prioridad:r['Prioridad'] || '',
    estatus:  r['EstatusNombre'] || r['Estatus'] || '',
    costo:    parseFloat(r['Costo'] || 0) || 0,
    desc:     String(r['Descripcion'] || '').substring(0, 120),
    lugar:    String(r['LugarEvento'] || '').substring(0, 80),
  }));
}

// ── RENDIMIENTOS ─────────────────────────────────────────────
function getRendimientos() {
  const rows = sheetToJson(SHEETS_CONFIG.RENDIMIENTOS);
  const filtered = rows.filter(r => esNAL(r['Numero Economico'] || r['NumeroEconomico'] || r['Unidad'] || ''));
  
  return filtered.map(r => {
    const rv = parseFloat(r['Rendimiento Calculado'] || r['Rendimiento'] || 0) || null;
    return {
      unidad:  normalizeUnit(r['Numero Economico'] || r['NumeroEconomico'] || r['Unidad'] || ''),
      rv:      rv,
      kms:     parseFloat(r['Kms Recorridos'] || r['Kms'] || 0) || null,
      litros:  parseFloat(r['Litros Carga'] || r['Litros'] || 0) || null,
      vmax:    parseFloat(r['Velocidad Maxima'] || 0) || null,
      relenti: parseFloat(r['Porcentaje Relenti'] || 0) || null,
      tipo_u:  r['Tipo Unidad'] || '',
      rf:      rv ? (rv < 2.0 ? 'critico' : rv < 2.5 ? 'bajo' : 'ok') : 'nd',
    };
  });
}

// ── SOLICITUDES MTTO ─────────────────────────────────────────
function getSolicitudes() {
  const rows = sheetToJson(SHEETS_CONFIG.SOLICITUDES);
  return rows
    .filter(r => esNAL(r['NumeroEconomico'] || r['Unidad'] || ''))
    .map(r => ({
      folio:   r['SolicitudServicio'] || r['Folio'] || '',
      unidad:  normalizeUnit(r['NumeroEconomico'] || r['Unidad'] || ''),
      desc:    String(r['Descripcion'] || '').substring(0, 80),
      fecha:   formatDate(r['FechaSolicitud'] || r['Fecha'] || ''),
      estatus: r['Estatus'] || '',
    }));
}

// ── DATA / CIRCUITOS ─────────────────────────────────────────
function getData() {
  const rows = sheetToJson(SHEETS_CONFIG.DATA);
  const porUnidad = {};
  const circuitos = {};

  rows.forEach(r => {
    const u = normalizeUnit(r['NumeroEconomico'] || r['Unidad'] || '');
    const circ = r['Circuito/Unidad'] || r['Circuito'] || '';
    const fact = parseFloat(r['Facturación'] || r['Facturacion'] || 0) || 0;
    const util = parseFloat(r['Utilidad'] || 0) || 0;

    if (u === 'TOTAL' || u === '') {
      // Fila de totales de circuito
      if (circ && fact) {
        circuitos[circ] = {
          circ,
          uds:      parseInt(r['Unidades'] || 0) || 0,
          fact:     fact,
          util:     util,
          util_ud:  parseFloat(r['Utilidad por unidad'] || 0) || 0,
          kms:      parseFloat(r['Distancia Km'] || 0) || 0,
          rend:     parseFloat(r['Rend.'] || 0) || 0,
        };
      }
    } else if (esNAL(u)) {
      porUnidad[u] = { unidad: u, circ, fact, util };
    }
  });

  return { porUnidad, circuitos };
}

// ── MOVIMIENTOS RH ───────────────────────────────────────────
function getMovimientos() {
  const rows = sheetToJson(SHEETS_CONFIG.MOVIMIENTOS);
  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();

  const filtered = rows.filter(r => {
    const f = new Date(r['FechaSolicitud'] || r['Fecha'] || '');
    if (isNaN(f)) return false;
    return f.getMonth() + 1 === mesActual && f.getFullYear() === anioActual;
  });

  const map = {};
  filtered.forEach(r => {
    const tipo = String(r['Tipo'] || r['Concepto'] || '').trim();
    if (!tipo) return;
    const monto = parseFloat(r['Monto'] || 0) || 0;
    if (!map[tipo]) map[tipo] = { tipo, cant: 0, monto: 0 };
    map[tipo].cant++;
    map[tipo].monto = Math.round((map[tipo].monto + monto) * 100) / 100;
  });

  return Object.values(map).sort((a, b) => b.monto - a.monto);
}

// ── URGENCIAS ────────────────────────────────────────────────
function getUrgencias() {
  const rows = sheetToJson(SHEETS_CONFIG.URGENCIAS);
  return rows.map(r => ({
    fecha:       formatDate(r['Fecha'] || ''),
    hora:        r['Hora'] || '',
    unidad:      normalizeUnit(r['Unidad'] || ''),
    tipo:        r['Tipo Urgencia'] || r['Tipo'] || '',
    prioridad:   r['Prioridad'] || 'Media',
    descripcion: r['Descripción'] || r['Descripcion'] || '',
    origen:      r['Origen Mensaje'] || 'WhatsApp',
    estatus:     r['Estatus'] || 'Pendiente',
  }));
}

// ── TODO EN UNO ──────────────────────────────────────────────
function getAll() {
  return {
    estatus:     getEstatus(),
    incidencias: getIncidencias(),
    rendimientos:getRendimientos(),
    solicitudes: getSolicitudes(),
    data:        getData(),
    movimientos: getMovimientos(),
    urgencias:   getUrgencias(),
  };
}

// ── WHATSAPP PARSER ──────────────────────────────────────────
function processWhatsapp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsSheet = ss.getSheetByName(SHEETS_CONFIG.WHATSAPP);
  if (!wsSheet) return { procesados: 0, urgencias: [] };

  const texto = wsSheet.getDataRange().getValues()
    .flat()
    .filter(c => c)
    .join('\n');

  const urgencias = detectarUrgencias(texto);
  
  // Escribir en hoja Urgencias
  escribirUrgencias(urgencias);

  return { procesados: urgencias.length, urgencias };
}

// ── DETECTOR DE URGENCIAS ────────────────────────────────────
function detectarUrgencias(texto) {
  const urgencias = [];
  const lineas = texto.split('\n').filter(l => l.trim());
  const hoy = new Date();

  // Patrones de detección
  const PATRONES = {
    accidente:   /accidente|choque|volcó|volcadura|colisión|impacto/i,
    falla:       /falla|avería|averio|descompuesto|no enciende|no arranca|motor/i,
    rescate:     /rescate|varado|varada|auxilio|grúa|grua/i,
    multa:       /multa|infracción|infraccion|detenid[oa]/i,
    siniestro:   /siniestro|robo|asalto|asaltaron/i,
    urgencia:    /urgente|urgencia|emergencia|ayuda|sos/i,
    retraso:     /retraso|demora|tarde|retrasad[oa]/i,
    caja:        /caja|remolque|semirremolque/i,
  };

  // Detectar número de unidad
  const detectarUnidad = (texto) => {
    for (const u of UNIDADES_NAL) {
      const num = u.replace('-ABC', '');
      if (new RegExp(`\\b${num}\\b|\\b${u}\\b`, 'i').test(texto)) return u;
    }
    return null;
  };

  let bloque = [];
  lineas.forEach((linea, idx) => {
    bloque.push(linea);
    if (bloque.length > 5) bloque.shift();
    const bloqueTexto = bloque.join(' ');

    for (const [tipo, patron] of Object.entries(PATRONES)) {
      if (patron.test(linea)) {
        const unidad = detectarUnidad(bloqueTexto) || detectarUnidad(linea);
        if (!unidad && tipo !== 'urgencia') continue; // solo guardar si hay unidad, excepto urgencias generales

        const prioridad = ['accidente','siniestro','rescate','urgencia'].includes(tipo) ? 'Alta' :
                          ['falla','multa'].includes(tipo) ? 'Media' : 'Baja';

        urgencias.push({
          fecha:       Utilities.formatDate(hoy, 'America/Mexico_City', 'yyyy-MM-dd'),
          hora:        Utilities.formatDate(hoy, 'America/Mexico_City', 'HH:mm'),
          unidad:      unidad || 'Sin identificar',
          tipo:        tipo.charAt(0).toUpperCase() + tipo.slice(1),
          prioridad,
          descripcion: linea.substring(0, 150),
          origen:      'WhatsApp',
          estatus:     'Pendiente',
        });
        break; // solo un tipo por línea
      }
    }
  });

  // Deduplicar por unidad+tipo en mismo día
  const vistos = new Set();
  return urgencias.filter(u => {
    const key = `${u.fecha}-${u.unidad}-${u.tipo}`;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

// ── ESCRIBIR URGENCIAS ───────────────────────────────────────
function escribirUrgencias(urgencias) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS_CONFIG.URGENCIAS);

  if (!sheet) {
    sheet = ss.insertSheet(SHEETS_CONFIG.URGENCIAS);
    const headers = ['Fecha','Hora','Unidad','Tipo Urgencia','Prioridad','Descripción','Origen Mensaje','Estatus'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  if (!urgencias.length) return;

  // Solo agregar nuevas (no duplicar)
  const existentes = sheet.getDataRange().getValues();
  const existentesSet = new Set(existentes.slice(1).map(r => `${r[0]}-${r[2]}-${r[3]}`));

  const nuevas = urgencias.filter(u => !existentesSet.has(`${u.fecha}-${u.unidad}-${u.tipo}`));
  if (!nuevas.length) return;

  const rows = nuevas.map(u => [u.fecha, u.hora, u.unidad, u.tipo, u.prioridad, u.descripcion, u.origen, u.estatus]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

  // Colorear por prioridad
  const lastRow = sheet.getLastRow();
  rows.forEach((r, i) => {
    const rowNum = lastRow - rows.length + i + 1;
    const color = r[4] === 'Alta' ? '#fde8e8' : r[4] === 'Media' ? '#fef9e7' : '#f8f9fa';
    sheet.getRange(rowNum, 1, 1, r.length).setBackground(color);
  });
}

// ── INICIALIZAR HOJAS NUEVAS ─────────────────────────────────
function inicializarHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Crear "Whats App" si no existe
  if (!ss.getSheetByName(SHEETS_CONFIG.WHATSAPP)) {
    const ws = ss.insertSheet(SHEETS_CONFIG.WHATSAPP);
    ws.getRange('A1').setValue('Pega aquí las conversaciones de WhatsApp. El sistema las procesará automáticamente.');
    ws.getRange('A1').setFontStyle('italic').setFontColor('#64748b');
  }

  // Crear "Urgencias" si no existe
  if (!ss.getSheetByName(SHEETS_CONFIG.URGENCIAS)) {
    const urg = ss.insertSheet(SHEETS_CONFIG.URGENCIAS);
    const headers = ['Fecha','Hora','Unidad','Tipo Urgencia','Prioridad','Descripción','Origen Mensaje','Estatus'];
    urg.getRange(1, 1, 1, headers.length).setValues([headers]);
    urg.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    urg.setFrozenRows(1);
  }

  return 'Hojas inicializadas correctamente';
}

// ── TRIGGER AUTOMÁTICO WHATSAPP ──────────────────────────────
// Ejecutar cada 10 minutos — configurar en Triggers del Apps Script
function triggerWhatsapp() {
  processWhatsapp();
}

// ── UTILS ────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d).substring(0, 10);
  return dt.toISOString().substring(0, 10);
}
