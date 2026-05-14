// ============================================================
// APP.JS — Lógica principal HUB NAL · ABC Ximple Logistics
// ============================================================

// ── ESTADO GLOBAL ────────────────────────────────────────────
const APP = {
  data: null,
  filter: 'ALL',
  searchQuery: '',
  currentTab: 'dash',
  refreshInterval: CONFIG.REFRESH_DEFAULT,
};

// ── HELPERS ──────────────────────────────────────────────────
const fM = n => n == null ? '—' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fN = n => n == null ? '—' : Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const r2 = n => Math.round(n * 100) / 100;
const r1 = n => Math.round(n * 10) / 10;

const CCLS = { TRN:'bgg', VTA:'bgb', DCO:'bgx', LIB:'bgy', SO:'bgr', CP:'bgo', SG:'bgp', RM:'bgr', PER:'bgx', DSO:'bgx', SGR:'bgx', MOV:'bgg' };
const bg = (c, l) => `<span class="bg ${CCLS[c]||'bgx'}">${l || CONFIG.ETIQUETAS_ESTATUS[c] || c}</span>`;

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  initRefreshSelector();
  initSearchAndFilters();

  // Cargar datos
  SHEETS.onData(data => {
    APP.data = processData(data);
    renderAll();
  });

  SHEETS.onError(err => {
    showError('Error conectando a Google Sheets. Verifica la configuración.');
    console.error(err);
  });

  try {
    const raw = await SHEETS.fetchAll(true);
    APP.data = processData(raw);
    renderAll();
    SHEETS.startRefresh(APP.refreshInterval, data => {
      APP.data = processData(data);
      renderAll();
    });
  } catch (err) {
    showError('No se pudo conectar. Revisa el URL del Apps Script en config.js');
  }
});

// ── PROCESAMIENTO DE DATOS ────────────────────────────────────
function processData(raw) {
  if (!raw) return null;

  const est = raw.estatus || {};
  const unidades = (est.unidades || []).filter(u => CONFIG.esUnidadNAL(u.unidad));
  const fecha = est.fecha || new Date().toISOString().substring(0, 10);

  // Rendimientos indexados por unidad
  const rendIdx = {};
  (raw.rendimientos || []).forEach(r => {
    if (CONFIG.esUnidadNAL(r.unidad)) rendIdx[r.unidad] = r;
  });

  // Solicitudes mtto indexadas
  const solIdx = {};
  (raw.solicitudes || []).forEach(s => {
    if (!solIdx[s.unidad]) solIdx[s.unidad] = [];
    solIdx[s.unidad].push(s);
  });

  // Data/circuitos indexada
  const dataInfo = raw.data || { porUnidad: {}, circuitos: {} };
  const unitData = dataInfo.porUnidad || {};
  const circuitos = dataInfo.circuitos || {};

  // Incidencias del mes indexadas por unidad
  const incIdx = {};
  const accidentes = [], multas = [], indisciplinas = [];
  (raw.incidencias || []).forEach(i => {
    if (!incIdx[i.unidad]) incIdx[i.unidad] = [];
    incIdx[i.unidad].push(i);
    if (i.tipo === 'Accidente') accidentes.push(i);
    if (i.tipo === 'Multa') multas.push(i);
    if (i.tipo === 'Indisciplinas') indisciplinas.push(i);
  });

  // Construir unidades enriquecidas
  const units = unidades.map(u => {
    const rend = rendIdx[u.unidad] || {};
    const inc = incIdx[u.unidad] || [];
    const mtto = solIdx[u.unidad] || [];
    const dInfo = unitData[u.unidad] || {};
    return {
      ...u,
      rv:      rend.rv || null,
      kms:     rend.kms || null,
      lit:     rend.litros || null,
      vmax:    rend.vmax || null,
      rel:     rend.relenti || null,
      tu:      rend.tipo_u || 'Tractor',
      rf:      rend.rf || 'nd',
      inc:     inc.length,
      ilist:   inc,
      mtto,
      circ:    dInfo.circ || '',
      fact:    dInfo.fact || 0,
      util:    dInfo.util || 0,
    };
  });

  // KPIs
  const K = calcKPIs(units);

  // Coordinadores
  const coords = calcCoords(units, CONFIG.COORDINADORES);

  // Rendimiento por tipo
  const rend_tipo = calcRendTipo(units);

  // Top incidencias
  const op_rec = calcTopOp(raw.incidencias || []);
  const unit_rec = calcTopUnit(units);

  // Urgencias
  const urgencias = raw.urgencias || [];

  return {
    fecha, units, K, coords, rend_tipo,
    circs: Object.values(circuitos),
    accidentes, multas, indisciplinas,
    op_rec, unit_rec,
    mov_rh: raw.movimientos || [],
    urgencias,
  };
}

// ── KPIs ──────────────────────────────────────────────────────
function calcKPIs(units) {
  const codes = units.map(u => u.code);
  const trn = codes.filter(c => c === 'TRN').length;
  const vta = codes.filter(c => c === 'VTA').length;
  const mov = codes.filter(c => c === 'MOV').length;
  const dco = codes.filter(c => c === 'DCO').length;
  const lib = codes.filter(c => c === 'LIB').length;
  const so  = codes.filter(c => c === 'SO').length;
  const cp  = codes.filter(c => c === 'CP').length;
  const sg  = codes.filter(c => c === 'SG').length;
  const rm  = codes.filter(c => c === 'RM').length;
  const per = codes.filter(c => ['PER','DSO','SGR'].includes(c)).length;
  const prod = trn + vta + mov;
  const improd = so + cp + sg + rm + per;
  const total = units.length;

  // Rendimiento promedio solo de unidades con datos válidos
  const rvs = units.filter(u => u.rv && u.rv > 0.5 && u.rv < 9).map(u => u.rv);
  const rend_avg = rvs.length ? r2(rvs.reduce((a,b) => a+b, 0) / rvs.length) : 0;

  // Venta hoy = suma de montos VTA del día
  const venta = r2(units.filter(u => u.code === 'VTA').reduce((s, u) => s + (u.monto || 0), 0));

  // Facturación y utilidad acumulada mes (desde data/circuitos)
  const fact_mes = r2(units.reduce((s, u) => s + (u.fact || 0), 0));
  const util_mes = r2(units.reduce((s, u) => s + (u.util || 0), 0));

  // Incidencias totales del mes
  const inc_may  = units.reduce((s, u) => s + u.inc, 0);
  const sol_mtto = units.reduce((s, u) => s + u.mtto.length, 0);

  return {
    total, trn, vta, mov, dco, lib, so, cp, sg, rm, per,
    prod, improd,
    prod_pct:   r2(prod / total * 100),
    improd_pct: r2(improd / total * 100),
    rend_avg,
    bajo_rend:  units.filter(u => u.rf === 'critico').length,
    venta, fact_mes, util_mes,
    margen: fact_mes > 0 ? r2(util_mes / fact_mes * 100) : 0,
    inc_may, sol_mtto,
  };
}

// ── COORDINADORES ─────────────────────────────────────────────
function calcCoords(units, coords) {
  return coords.map(cname => {
    const cu = units.filter(u => u.coord === cname);
    if (!cu.length) return null;
    const t = cu.length;
    const p = cu.filter(u => ['TRN','VTA','MOV'].includes(u.code)).length;
    const fact = r2(cu.reduce((s, u) => s + (u.fact||0), 0));
    const util = r2(cu.reduce((s, u) => s + (u.util||0), 0));
    const rvs = cu.filter(u => u.rv && u.rv > 0.5 && u.rv < 9).map(u => u.rv);
    const rend = rvs.length ? r2(rvs.reduce((a,b) => a+b, 0)/rvs.length) : 0;
    const inc = cu.reduce((s,u) => s+u.inc, 0);
    const so = cu.filter(u => u.code==='SO').length;
    const mtto = cu.filter(u => ['CP','SG','RM'].includes(u.code)).length;
    const circs = [...new Set(cu.map(u => u.circ).filter(Boolean))];
    return {
      coord: cname, total: t, prod: p, so, mtto,
      util_pct: r2(p/t*100),
      fact, util, margen: fact > 0 ? r2(util/fact*100) : 0,
      rend, inc, circs,
    };
  }).filter(Boolean);
}

// ── RENDIMIENTO POR TIPO ──────────────────────────────────────
function calcRendTipo(units) {
  const tipos = {};
  units.forEach(u => {
    const tu = u.tu || 'Tractor';
    const t = tu.toUpperCase();
    const cat = (t.includes('RABON') || t.includes('RABÓN')) ? 'Rabón'
              : t.includes('3.5') ? '3.5 Ton'
              : t.includes('SITRAK') ? 'Sitrak'
              : 'Tractor';
    if (!tipos[cat]) tipos[cat] = { cat, units: 0, rvs: [], kms: 0 };
    tipos[cat].units++;
    if (u.rv && u.rv > 0.5 && u.rv < 9) tipos[cat].rvs.push(u.rv);
    if (u.kms) tipos[cat].kms += u.kms;
  });
  return Object.values(tipos).map(td => ({
    cat: td.cat, units: td.units,
    rend: td.rvs.length ? r2(td.rvs.reduce((a,b) => a+b,0)/td.rvs.length) : 0,
    kms: r1(td.kms),
  }));
}

function calcTopOp(incidencias) {
  const c = {};
  incidencias.forEach(i => {
    if (i.operador) c[i.operador] = (c[i.operador] || 0) + 1;
  });
  return Object.entries(c).sort((a,b) => b[1]-a[1]).slice(0,8).map(([op,n]) => ({ op, n }));
}

function calcTopUnit(units) {
  return [...units].sort((a,b) => b.inc-a.inc).slice(0,8).map(u => ({ u: u.unidad, n: u.inc }));
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
function renderAll() {
  if (!APP.data) return;
  renderDash();
  renderGrid(APP.data.units);
  // Renderizar tab activo si no es dash
  if (APP.currentTab !== 'dash') {
    const renders = { inc: renderInc, rend: renderRend, mtto: renderMtto, seg: renderSeg, circ: renderCirc, mens: renderMens };
    if (renders[APP.currentTab]) renders[APP.currentTab]();
  }
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDash() {
  const D = APP.data;
  const K = D.K;

  // Fecha
  const fhdr = document.getElementById('fhdr');
  if (fhdr) fhdr.textContent = '📅 ' + new Date(D.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  // KPIs principales
  set('kd', `
    <div class="kt kb"><div class="v">${K.total}</div><div class="l">Unidades NAL</div><div class="s" style="color:#2980b9">Flota activa</div></div>
    <div class="kt kg"><div class="v">${K.prod}</div><div class="l">Productivas</div><div class="s" style="color:#27ae60">TRN+VTA · ${K.prod_pct}%</div></div>
    <div class="kt kb"><div class="v">${fM(K.venta)}</div><div class="l">Venta Hoy</div><div class="s" style="color:#2980b9">${K.vta} VTA activas</div></div>
    <div class="kt kr2"><div class="v">${K.so}</div><div class="l">Sin Operador</div><div class="s" style="color:#c0392b">⚠ ${r2(K.so/K.total*100)}% flota</div></div>
    <div class="kt ko"><div class="v">${K.sol_mtto}</div><div class="l">Sol. Mtto</div><div class="s" style="color:#d35400">Abiertas</div></div>
    <div class="kt ky"><div class="v">${K.rend_avg}</div><div class="l">Rend. km/L</div><div class="s" style="color:#d68910">${K.bajo_rend} crítico</div></div>
  `);

  // Fleet grid
  const fd = [
    {c:'TRN',n:K.trn,l:'En Tránsito'}, {c:'VTA',n:K.vta,l:'Facturando'}, {c:'DCO',n:K.dco,l:'Dispo c/Op'},
    {c:'LIB',n:K.lib,l:'Por Liberar'}, {c:'SO',n:K.so,l:'Sin Operador'}, {c:'CP',n:K.cp,l:'Correctivo'},
    {c:'SG',n:K.sg,l:'Siniestro'},     {c:'RM',n:K.rm,l:'Rep. Mayor'},   {c:'PER',n:K.per,l:'PER/DSO'},
  ];
  set('fg', fd.map(f => `
    <div class="fb f${f.c}" onclick="setFilter('${f.c}'); goTab('flota')">
      <div class="fn">${f.n}</div><div class="fc">${f.c}</div><div class="fl">${f.l}</div>
    </div>`).join(''));

  set('pp', `${K.prod} (${K.prod_pct}%)`);
  set('dp', `${K.dco+K.lib} (${r2((K.dco+K.lib)/K.total*100)}%)`);
  set('ip', `${K.improd} (${K.improd_pct}%)`);

  // Urgencias WhatsApp
  renderUrgencias();

  // Críticos
  const so_u = D.units.filter(u => u.code==='SO').map(u => u.unidad).slice(0,5).join(', ');
  const rm_u = D.units.filter(u => u.code==='RM').map(u => u.unidad).join(', ');
  const sg_u = D.units.filter(u => u.code==='SG').map(u => u.unidad).slice(0,3).join(', ');
  const cr   = D.units.filter(u => u.rf==='critico').slice(0,3).map(u => `${u.unidad}(${u.rv?.toFixed(2)})`).join(', ');

  const criticos = [];
  if (K.so > 0) criticos.push({d:'dr', t:`<b>${K.so} unidades SIN OPERADOR</b> — ${so_u}${K.so>5?'...':''}`});
  if (K.rm > 0) criticos.push({d:'dr', t:`<b>${K.rm} Rep. Mayor sin fecha:</b> ${rm_u}`});
  if (K.sg > 0) criticos.push({d:'dr', t:`<b>${K.sg} Siniestros activos:</b> ${sg_u}`});
  if (K.bajo_rend > 0) criticos.push({d:'dr', t:`<b>${K.bajo_rend} unidades rendimiento crítico &lt;2.0:</b> ${cr}`});
  if (D.accidentes.length > 0) criticos.push({d:'dr', t:`<b>${D.accidentes.length} accidente(s) en el mes</b> — gestionar aseguradora`});
  if (!criticos.length) criticos.push({d:'dg', t:'Sin alertas críticas activas ✓'});

  set('crit', criticos.map(a => `<li><span class="dot ${a.d}"></span><span>${a.t}</span></li>`).join(''));

  // Coordinadores
  set('coords', D.coords.map((c, i) => {
    const colors = ['#27ae60','#3498db','#9b59b6'];
    const sn = c.coord.split(' ').slice(0,2).join(' ');
    return `<div class="cc" style="border-left-color:${colors[i]||'#95a5a6'}">
      <div class="cname">${sn}</div>
      <div style="font-size:10px;color:#64748b">${c.coord}</div>
      <div class="cstats">
        <div class="cstat"><div class="cv" style="color:#2980b9">${c.total}</div><div class="cl">Uds</div></div>
        <div class="cstat"><div class="cv" style="color:#27ae60">${c.prod}</div><div class="cl">Activas</div></div>
        <div class="cstat"><div class="cv" style="color:${c.margen>=10?'#27ae60':c.margen>=5?'#d68910':'#c0392b'};font-size:11px">${fM(c.util)}</div><div class="cl">Utilidad</div></div>
        <div class="cstat"><div class="cv" style="color:${c.margen>=10?'#27ae60':c.margen>=5?'#d68910':'#c0392b'}">${c.margen}%</div><div class="cl">Margen</div></div>
      </div>
      <div style="margin-top:6px;font-size:10px;display:flex;gap:10px;flex-wrap:wrap">
        <span>🔴 SO:${c.so}</span><span>🔧 Mtto:${c.mtto}</span><span>⛽ ${c.rend} km/L</span><span>⚠ ${c.inc} inc.</span>
      </div>
      ${c.circs.length ? `<div style="font-size:9px;color:#64748b;margin-top:4px">Circuitos: ${c.circs.slice(0,3).join(', ')}${c.circs.length>3?' +'+(c.circs.length-3):''}</div>` : ''}
      <div style="margin-top:5px"><div style="font-size:9px;color:#64748b;margin-bottom:2px">UTILIZACIÓN ${c.util_pct}%</div>
        <div class="prog"><div class="pf" style="width:${c.util_pct}%;background:${c.util_pct>=70?'#27ae60':c.util_pct>=40?'#f59e0b':'#e74c3c'}"></div></div>
      </div>
    </div>`;
  }).join(''));
}

// ── URGENCIAS WHATSAPP ────────────────────────────────────────
function renderUrgencias() {
  const urgencias = APP.data.urgencias || [];
  const altas = urgencias.filter(u => u.prioridad === 'Alta').slice(0, 5);
  const el = document.getElementById('urgencias-section');
  if (!el) return;

  if (!urgencias.length) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  set('urgencias-list', altas.map(u => `
    <li style="border-left:3px solid ${u.prioridad==='Alta'?'#e74c3c':'#f59e0b'};padding-left:8px">
      <span class="dot ${u.prioridad==='Alta'?'dr':'dy'}"></span>
      <span><b>${u.unidad}</b> · ${u.tipo} · ${u.hora} — ${u.descripcion.substring(0,80)}</span>
    </li>`).join('') || '<li><span class="dot dg"></span><span>Sin urgencias activas</span></li>');
}

// ── FLOTA ─────────────────────────────────────────────────────
function renderGrid(allUnits) {
  const q = APP.searchQuery.toLowerCase();
  const filtered = allUnits.filter(u => {
    if (APP.filter !== 'ALL' && u.code !== APP.filter) return false;
    if (q && ![u.unidad, u.op, u.ruta, u.coord, u.obs].some(s => String(s||'').toLowerCase().includes(q))) return false;
    return true;
  });
  const cnt = document.getElementById('ucnt');
  if (cnt) cnt.textContent = `${filtered.length} de ${allUnits.length} unidades`;
  set('ugrid', filtered.map(u => `
    <div class="uc uc${u.code}" onclick="openUnit('${u.unidad}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="un">${u.unidad}</div>${bg(u.code)}
      </div>
      <div class="uop">${u.op}</div>
      ${u.ruta ? `<div class="urt">→ ${u.ruta}</div>` : ''}
      ${u.obs ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${String(u.obs).substring(0,55)}</div>` : ''}
      <div class="tags">
        ${u.rv ? `<span class="bg ${u.rf==='critico'?'bgr':u.rf==='bajo'?'bgy':'bgx'}">${u.rv.toFixed(2)} km/L</span>` : ''}
        ${u.inc > 0 ? `<span class="bg ${u.inc>=10?'bgr':u.inc>=5?'bgy':'bgx'}">${u.inc} inc.</span>` : ''}
        ${u.monto > 0 ? `<span class="bg bgg">${fM(u.monto)}</span>` : ''}
        ${u.mtto && u.mtto.length ? `<span class="bg bgo">${u.mtto.length} mtto</span>` : ''}
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:5px">${u.tu} · ${u.circ || '—'}</div>
    </div>`).join(''));
}

// ── INCIDENCIAS ───────────────────────────────────────────────
function renderInc() {
  const D = APP.data; const K = D.K;
  set('kinc', `
    <div class="kt kr2"><div class="v">${K.inc_may}</div><div class="l">Total Mes NAL</div></div>
    <div class="kt ko"><div class="v">${D.accidentes.length}</div><div class="l">Accidentes</div><div class="s" style="color:#d35400">${fM(D.accidentes.reduce((s,a)=>s+a.costo,0))}</div></div>
    <div class="kt ky"><div class="v">${D.multas.length}</div><div class="l">Multas</div><div class="s" style="color:#d68910">${fM(D.multas.reduce((s,m)=>s+m.costo,0))}</div></div>
    <div class="kt kb"><div class="v">${D.indisciplinas.length}</div><div class="l">Indisciplinas</div></div>
  `);
  set('incop', D.op_rec.map((o,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
      <span style="color:#64748b">${i+1}.</span>
      <span style="flex:1">${o.op.split(' ').slice(0,3).join(' ')}</span>
      <span class="bg ${o.n>=10?'bgr':o.n>=5?'bgy':'bgx'}">${o.n}</span>
    </div>`).join(''));
  set('incunit', D.unit_rec.map((u,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:11px;cursor:pointer" onclick="openUnit('${u.u}')">
      <span style="color:#64748b">${i+1}.</span>
      <span class="bold" style="color:#2980b9;flex:1">${u.u}</span>
      <span class="bg ${u.n>=10?'bgr':u.n>=5?'bgy':'bgx'}">${u.n} inc.</span>
    </div>`).join(''));
  // Tabla multas
  set('multasbody', D.multas.map(m => `
    <tr><td>${m.fecha}</td>
      <td class="bold" style="color:#2980b9;cursor:pointer" onclick="openUnit('${m.unidad}')">${m.unidad}</td>
      <td>${m.operador.split(' ').slice(0,2).join(' ')}</td>
      <td><span class="bg ${m.subtipo?.includes('ilicitas')?'bgr':m.subtipo?.includes('Cámara')?'bgo':'bgy'}">${m.subtipo}</span></td>
      <td class="${m.costo>0?'tye bold':''}">${m.costo>0?fM(m.costo):'—'}</td>
      <td><span class="bg ${m.estatus==='PendienteCobro'?'bgy':'bgx'}">${m.estatus}</span></td>
    </tr>`).join(''));
}

// ── RENDIMIENTO ───────────────────────────────────────────────
function renderRend() {
  const D = APP.data; const K = D.K;
  set('krend', `
    <div class="kt kb"><div class="v">${K.rend_avg}</div><div class="l">Promedio NAL km/L</div></div>
    <div class="kt kr2"><div class="v">${K.bajo_rend}</div><div class="l">Crítico &lt;2.0</div></div>
    <div class="kt ky"><div class="v">${D.units.filter(u=>u.rf==='bajo').length}</div><div class="l">Bajo 2.0–2.5</div></div>
    <div class="kt kg"><div class="v">${Math.max(...D.units.filter(u=>u.rv&&u.rv<9).map(u=>u.rv), 0).toFixed(2)}</div><div class="l">Máximo</div></div>
  `);
  // Rend por tipo
  const maxR = Math.max(...D.rend_tipo.map(t=>t.rend||0), 1);
  set('rtipo', D.rend_tipo.map(t => `
    <div class="trow">
      <span class="tname">${t.cat}</span>
      <div style="flex:1;padding:0 10px">
        <div style="font-size:10px;color:#64748b">${t.units} uds · ${fN(t.kms)} km</div>
        <div class="tbar" style="margin-top:4px">
          <div class="tfill" style="width:${t.rend?t.rend/maxR*100:0}%;background:${t.rend>=3?'#27ae60':t.rend>=2?'#f59e0b':'#e74c3c'}"></div>
        </div>
      </div>
      <span style="min-width:60px;text-align:right;font-weight:700;color:${t.rend>=3?'#27ae60':t.rend>=2?'#d68910':'#c0392b'}">${t.rend} km/L</span>
    </div>`).join(''));
  // Tabla detalle
  set('rendbody', D.units.filter(u=>u.rv&&u.rv>0).sort((a,b)=>a.rv-b.rv).map(u => {
    const cl = u.rf==='critico'?'bgr':u.rf==='bajo'?'bgy':'bgg';
    return `<tr style="cursor:pointer" onclick="openUnit('${u.unidad}')">
      <td class="bold" style="color:#2980b9">${u.unidad}</td>
      <td>${u.op.split(' ').slice(0,2).join(' ')}</td>
      <td><span class="bg bgx" style="font-size:9px">${u.tu}</span></td>
      <td><span class="bg ${cl}">${u.rv.toFixed(2)}</span></td>
      <td>${u.kms?fN(u.kms):'—'}</td>
      <td>${u.lit?fN(u.lit):'—'}</td>
      <td>${u.vmax||'—'}</td>
      <td>${u.rel!=null?u.rel+'%':'—'}</td>
      <td><span class="bg ${cl}">${u.rf.toUpperCase()}</span></td>
    </tr>`;}).join(''));
}

// ── MANTENIMIENTO ─────────────────────────────────────────────
function renderMtto() {
  const D = APP.data; const K = D.K;
  set('kmtto', `
    <div class="kt kr2"><div class="v">${K.sol_mtto}</div><div class="l">Sol. Abiertas</div></div>
    <div class="kt ko"><div class="v">${D.units.filter(u=>u.code==='CP').length}</div><div class="l">Correctivo</div></div>
    <div class="kt kp"><div class="v">${D.units.filter(u=>u.code==='RM').length}</div><div class="l">Rep. Mayor</div></div>
    <div class="kt kp"><div class="v">${D.units.filter(u=>u.code==='SG').length}</div><div class="l">Siniestros</div></div>
  `);
  const allMtto = [];
  D.units.forEach(u => u.mtto.forEach(m => allMtto.push({...m, unidad:u.unidad, coord:u.coord})));
  set('mttobody', allMtto.map(m => `
    <tr style="cursor:pointer" onclick="openUnit('${m.unidad}')">
      <td>${m.folio}</td>
      <td class="bold" style="color:#2980b9">${m.unidad}</td>
      <td>${m.desc}</td>
      <td>${m.fecha}</td>
      <td><span class="bg bgr">${m.estatus}</span></td>
      <td style="font-size:10px;color:#64748b">${m.coord}</td>
    </tr>`).join(''));
}

// ── SEGURIDAD ─────────────────────────────────────────────────
function renderSeg() {
  const D = APP.data;
  const cA = D.accidentes.reduce((s,a)=>s+a.costo,0);
  const cM = D.multas.reduce((s,m)=>s+m.costo,0);
  set('kseg', `
    <div class="kt kr2"><div class="v">${D.accidentes.length}</div><div class="l">Accidentes NAL</div></div>
    <div class="kt ky"><div class="v">${D.multas.length}</div><div class="l">Multas NAL</div></div>
    <div class="kt ko"><div class="v">${fM(cA)}</div><div class="l">Costo Accidentes</div></div>
    <div class="kt ky"><div class="v">${fM(cM)}</div><div class="l">Costo Multas</div></div>
  `);
  set('accfull', D.accidentes.map(a => `
    <div style="border:1px solid #fde8e8;border-radius:7px;padding:10px;background:#fff9f9;margin-bottom:7px;cursor:pointer" onclick="openUnit('${a.unidad}')">
      <div style="display:flex;justify-content:space-between">
        <span class="bold tr" style="font-size:14px">${a.unidad}</span>
        <span class="bg ${a.estatus==='PendienteCobro'?'bgy':'bgx'}">${a.estatus}</span>
      </div>
      <div style="font-size:11px;margin-top:5px">
        <div>${a.operador} · ${a.fecha}</div>
        <div style="color:#64748b">${a.lugar}</div>
        <div>${a.desc.substring(0,100)}</div>
        ${a.costo>0?`<div class="tye bold">Costo: ${fM(a.costo)}</div>`:''}
      </div>
    </div>`).join('') || '<p class="muted" style="font-size:11px">Sin accidentes registrados</p>');
  set('indisfull', D.indisciplinas.map(i => `
    <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f0f2f5;font-size:11px;cursor:pointer" onclick="openUnit('${i.unidad}')">
      <span class="bold" style="color:#2980b9;min-width:78px">${i.unidad}</span>
      <div style="flex:1"><div>${i.operador.split(' ').slice(0,3).join(' ')}</div><div class="muted">${i.fecha}</div></div>
      <span class="bg ${i.subtipo?.includes('Dormido')?'bgr':'bgo'}">${i.subtipo}</span>
    </div>`).join('') || '<p class="muted" style="font-size:11px">Sin indisciplinas registradas</p>');
}

// ── CIRCUITOS ─────────────────────────────────────────────────
function renderCirc() {
  const D = APP.data;
  set('circbody', [...D.circs].sort((a,b)=>b.util-a.util).map(c => {
    const sem = c.util<0?'<span class="bg bgr">🔴</span>':c.util_ud<10000?'<span class="bg bgy">🟡</span>':'<span class="bg bgg">🟢</span>';
    return `<tr>
      <td class="bold">${c.circ}</td><td>${c.uds}</td>
      <td class="bold" style="color:#2980b9">${fM(c.fact)}</td>
      <td class="bold" style="color:${c.util<0?'#c0392b':'#27ae60'}">${fM(c.util)}</td>
      <td style="color:${c.util_ud<0?'#c0392b':'#475569'}">${fM(c.util_ud)}</td>
      <td>${fN(c.kms)}</td><td>${c.rend?.toFixed(2)||'—'}</td><td>${sem}</td>
    </tr>`;}).join(''));
}

// ── MENSUAL ───────────────────────────────────────────────────
function renderMens() {
  const D = APP.data; const K = D.K;
  set('kmens', `
    <div class="kt kb"><div class="v">${fM(K.fact_mes)}</div><div class="l">Facturación Mes</div><div class="s" style="color:#2980b9">83 uds NAL</div></div>
    <div class="kt kg"><div class="v">${fM(K.util_mes)}</div><div class="l">Utilidad Bruta</div><div class="s" style="color:#27ae60">Margen ${K.margen}%</div></div>
    <div class="kt kr2"><div class="v">${K.inc_may}</div><div class="l">Incidencias NAL</div><div class="s" style="color:#c0392b">${D.accidentes.length} acc.</div></div>
    <div class="kt ky"><div class="v">${fM(D.multas.reduce((s,m)=>s+m.costo,0))}</div><div class="l">Multas NAL</div></div>
  `);
  set('rhbody', D.mov_rh.map(m => `
    <tr><td>${m.tipo}</td><td>${m.cant}</td>
    <td class="${m.tipo.toLowerCase().includes('pista')||m.tipo.toLowerCase().includes('multa')?'tr bold':''}">${fM(m.monto)}</td>
    </tr>`).join('') + `<tr style="font-weight:700;border-top:2px solid #e2e8f0">
    <td>TOTAL</td><td>${D.mov_rh.reduce((s,r)=>s+r.cant,0)}</td>
    <td style="color:#2980b9">${fM(D.mov_rh.reduce((s,r)=>s+r.monto,0))}</td></tr>`);
}

// ── MODAL UNIDAD ──────────────────────────────────────────────
function openUnit(uid) {
  const D = APP.data;
  const u = D.units.find(x => x.unidad === uid);
  if (!u) return;
  const clr = {critico:'#c0392b', bajo:'#d68910', ok:'#27ae60', nd:'#64748b'}[u.rf] || '#64748b';
  const incRows = u.ilist?.length ? `
    <div class="ovf"><table class="tbl"><thead><tr><th>FECHA</th><th>TIPO</th><th>SUBTIPO</th><th>DESCRIPCIÓN</th></tr></thead><tbody>
    ${u.ilist.slice(0,15).map(i=>`<tr><td>${i.fecha}</td><td>${i.tipo}</td><td>${i.subtipo}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.desc}</td></tr>`).join('')}
    </tbody></table></div>` : '<p style="font-size:11px;color:#64748b">Sin incidencias registradas</p>';
  const mttoRows = u.mtto?.length ? `
    <div class="ovf"><table class="tbl"><thead><tr><th>#</th><th>DESCRIPCIÓN</th><th>FECHA</th><th>ESTATUS</th></tr></thead><tbody>
    ${u.mtto.map(m=>`<tr><td>${m.folio}</td><td>${m.desc}</td><td>${m.fecha}</td><td><span class="bg bgr">${m.estatus}</span></td></tr>`).join('')}
    </tbody></table></div>` : '<p style="font-size:11px;color:#64748b">Sin solicitudes abiertas</p>';

  const mc = document.getElementById('mc');
  if (!mc) return;
  mc.innerHTML = `
    <div style="border-bottom:2px solid #f0f2f5;padding-bottom:14px;margin-bottom:16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div><div style="font-size:22px;font-weight:800">${u.unidad}</div>
        <div style="font-size:13px;color:#64748b;margin-top:2px">${u.op}</div>
        <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">${bg(u.code)} <span class="bg bgx">${u.tu}</span> ${u.circ?`<span class="bg bgb">${u.circ}</span>`:''}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#64748b">
        <div>Coord: <b>${u.coord||'—'}</b></div>
        ${u.ruta?`<div>Ruta: <span style="color:#2980b9">${u.ruta}</span></div>`:''}
        ${u.obs?`<div style="max-width:180px">${u.obs}</div>`:''}
      </div>
    </div>
    <div class="g3" style="margin-bottom:14px">
      <div style="background:#f8f9fa;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase">Facturación Mes</div>
        <div style="font-size:20px;font-weight:800;color:#2980b9;margin-top:4px">${fM(u.fact)}</div>
        <div style="font-size:11px;margin-top:2px;color:${u.util>=0?'#27ae60':'#c0392b'}">Utilidad: ${fM(u.util)}</div>
      </div>
      <div style="background:#f8f9fa;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase">Rendimiento</div>
        ${u.rv ? `
          <div style="display:flex;align-items:center;gap:7px;margin-top:8px;font-size:11px">
            <span style="font-weight:700;color:${clr};min-width:38px">${u.rv.toFixed(2)}</span>
            <div style="flex:1;background:#f0f2f5;border-radius:3px;height:5px;overflow:hidden">
              <div style="height:100%;border-radius:3px;width:${Math.min(100,u.rv/5*100)}%;background:${clr}"></div>
            </div>
          </div>
          <div style="font-size:10px;color:#64748b;margin-top:4px">${fN(u.kms)} km · ${fN(u.lit)} L</div>`
        : '<div style="color:#64748b;font-size:11px;margin-top:8px">Sin datos</div>'}
      </div>
      <div style="background:#f8f9fa;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase">Incidencias Mes</div>
        <div style="font-size:28px;font-weight:800;color:${u.inc>=10?'#c0392b':u.inc>=5?'#d68910':'#27ae60'};margin-top:4px">${u.inc}</div>
        <div style="font-size:11px;color:#64748b">Mtto: ${u.mtto?.length||0} sol.${u.monto>0?` · Hoy: ${fM(u.monto)}`:''}</div>
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:8px;border-bottom:2px solid #f0f2f5;padding-bottom:6px">⚠️ INCIDENCIAS DEL MES (${u.inc})</div>
    ${incRows}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin:12px 0 8px;border-bottom:2px solid #f0f2f5;padding-bottom:6px">🔧 MANTENIMIENTO (${u.mtto?.length||0})</div>
    ${mttoRows}`;
  document.getElementById('modal').classList.add('open');
}

// ── TABS ──────────────────────────────────────────────────────
function goTab(id, btn) {
  APP.currentTab = id;
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  const pane = document.getElementById('pane-' + id);
  if (pane) pane.classList.add('on');
  if (btn) btn.classList.add('on');
  else {
    const buttons = document.querySelectorAll('.tb');
    buttons.forEach(b => { if (b.getAttribute('onclick')?.includes(`'${id}'`)) b.classList.add('on'); });
  }
  const renders = { flota: () => renderGrid(APP.data.units), inc: renderInc, rend: renderRend, mtto: renderMtto, seg: renderSeg, circ: renderCirc, mens: renderMens };
  if (APP.data && renders[id]) renders[id]();
}

function setFilter(f) {
  APP.filter = f;
  document.querySelectorAll('.fbtn').forEach(b => {
    b.classList.toggle('on', b.getAttribute('onclick')?.includes(`'${f}'`));
  });
  if (APP.data) renderGrid(APP.data.units);
}

function filterU() {
  APP.searchQuery = document.getElementById('srch')?.value || '';
  if (APP.data) renderGrid(APP.data.units);
}

function filterRend(q) {
  document.querySelectorAll('#rendbody tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

function filterMtto(q) {
  document.querySelectorAll('#mttobody tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

function closeModal() { document.getElementById('modal')?.classList.remove('open'); }

// ── REFRESH SELECTOR ──────────────────────────────────────────
function initRefreshSelector() {
  const sel = document.getElementById('refreshSel');
  if (!sel) return;
  CONFIG.REFRESH_OPTIONS.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === CONFIG.REFRESH_DEFAULT) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    APP.refreshInterval = parseInt(sel.value);
    SHEETS.setRefreshInterval(APP.refreshInterval);
    showToast(APP.refreshInterval > 0 ? `Auto-refresh: cada ${sel.options[sel.selectedIndex].text}` : 'Auto-refresh desactivado');
  });
}

// ── CLOCK ─────────────────────────────────────────────────────
function initClock() {
  const update = () => {
    const d = new Date();
    const el = document.getElementById('clock');
    if (el) el.textContent = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

// ── SEARCH + FILTERS ──────────────────────────────────────────
function initSearchAndFilters() {
  const srch = document.getElementById('srch');
  if (srch) srch.addEventListener('input', filterU);
  document.getElementById('modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeModal();
  });
}

// ── UTILS ─────────────────────────────────────────────────────
function set(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function showError(msg) {
  const el = document.getElementById('errorBar');
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
}
