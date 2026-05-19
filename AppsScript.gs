// ============================================================
// APPS SCRIPT.gs — HUB NAL v2 · ABC XIMPLE LOGISTICS
// Correcciones: venta desde Monto+Estatus, WhatsApp grupos,
// RH tracking, CAJAS, gastos sin anticipos, KPIs coordinadores
// ============================================================

const SHEETS_CONFIG = {
  ESTATUS:        'Estatus_Diario',
  INCIDENCIAS:    'Incidencias',
  RENDIMIENTOS:   'Rendimientos',
  SOLICITUDES:    'Solicitudes_Mtto',
  DATA:           'Data',
  MOVIMIENTOS:    'Movimientos_RH',
  WHATSAPP:       'Whats App',
  URGENCIAS:      'Urgencias',
  CONTROL_OPS:    'Control_Operadores',
  CONTROL_CAJAS:  'Control_Cajas',
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

// ── PUNTO DE ENTRADA ─────────────────────────────────────────
function doGet(e) {
  const action = (e.parameter || {}).action || 'all';
  try {
    let data;
    switch(action) {
      case 'estatus':      data = getEstatus();      break;
      case 'incidencias':  data = getIncidencias();  break;
      case 'rendimientos': data = getRendimientos();  break;
      case 'solicitudes':  data = getSolicitudes();   break;
      case 'data':         data = getData();          break;
      case 'movimientos':  data = getMovimientos();   break;
      case 'urgencias':    data = getUrgencias();     break;
      case 'whatsapp':     data = processWhatsapp();  break;
      case 'control_ops':  data = getControlOps();    break;
      case 'cajas':        data = getCajas();         break;
      default:             data = getAll();
    }
    return buildResponse(data);
  } catch(err) {
    return buildResponse({ error: err.toString() }, 500);
  }
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: !data.error, data, ts: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

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

function normalizeUnit(u) {
  if (!u) return '';
  const s = String(u).trim().toUpperCase().replace(/\s/g,'');
  if (s.includes('-ABC')) return s;
  if (/^\d+$/.test(s)) return s + '-ABC';
  return s;
}
function esNAL(u) { return UNIDADES_NAL.includes(normalizeUnit(u)); }
function r2(n) { return Math.round((n||0)*100)/100; }

function formatDate(d) {
  if (!d) return '';
  if (d instanceof Date) return isNaN(d) ? '' : d.toISOString().substring(0,10);
  const dt = new Date(d);
  return isNaN(dt) ? String(d).substring(0,10) : dt.toISOString().substring(0,10);
}

// ══════════════════════════════════════════════════════════════
// ESTATUS DIARIO
// CRÍTICO: venta del día = columna Monto filtrada a VTA+TRN+LIB
// ══════════════════════════════════════════════════════════════
function getEstatus() {
  const rows = sheetToJson(SHEETS_CONFIG.ESTATUS);

  // Fecha más reciente SOLO de las 83 unidades NAL
  let maxFecha = null;
  rows.forEach(r => {
    if (!esNAL(r['Unidad'] || '')) return;
    let fd = r['Fecha'];
    if (!(fd instanceof Date)) fd = new Date(fd || '');
    if (!isNaN(fd) && (!maxFecha || fd > maxFecha)) maxFecha = fd;
  });

  const filtered = rows.filter(r => {
    if (!esNAL(r['Unidad'] || '')) return false;
    let fd = r['Fecha'];
    if (!(fd instanceof Date)) fd = new Date(fd || '');
    return !isNaN(fd) && maxFecha && fd.toDateString() === maxFecha.toDateString();
  });

  const CODIGOS_VENTA = ['VTA','TRN','LIB'];

  const unidades = filtered.map(r => {
    // Estatus es el código operativo (VTA, TRN, LIB, SO, CP, etc.)
    const estRaw  = String(r['Estatus'] || r['estatus'] || '').trim().toUpperCase();
    const code    = estRaw.split(/[\s\-]/)[0];
    const monto   = parseFloat(r['Monto'] || r['monto'] || 0) || 0;
    const esVenta = CODIGOS_VENTA.includes(code);

    return {
      unidad:    normalizeUnit(r['Unidad'] || ''),
      operador:  r['Operador'] || r['operador'] || 'SIN ASIGNAR',
      estatus:   estRaw,
      code,
      motivo:    String(r['Motivo'] || r['motivo'] || '').trim(),
      ruta:      r['NombreRuta'] || r['nombre_ruta'] || r['Ruta'] || '',
      monto:     esVenta ? monto : 0,   // venta solo productivos
      monto_raw: monto,
      coord:     r['Coordinador'] || r['coordinador'] || '',
      obs:       String(r['Comentarios'] || r['comentarios'] || '').substring(0,100),
      esVenta,
    };
  });

  return {
    fecha:      maxFecha ? maxFecha.toISOString().substring(0,10) : '',
    unidades,
    ventaTotal: r2(unidades.filter(u => u.esVenta).reduce((s,u) => s + u.monto, 0)),
  };
}

// ══════════════════════════════════════════════════════════════
// INCIDENCIAS
// ══════════════════════════════════════════════════════════════
function getIncidencias() {
  const rows = sheetToJson(SHEETS_CONFIG.INCIDENCIAS);
  const mes = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();

  return rows.filter(r => {
    if (!esNAL(r['Unidad'] || '')) return false;
    let f = r['FechaIncidencia'];
    if (!(f instanceof Date)) f = new Date(f || '');
    return !isNaN(f) && f.getMonth()+1 === mes && f.getFullYear() === anio;
  }).map(r => ({
    folio:    r['Folio'] || '',
    fecha:    formatDate(r['FechaIncidencia'] || ''),
    unidad:   normalizeUnit(r['Unidad'] || ''),
    operador: r['Operador'] || '',
    tipo:     r['Tipo'] || '',
    subtipo:  r['SubTipo'] || '',
    prioridad:r['Prioridad'] || '',
    estatus:  r['EstatusNombre'] || r['Estatus'] || '',
    costo:    parseFloat(r['Costo'] || 0) || 0,
    desc:     String(r['Descripcion'] || '').substring(0,120),
    lugar:    String(r['LugarEvento'] || '').substring(0,80),
    coord:    r['Coordinador'] || '',
  }));
}

// ══════════════════════════════════════════════════════════════
// RENDIMIENTOS
// ══════════════════════════════════════════════════════════════
function getRendimientos() {
  const rows = sheetToJson(SHEETS_CONFIG.RENDIMIENTOS);
  return rows
    .filter(r => esNAL(r['Numero Economico'] || r['NumeroEconomico'] || ''))
    .map(r => {
      const rv = parseFloat(r['Rendimiento Calculado'] || r['Rendimiento'] || 0) || null;
      return {
        unidad:   normalizeUnit(r['Numero Economico'] || r['NumeroEconomico'] || ''),
        rv,
        kms:      parseFloat(r['Kms Recorridos'] || 0) || null,
        litros:   parseFloat(r['Litros Carga'] || 0) || null,
        vmax:     parseFloat(r['Velocidad Maxima'] || 0) || null,
        relenti:  parseFloat(r['Porcentaje Relenti'] || 0) || null,
        tipo_u:   r['Tipo Unidad'] || '',
        operador: r['Operador'] || '',
        rf:       !rv ? 'nd' : rv < 2.0 ? 'critico' : rv < 2.5 ? 'bajo' : 'ok',
      };
    });
}

// ══════════════════════════════════════════════════════════════
// SOLICITUDES MTTO — PENDIENTES DE LIBERAR = Abierta
// ══════════════════════════════════════════════════════════════
function getSolicitudes() {
  const rows = sheetToJson(SHEETS_CONFIG.SOLICITUDES);
  return rows
    .filter(r => esNAL(r['NumeroEconomico'] || r['Unidad'] || ''))
    .map(r => ({
      folio:      r['SolicitudServicio'] || r['Folio'] || '',
      unidad:     normalizeUnit(r['NumeroEconomico'] || r['Unidad'] || ''),
      desc:       String(r['Descripcion'] || '').substring(0,100),
      fecha:      formatDate(r['FechaSolicitud'] || r['Fecha'] || ''),
      fechaCierre:formatDate(r['FechaCierre'] || ''),
      estatus:    r['Estatus'] || '',
      solicitante:r['NombreSolicitante'] || '',
      pendiente:  String(r['Estatus'] || '').toLowerCase() === 'abierta',
    }));
}

// ══════════════════════════════════════════════════════════════
// DATA — Acumulado mes: facturación, utilidad, costos por circuito y unidad
// ══════════════════════════════════════════════════════════════
function getData() {
  const rows = sheetToJson(SHEETS_CONFIG.DATA);
  const porUnidad = {};
  const circuitos = {};

  rows.forEach(r => {
    const circ   = String(r['Circuito/Unidad'] || r['Circuito'] || '').trim();
    const eco    = String(r['NumeroEconomico'] || '').trim().toUpperCase();
    const esTotal= eco === 'TOTAL' || (eco === '' && !r['NumeroEconomico']);
    const fact   = parseFloat(r['Facturación'] || r['Facturacion'] || 0) || 0;
    const util   = parseFloat(r['Utilidad'] || 0) || 0;
    const comb   = parseFloat(r['Combustible'] || 0) || 0;
    const cas    = parseFloat(r['Casetas'] || 0) || 0;
    const cops   = parseFloat(r['Costo Ops'] || 0) || 0;
    const cadm   = parseFloat(r['Costo Admn'] || r['Costo Adm'] || 0) || 0;
    const cmtto  = parseFloat(r['Costo Mtto'] || 0) || 0;
    const cfin   = parseFloat(r['Costo Financiero'] || 0) || 0;
    const seg    = parseFloat(r['Seguro'] || 0) || 0;
    const kms    = parseFloat(r['Distancia Km'] || 0) || 0;
    const rend   = parseFloat(r['Rend.'] || 0) || 0;
    const uds    = parseInt(r['Unidades'] || 0) || 0;
    const gasto  = r2(comb+cas+cops+cadm+cmtto+cfin+seg);

    if (esTotal && circ && fact > 0) {
      circuitos[circ] = { circ, uds, fact, util, util_ud: uds>0?r2(util/uds):0, kms, rend, gasto };
    } else {
      const u = normalizeUnit(r['NumeroEconomico'] || '');
      if (u && esNAL(u)) {
        porUnidad[u] = { unidad:u, circ, fact, util, comb, cas, cops, cadm, cmtto, cfin, seg, gasto };
      }
    }
  });

  // Totales acumulados NAL
  const vals = Object.values(porUnidad);
  const totales = {
    fact:    r2(vals.reduce((s,u)=>s+u.fact,0)),
    util:    r2(vals.reduce((s,u)=>s+u.util,0)),
    gasto:   r2(vals.reduce((s,u)=>s+u.gasto,0)),
    comb:    r2(vals.reduce((s,u)=>s+u.comb,0)),
    cas:     r2(vals.reduce((s,u)=>s+u.cas,0)),
    cops:    r2(vals.reduce((s,u)=>s+u.cops,0)),
    cadm:    r2(vals.reduce((s,u)=>s+u.cadm,0)),
    cmtto:   r2(vals.reduce((s,u)=>s+u.cmtto,0)),
    cfin:    r2(vals.reduce((s,u)=>s+u.cfin,0)),
    seg:     r2(vals.reduce((s,u)=>s+u.seg,0)),
  };

  return { porUnidad, circuitos, totales };
}

// ══════════════════════════════════════════════════════════════
// MOVIMIENTOS RH
// REGLA: Anticipos NO son gastos operativos (son adelanto nómina)
//        Sí se muestran por separado como información
// ══════════════════════════════════════════════════════════════
function getMovimientos() {
  const rows = sheetToJson(SHEETS_CONFIG.MOVIMIENTOS);
  const mes  = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();

  const filtered = rows.filter(r => {
    let f = r['FechaSolicitud'];
    if (!(f instanceof Date)) f = new Date(f || '');
    return !isNaN(f) && f.getMonth()+1 === mes && f.getFullYear() === anio;
  });

  const gastos = {};
  const anticipos = { cant:0, monto:0 };

  filtered.forEach(r => {
    const tipo  = String(r['Tipo'] || r['Concepto'] || '').trim();
    const monto = parseFloat(r['Monto'] || 0) || 0;
    if (!tipo) return;

    if (tipo.toLowerCase().includes('anticipo')) {
      anticipos.cant++;
      anticipos.monto = r2(anticipos.monto + monto);
    } else {
      if (!gastos[tipo]) gastos[tipo] = { tipo, cant:0, monto:0 };
      gastos[tipo].cant++;
      gastos[tipo].monto = r2(gastos[tipo].monto + monto);
    }
  });

  const items = Object.values(gastos).sort((a,b) => b.monto - a.monto);
  return {
    items,
    anticipos,
    totalGasto: r2(items.reduce((s,m)=>s+m.monto,0)),
    totalItems:  items.reduce((s,m)=>s+m.cant,0),
  };
}

// ══════════════════════════════════════════════════════════════
// CONTROL OPERADORES — hoja fija con lista, tramos, circuitos
// ══════════════════════════════════════════════════════════════
function getControlOps() {
  const rows = sheetToJson(SHEETS_CONFIG.CONTROL_OPS);
  return rows
    .filter(r => esNAL(r['Unidad'] || ''))
    .map(r => ({
      unidad:   normalizeUnit(r['Unidad'] || ''),
      operador: r['Operador'] || r['Nombre'] || '',
      coord:    r['Coordinador'] || '',
      tramo:    r['Tramo'] || '',
      circuito: r['Circuito'] || '',
    }));
}

// ══════════════════════════════════════════════════════════════
// CONTROL CAJAS
// ══════════════════════════════════════════════════════════════
function getCajas() {
  const rows = sheetToJson(SHEETS_CONFIG.CONTROL_CAJAS);
  if (!rows.length) return { cajas:[], stats:{total:0,danadas:0,cargadas:0,disponibles:0,porPatio:{}} };

  const cajas = rows.map(r => ({
    numero:  String(r['NumeroCaja'] || r['Caja'] || '').trim(),
    estado:  r['Estado'] || r['Condicion'] || '',
    patio:   r['Patio'] || r['Ubicacion'] || '',
    cargada: String(r['Cargada'] || '').toLowerCase() === 'si' || String(r['Estado']||'').toLowerCase().includes('cargada'),
    danada:  /dañad|danad|dañada/i.test(String(r['Estado']||r['Condicion']||'')),
    obs:     String(r['Observaciones'] || '').substring(0,80),
  }));

  const porPatio = {};
  cajas.forEach(c => {
    if (!c.patio) return;
    if (!porPatio[c.patio]) porPatio[c.patio] = {total:0,danadas:0,cargadas:0,disponibles:0};
    porPatio[c.patio].total++;
    if (c.danada)                    porPatio[c.patio].danadas++;
    else if (c.cargada)              porPatio[c.patio].cargadas++;
    else                             porPatio[c.patio].disponibles++;
  });

  return {
    cajas,
    stats: {
      total:       cajas.length,
      danadas:     cajas.filter(c=>c.danada).length,
      cargadas:    cajas.filter(c=>c.cargada).length,
      disponibles: cajas.filter(c=>!c.danada&&!c.cargada).length,
      porPatio,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// URGENCIAS — del día + sin seguimiento de 1-2 días antes
// ══════════════════════════════════════════════════════════════
function getUrgencias() {
  const rows = sheetToJson(SHEETS_CONFIG.URGENCIAS);
  const hoy   = new Date();
  const hoyStr = hoy.toISOString().substring(0,10);
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() - 2);
  const limStr = limite.toISOString().substring(0,10);

  return rows
    .map(r => ({
      fecha:      formatDate(r['Fecha'] || ''),
      hora:       r['Hora'] || '',
      unidad:     normalizeUnit(r['Unidad'] || ''),
      tipo:       r['Tipo Urgencia'] || r['Tipo'] || '',
      grupo:      r['Grupo'] || '',
      prioridad:  r['Prioridad'] || 'Media',
      descripcion:r['Descripción'] || r['Descripcion'] || '',
      estatus:    r['Estatus'] || 'Pendiente',
      operador:   r['Operador'] || '',
      unidadAsig: r['UnidadAsignada'] || '',
    }))
    .filter(u => u.fecha >= limStr);
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP PARSER — 5 grupos: Rescates, Siniestros, RH, Patio, CAJAS
// ══════════════════════════════════════════════════════════════
function processWhatsapp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wsSheet = ss.getSheetByName(SHEETS_CONFIG.WHATSAPP);
  if (!wsSheet) return { procesados:0, grupos:{}, rhStats:{} };

  const texto = wsSheet.getDataRange().getValues().flat().filter(c=>c).join('\n');
  const resultado = analizarWhatsapp(texto);
  guardarUrgencias(resultado);
  return resultado;
}

function analizarWhatsapp(texto) {
  const lineas = texto.split('\n').filter(l => l.trim());
  const hoy    = new Date();
  const tz     = 'America/Mexico_City';
  const hoyStr = Utilities.formatDate(hoy, tz, 'yyyy-MM-dd');

  // Detectar fecha/hora de mensajes WhatsApp: "11/05/2026, 08:23"
  const FECHA_MSG_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})/;

  const parseWADate = (linea) => {
    const m = linea.match(FECHA_MSG_RE);
    if (!m) return null;
    try {
      const dt = new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5]);
      return isNaN(dt) ? null : dt;
    } catch { return null; }
  };

  const detectarUnidadNAL = (txt) => {
    for (const u of UNIDADES_NAL) {
      const num = u.replace('-ABC','').replace(/^0+/,'');
      if (new RegExp(`\\b0*${num}\\b`,'i').test(txt)) return u;
    }
    return null;
  };

  // Detectar número de caja (CONTROL_CAJAS define cuáles son mías, pero también buscamos en WhatsApp)
  const detectarCaja = (txt) => {
    const m = txt.match(/(?:caja|remolque|semirremolque|trailer)\s*[:#]?\s*(\d{3,5}(?:-ABC)?)/i);
    return m ? m[1].replace(/-ABC/i,'').toUpperCase() : null;
  };

  const RESCATE_RE  = /rescate|varad[oa]|auxilio|gr[uú]a|sin\s+mover|atascad[oa]|mecánic[ao]|falla\s+en\s+ruta|avería|descompuest[oa]|se\s+quedo\s+en|no\s+arranca|no\s+enciende/i;
  const SINIEST_RE  = /siniestro|accidente|choque|volc[oó]|volcadura|colisi[oó]n|robo|asalto|asaltaron|impacto|pérdida\s+total|daño\s+total/i;
  const RH_ENT_RE   = /apoyan?\s+con\s+una\s+entrevista|solicito\s+entrevista|entrevista\s+para|me\s+apoyan\s+con/i;
  const RH_LIB_RE   = /se\s+liber[oó]\s+operad[ao]|liberamos\s+operad[ao]|operad[ao]\s+liber[aá]d[ao]|liberado\s+operad[ao]/i;
  const PATIO_RE    = /inventario|encargado\s+de\s+patio|patio\s+\w/i;
  const CAJA_RE     = /(?:caja|remolque|trailer|semirremolque)\s*[:#]?\s*\d{3,5}/i;
  const MTTO_LIB_RE = /listo\s+para\s+salir|disponible\s+ya|terminó?\s+servicio|sale\s+de\s+taller|liberan?\s+unidad|liberada?\s+unidad/i;

  const rescates = [], siniestros = [], rh = [], patio = [], cajas = [], mttoLiberar = [];

  let bloq = [];
  let fechaActual = null;

  lineas.forEach(linea => {
    const fh = parseWADate(linea);
    if (fh) fechaActual = fh;

    bloq.push(linea);
    if (bloq.length > 10) bloq.shift();
    const bloque = bloq.join(' ');

    const unidad   = detectarUnidadNAL(bloque);
    const numCaja  = detectarCaja(bloque);
    const fechaStr = fechaActual ? Utilities.formatDate(fechaActual, tz, 'yyyy-MM-dd') : hoyStr;
    const horaStr  = fechaActual ? Utilities.formatDate(fechaActual, tz, 'HH:mm') : '';

    if (RESCATE_RE.test(linea) && unidad) {
      rescates.push({ fecha:fechaStr, hora:horaStr, unidad, descripcion:linea.substring(0,200), grupo:'Rescates', prioridad:'Alta', estatus:'Pendiente' });
    }
    if (SINIEST_RE.test(linea) && unidad) {
      siniestros.push({ fecha:fechaStr, hora:horaStr, unidad, descripcion:linea.substring(0,200), grupo:'Siniestros', prioridad:'Alta', estatus:'Pendiente' });
    }
    if (RH_ENT_RE.test(linea)) {
      const nomM = linea.match(/para\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,40}?)(?:\.|,|\s+de\b|$)/i);
      rh.push({ fecha:fechaStr, hora:horaStr, tipo:'Entrevista', operador:nomM?nomM[1].trim():'', unidadAsig:'', descripcion:linea.substring(0,200), grupo:'RH', estatus:'En proceso', tiempoRespMin:null });
    }
    if (RH_LIB_RE.test(linea)) {
      const nomM = linea.match(/operad[ao]\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,40}?)(?:\.|,|$)/i);
      const nombre = nomM ? nomM[1].trim() : '';
      const unidAsig = unidad || '';
      // Tiempo de respuesta: buscar entrevista previa del mismo operador
      const prev = rh.find(e => e.tipo==='Entrevista' && e.estatus==='En proceso' && (!nombre || e.operador.toLowerCase().includes(nombre.split(' ')[0].toLowerCase())));
      let minutos = null;
      if (prev && prev.hora) {
        try {
          const t1 = new Date(prev.fecha+'T'+(prev.hora||'00:00')+':00');
          const t2 = new Date(fechaStr+'T'+(horaStr||'00:00')+':00');
          minutos = Math.max(0, Math.round((t2-t1)/60000));
        } catch {}
      }
      if (prev) prev.estatus = 'Liberado';
      rh.push({ fecha:fechaStr, hora:horaStr, tipo:'Liberación', operador:nombre, unidadAsig:unidAsig, descripcion:linea.substring(0,200), grupo:'RH', estatus:'Completado', tiempoRespMin:minutos });
    }
    if (PATIO_RE.test(linea) && !CAJA_RE.test(linea)) {
      patio.push({ fecha:fechaStr, hora:horaStr, descripcion:linea.substring(0,200), grupo:'Patio', estatus:'Informativo' });
    }
    if (CAJA_RE.test(linea) && numCaja) {
      const esDanada  = /dañad|danad|golpe|roto|quebrad/i.test(linea);
      const esCargada = /cargada|con\s+carga|llena/i.test(linea);
      cajas.push({ fecha:fechaStr, hora:horaStr, numCaja, esDanada, esCargada, descripcion:linea.substring(0,200), grupo:'Cajas', estatus:'Informativo' });
    }
    if (MTTO_LIB_RE.test(linea) && unidad) {
      mttoLiberar.push({ fecha:fechaStr, hora:horaStr, unidad, descripcion:linea.substring(0,200), grupo:'Mtto', estatus:'Pendiente liberación' });
    }
  });

  // Deduplicar
  const dedup = (arr, kFn) => { const s=new Set(); return arr.filter(x=>{const k=kFn(x);if(s.has(k))return false;s.add(k);return true;}); };
  const rescDed = dedup(rescates,   x=>`${x.fecha}-${x.unidad}-${x.descripcion.substring(0,25)}`);
  const sinDed  = dedup(siniestros, x=>`${x.fecha}-${x.unidad}-${x.descripcion.substring(0,25)}`);
  const cajDed  = dedup(cajas,      x=>`${x.fecha}-${x.numCaja}-${x.descripcion.substring(0,25)}`);
  const mttoDed = dedup(mttoLiberar,x=>`${x.fecha}-${x.unidad}`);

  // RH stats de la semana
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (hoy.getDay()===0?6:hoy.getDay()-1));
  const lunStr = Utilities.formatDate(lunes, tz, 'yyyy-MM-dd');

  const entrevSem  = rh.filter(e => e.tipo==='Entrevista' && e.fecha >= lunStr);
  const libSem     = rh.filter(e => e.tipo==='Liberación'  && e.fecha >= lunStr);
  const sinTraz    = rh.filter(e => e.tipo==='Entrevista'  && e.estatus==='En proceso');
  const tiempos    = rh.filter(e => e.tipo==='Liberación'  && e.tiempoRespMin!=null).map(e=>e.tiempoRespMin);

  const rhStats = {
    entrevistasHoy:    rh.filter(e=>e.tipo==='Entrevista'&&e.fecha===hoyStr).length,
    entrevistasSemana: entrevSem.length,
    liberadosSemana:   libSem.length,
    sinTrazabilidad:   sinTraz.length,
    tiempoPromMin:     tiempos.length ? Math.round(tiempos.reduce((a,b)=>a+b,0)/tiempos.length) : null,
    detalle:           rh,
  };

  return {
    procesados: rescDed.length + sinDed.length + rh.length + cajDed.length + mttoDed.length,
    grupos: { rescates:rescDed, siniestros:sinDed, rh, patio, cajas:cajDed, mttoLiberar:mttoDed },
    rhStats,
  };
}

function guardarUrgencias(resultado) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS_CONFIG.URGENCIAS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS_CONFIG.URGENCIAS);
    const h = ['Fecha','Hora','Unidad','Tipo Urgencia','Grupo','Prioridad','Descripción','Operador','UnidadAsignada','Estatus'];
    sheet.getRange(1,1,1,h.length).setValues([h]).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#fff');
    sheet.setFrozenRows(1);
  }
  const exist = sheet.getDataRange().getValues();
  const exSet = new Set(exist.slice(1).map(r=>`${r[0]}-${r[2]}-${r[3]}-${String(r[6]).substring(0,25)}`));

  const urg = [
    ...resultado.grupos.rescates.map(u=>({...u,tipo:'Rescate'})),
    ...resultado.grupos.siniestros.map(u=>({...u,tipo:'Siniestro'})),
  ].filter(u => !exSet.has(`${u.fecha}-${u.unidad||''}-${u.tipo}-${u.descripcion.substring(0,25)}`));

  if (!urg.length) return;
  sheet.getRange(sheet.getLastRow()+1, 1, urg.length, 10).setValues(
    urg.map(u=>[u.fecha,u.hora,u.unidad||'',u.tipo||'',u.grupo||'',u.prioridad||'Alta',u.descripcion||'',u.operador||'',u.unidadAsig||'',u.estatus||'Pendiente'])
  );
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
    whatsapp:    processWhatsapp(),
    control_ops: getControlOps(),
    cajas:       getCajas(),
  };
}

// ── INICIALIZAR HOJAS ────────────────────────────────────────
function inicializarHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const crearSi = (nombre, headers) => {
    if (ss.getSheetByName(nombre)) return;
    const s = ss.insertSheet(nombre);
    s.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#fff');
    s.setFrozenRows(1);
  };
  crearSi(SHEETS_CONFIG.WHATSAPP,      ['Conversaciones WhatsApp (pegar aquí todo el historial)']);
  crearSi(SHEETS_CONFIG.URGENCIAS,     ['Fecha','Hora','Unidad','Tipo Urgencia','Grupo','Prioridad','Descripción','Operador','UnidadAsignada','Estatus']);
  crearSi(SHEETS_CONFIG.CONTROL_OPS,   ['Unidad','Operador','Coordinador','Tramo','Circuito']);
  crearSi(SHEETS_CONFIG.CONTROL_CAJAS, ['NumeroCaja','Estado','Patio','Cargada','Observaciones']);
  return 'OK — 4 hojas verificadas';
}

function triggerWhatsapp() { processWhatsapp(); }
