// ============================================================
// CONFIG.JS — HUB OPERATIVO NAL · ABC XIMPLE LOGISTICS
// Edita este archivo para agregar/quitar unidades autorizadas
// ============================================================

const CONFIG = {

  // ── ID DE TU GOOGLE SHEETS ──────────────────────────────
  SHEETS_ID: '1Ozxdr-V67f-IsaBBb7Jqp9LETwRrFm0widhoqt-2axs',

  // ── URL DEL APPS SCRIPT (pegar después de desplegar) ────
  // Reemplaza con tu URL tras publicar el Apps Script
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxKZpJIaLmEmmZLczCU2fW5laBycCzZQzyB0Y0BBzaSyPH-jXmEeb_Ubu4Yj_3z2P3SPw/exec',

  // ── NOMBRES EXACTOS DE PESTAÑAS EN TU SHEETS ────────────
  SHEETS: {
    ESTATUS:     'Estatus_Diario',       // EstatusDiarioDetalle
    INCIDENCIAS: 'Incidencias',
    RENDIMIENTOS:'Rendimientos',
    SOLICITUDES: 'Solicitudes_Mtto',
    DATA:        'Data',                  // Circuitos y utilidad
    MOVIMIENTOS: 'Movimientos_RH',
    WHATSAPP:    'Whats App',             // Nueva hoja
    URGENCIAS:   'Urgencias',             // Nueva hoja (auto-llenada)
  },

  // ── AUTO-REFRESH ─────────────────────────────────────────
  REFRESH_DEFAULT: 300, // segundos (5 minutos por defecto)
  REFRESH_OPTIONS: [
    { label: '30 segundos', value: 30 },
    { label: '1 minuto',    value: 60 },
    { label: '2 minutos',   value: 120 },
    { label: '5 minutos',   value: 300 },
    { label: 'Manual',      value: 0 },
  ],

  // ── OPERACIÓN ────────────────────────────────────────────
  OPERACION:    'Nacional',
  EMPRESA:      'ABC Ximple Logistics',
  JEFA:         'Cecilia Camarillo',
  CARGO:        'Jefa de Operaciones Nacionales',

  // ── COORDINADORES NAL ────────────────────────────────────
  COORDINADORES: [
    'YAMILETH FERNANDEZ MURILLO',
    'JUAN JOSE TELLO LAMAS',
    'JULIO ALEJANDRO HERNANDEZ GALVAN',
  ],

  // ── CODIGOS DE ESTATUS ───────────────────────────────────
  PRODUCTIVOS:    ['TRN', 'VTA', 'MOV', 'LIB'],
  DISPONIBLES:    ['DCO', 'DSO'],
  MANTENIMIENTO:  ['CP', 'SG', 'RM', 'SGR'],
  SIN_OPERADOR:   ['SO'],
  PERMISOS:       ['PER'],

  ETIQUETAS_ESTATUS: {
    TRN: 'En Tránsito',    VTA: 'Facturando',
    MOV: 'Movimiento',     LIB: 'Por Liberar',
    DCO: 'Dispo c/Op',     DSO: 'Dispo s/Op',
    SO:  'Sin Operador',   CP:  'Correctivo',
    SG:  'Siniestro',      RM:  'Rep. Mayor',
    SGR: 'GPS/Rotulación', PER: 'Permiso',
  },

  // ── UMBRALES RENDIMIENTO (km/L) ──────────────────────────
  REND: {
    CRITICO: 2.0,
    BAJO:    2.5,
    BUENO:   3.0,
  },

  // ── 83 UNIDADES NACIONALES AUTORIZADAS ──────────────────
  // Edita esta lista para agregar o quitar unidades
  UNIDADES_NACIONALES: [
    '014-ABC', '019-ABC', '023-ABC', '026-ABC', '030-ABC',
    '034-ABC', '035-ABC', '046-ABC', '060-ABC', '065-ABC',
    '067-ABC', '078-ABC', '084-ABC', '085-ABC', '089-ABC',
    '090-ABC', '095-ABC', '096-ABC', '097-ABC', '100-ABC',
    '102-ABC', '104-ABC', '105-ABC', '111-ABC', '115-ABC',
    '119-ABC', '125-ABC', '132-ABC', '144-ABC', '151-ABC',
    '160-ABC', '161-ABC', '162-ABC', '163-ABC', '164-ABC',
    '165-ABC', '166-ABC', '172-ABC', '173-ABC', '175-ABC',
    '176-ABC', '178-ABC', '182-ABC', '307-ABC', '308-ABC',
    '309-ABC', '310-ABC', '311-ABC', '312-ABC', '314-ABC',
    '315-ABC', '326-ABC', '328-ABC', '329-ABC', '333-ABC',
    '347-ABC', '349-ABC', '350-ABC', '351-ABC', '352-ABC',
    '355-ABC', '368-ABC', '369-ABC', '370-ABC', '371-ABC',
    '376-ABC', '377-ABC', '378-ABC', '379-ABC', '380-ABC',
    '382-ABC', '384-ABC', '385-ABC', '422-ABC', '436-ABC',
    '437-ABC', '438-ABC', '440-ABC', '443-ABC', '448-ABC',
    '450-ABC', '462-ABC', '472-ABC',
  ],

  // Helper: verificar si una unidad es NAL autorizada
  esUnidadNAL(unidad) {
    if (!unidad) return false;
    const u = String(unidad).trim().toUpperCase();
    return this.UNIDADES_NACIONALES.some(n => u === n || u === n.replace('-ABC',''));
  },

  // Helper: normalizar clave de unidad
  normalizar(unidad) {
    if (!unidad) return '';
    const u = String(unidad).trim().toUpperCase();
    if (u.includes('-ABC')) return u;
    if (/^\d+$/.test(u)) return `${u}-ABC`;
    return u;
  },
};
