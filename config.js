// ============================================================
// CONFIG.JS — HUB NAL v2 · ABC XIMPLE LOGISTICS
// ============================================================
const CONFIG = {

  SHEETS_ID: '1Ozxdr-V67f-IsaBBb7Jqp9LETwRrFm0widhoqt-2axs',
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxf94YXZraqyLh7U1Ms1zlSCfAwBys4tp3qmbN0EqGwYaXVdcZXlTBLzZvDfycDV7bBFA/exec',

  SHEETS: {
    ESTATUS:      'Estatus_Diario',
    INCIDENCIAS:  'Incidencias',
    RENDIMIENTOS: 'Rendimientos',
    SOLICITUDES:  'Solicitudes_Mtto',
    DATA:         'Data',
    MOVIMIENTOS:  'Movimientos_RH',
    WHATSAPP:     'Whats App',
    URGENCIAS:    'Urgencias',
    CONTROL_OPS:  'Control_Operadores',
    CONTROL_CAJAS:'Control_Cajas',
  },

  REFRESH_DEFAULT: 300,
  REFRESH_OPTIONS: [
    { label: '30 seg',   value: 30 },
    { label: '1 min',    value: 60 },
    { label: '5 min',    value: 300 },
    { label: 'Manual',   value: 0 },
  ],

  EMPRESA: 'Nacional Autotransporte',
  JEFA:    'Cecilia Camarillo',
  CARGO:   'Jefa de Operaciones Nacionales',

  // Coordinadores — nombres exactos como aparecen en Estatus_Diario columna Coordinador
  COORDINADORES: [
    'YAMILETH FERNANDEZ MURILLO',
    'JUAN JOSE TELLO LAMAS',
    'JULIO ALEJANDRO HERNANDEZ GALVAN',
  ],

  // Alias cortos para UI
  COORD_ALIAS: {
    'YAMILETH FERNANDEZ MURILLO':       'Yamilet',
    'JUAN JOSE TELLO LAMAS':            'Tello',
    'JULIO ALEJANDRO HERNANDEZ GALVAN': 'Julio',
    'EDER':                             'Eder',
  },

  // Nombres alternativos que pueden aparecer en WhatsApp
  COORD_WA_NAMES: {
    'Tello':   'JUAN JOSE TELLO LAMAS',
    'Eder':    'EDER',
    'Julio':   'JULIO ALEJANDRO HERNANDEZ GALVAN',
    'Yamilet': 'YAMILETH FERNANDEZ MURILLO',
    'Yamileth':'YAMILETH FERNANDEZ MURILLO',
  },

  PRODUCTIVOS:   ['TRN','VTA','LIB'],
  DISPONIBLES:   ['DCO','DSO'],
  MANTENIMIENTO: ['CP','SG','RM','SGR'],
  SIN_OPERADOR:  ['SO'],
  PERMISOS:      ['PER','IND'],

  ETIQUETAS_ESTATUS: {
    TRN:'En Tránsito', VTA:'Facturando',  LIB:'Por Liberar',
    DCO:'Dispo c/Op',  DSO:'Dispo s/Op',  SO:'Sin Operador',
    CP:'Correctivo',   SG:'Siniestro',    RM:'Rep. Mayor',
    SGR:'GPS/Rotulac', PER:'Permiso',     IND:'Indisponible',
    MOV:'Movimiento',
  },

  REND: { CRITICO:2.0, BAJO:2.5, BUENO:3.0 },

  // ── 83 UNIDADES NACIONALES AUTORIZADAS ───────────────────
  UNIDADES_NACIONALES: [
    '014-ABC','019-ABC','023-ABC','026-ABC','030-ABC',
    '034-ABC','035-ABC','046-ABC','060-ABC','065-ABC',
    '067-ABC','078-ABC','084-ABC','085-ABC','089-ABC',
    '090-ABC','095-ABC','096-ABC','097-ABC','100-ABC',
    '102-ABC','104-ABC','105-ABC','111-ABC','115-ABC',
    '119-ABC','125-ABC','132-ABC','144-ABC','151-ABC',
    '160-ABC','161-ABC','162-ABC','163-ABC','164-ABC',
    '165-ABC','166-ABC','172-ABC','173-ABC','175-ABC',
    '176-ABC','178-ABC','182-ABC','307-ABC','308-ABC',
    '309-ABC','310-ABC','311-ABC','312-ABC','314-ABC',
    '315-ABC','326-ABC','328-ABC','329-ABC','333-ABC',
    '347-ABC','349-ABC','350-ABC','351-ABC','352-ABC',
    '355-ABC','368-ABC','369-ABC','370-ABC','371-ABC',
    '376-ABC','377-ABC','378-ABC','379-ABC','380-ABC',
    '382-ABC','384-ABC','385-ABC','422-ABC','436-ABC',
    '437-ABC','438-ABC','440-ABC','443-ABC','448-ABC',
    '450-ABC','462-ABC','472-ABC',
  ],

  esUnidadNAL(u) {
    if (!u) return false;
    const s = String(u).trim().toUpperCase().replace(/\s/g,'');
    return this.UNIDADES_NACIONALES.some(n => s === n || s === n.replace('-ABC',''));
  },

  normalizar(u) {
    if (!u) return '';
    const s = String(u).trim().toUpperCase().replace(/\s/g,'');
    if (s.includes('-ABC')) return s;
    if (/^\d+$/.test(s)) return `${s}-ABC`;
    return s;
  },

  coordAlias(nombre) {
    return this.COORD_ALIAS[nombre] || (nombre||'').split(' ')[0];
  },
};
