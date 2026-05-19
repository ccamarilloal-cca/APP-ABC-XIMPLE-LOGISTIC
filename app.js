// ============================================================
// APP.JS — HUB NAL v2 · Nacional Autotransporte
// Correcciones: venta=Monto+Estatus, WhatsApp grupos,
// RH tracking, CAJAS tab, KPIs coordinadores, gastos sin anticipos,
// acumulado DATA, utilización, tramo largo/corto por coord
// ============================================================

const APP = {
  data: null,
  filter: 'ALL',
  searchQuery: '',
  currentTab: 'dash',
  refreshInterval: CONFIG.REFRESH_DEFAULT,
};

// ── HELPERS ──────────────────────────────────────────────────
const fM  = n => n == null ? '—' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits:0, maximumFractionDigits:0 });
const fN  = n => n == null ? '—' : Number(n).toLocaleString('es-MX', { minimumFractionDigits:0, maximumFractionDigits:0 });
const r2  = n => Math.round((n||0)*100)/100;
const r1  = n => Math.round((n||0)*10)/10;
const pct = (a,b) => b > 0 ? r2(a/b*100) : 0;

const CCLS = {
  TRN:'bgg', VTA:'bgb', LIB:'bgy', DCO:'bgx', DSO:'bgx',
  SO:'bgr', CP:'bgo', SG:'bgp', RM:'bgr', SGR:'bgx', PER:'bgx', IND:'bgx', MOV:'bgg',
};
const bg  = (c,l) => `<span class="bg ${CCLS[c]||'bgx'}">${l || CONFIG.ETIQUETAS_ESTATUS[c] || c}</span>`;
const set = (id,html) => { const el=document.getElementById(id); if(el) el.innerHTML=html; };

function showToast(msg) {
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}
function showError(msg) {
  const el=document.getElementById('errorBar');
  if(el){el.textContent='⚠ '+msg;el.style.display='block';}
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  initRefreshSelector();
  try {
    const raw = await SHEETS.fetchAll(true);
    APP.data = processData(raw);
    renderAll();
    SHEETS.startRefresh(APP.refreshInterval, data => {
      APP.data = processData(data);
      renderAll();
    });
  } catch(err) {
    showError('No se pudo conectar. Revisa el URL del Apps Script en config.js');
  }
});

// ── PROCESAMIENTO DE DATOS ────────────────────────────────────
function processData(raw) {
  if (!raw) return null;

  const est      = raw.estatus    || {};
  const ctrlOps  = raw.control_ops || [];

  // Mapa de control_ops para lookup de tramo/circuito (datos fijos)
  const ctrlMap  = {};
  ctrlOps.forEach(o => { ctrlMap[o.unidad] = o; });

  // Solo las 83 unidades NAL del estatus
  const unidades = (est.unidades || []).filter(u => CONFIG.esUnidadNAL(u.unidad));
  const fecha    = est.fecha || new Date().toISOString().substring(0,10);

  // Rendimientos indexados
  const rendIdx = {};
  (raw.rendimientos || []).forEach(r => { if(CONFIG.esUnidadNAL(r.unidad)) rendIdx[r.unidad]=r; });

  // Solicitudes mtto indexadas
  const solIdx  = {};
  (raw.solicitudes || []).forEach(s => {
    if(!solIdx[s.unidad]) solIdx[s.unidad]=[];
    solIdx[s.unidad].push(s);
  });

  // Data/circuitos
  const dataInfo  = raw.data || { porUnidad:{}, circuitos:{}, totales:{} };
  const unitData  = dataInfo.porUnidad || {};

  // Incidencias del mes indexadas
  const incIdx  = {};
  const accidentes=[], multas=[], indisciplinas=[];
  (raw.incidencias || []).forEach(i => {
    if(!incIdx[i.unidad]) incIdx[i.unidad]=[];
    incIdx[i.unidad].push(i);
    if(i.tipo==='Accidente')    accidentes.push(i);
    if(i.tipo==='Multa')        multas.push(i);
    if(i.tipo==='Indisciplinas')indisciplinas.push(i);
  });

  // Construir unidades enriquecidas
  const units = unidades.map(u => {
    const rend  = rendIdx[u.unidad] || {};
    const inc   = incIdx[u.unidad]  || [];
    const mtto  = solIdx[u.unidad]  || [];
    const dInfo = unitData[u.unidad] || {};
    const ctrl  = ctrlMap[u.unidad]  || {};

    return {
      ...u,
      rv:      rend.rv   || null,
      kms:     rend.kms  || null,
      lit:     rend.litros || null,
      vmax:    rend.vmax || null,
      rel:     rend.relenti || null,
      tu:      rend.tipo_u || 'Tractor',
      rf:      rend.rf   || 'nd',
      inc:     inc.length,
      ilist:   inc,
      mtto,
      mtto_pendiente: mtto.filter(m => m.pendiente),
      circ:    ctrl.circuito || dInfo.circ || '',
      tramo:   ctrl.tramo  || '',
      fact:    dInfo.fact  || 0,
      util:    dInfo.util  || 0,
      gasto:   dInfo.gasto || 0,
    };
  });

  const K      = calcKPIs(units, est.ventaTotal, dataInfo.totales);
  const coords = calcCoords(units, dataInfo.totales);

  return {
    fecha, units, K, coords,
    rend_tipo:  calcRendTipo(units),
    circs:      Object.values(dataInfo.circuitos || {}),
    accidentes, multas, indisciplinas,
    op_rec:     calcTopOp(raw.incidencias || []),
    unit_rec:   calcTopUnit(units),
    mov_rh:     raw.movimientos || { items:[], anticipos:{cant:0,monto:0}, totalGasto:0 },
    urgencias:  raw.urgencias || [],
    whatsapp:   raw.whatsapp  || { grupos:{}, rhStats:{} },
    cajas:      raw.cajas     || { cajas:[], stats:{} },
    dataTotales:dataInfo.totales || {},
  };
}

// ── KPIs ──────────────────────────────────────────────────────
function calcKPIs(units, ventaTotal, totalesMes) {
  const codes = units.map(u => u.code);
  const trn = codes.filter(c=>c==='TRN').length;
  const vta = codes.filter(c=>c==='VTA').length;
  const lib = codes.filter(c=>c==='LIB').length;
  const dco = codes.filter(c=>c==='DCO').length;
  const dso = codes.filter(c=>c==='DSO').length;
  const so  = codes.filter(c=>c==='SO').length;
  const cp  = codes.filter(c=>c==='CP').length;
  const sg  = codes.filter(c=>c==='SG').length;
  const rm  = codes.filter(c=>c==='RM').length;
  const per = codes.filter(c=>['PER','IND','DSO'].includes(c)).length;

  // Productivas = TRN + VTA + LIB
  const prod    = trn + vta + lib;
  // Improductivas = SO + CP + SG + RM + PER
  const improd  = so + cp + sg + rm;
  const total   = units.length;

  // Rendimiento promedio
  const rvs     = units.filter(u=>u.rv&&u.rv>0.5&&u.rv<9).map(u=>u.rv);
  const rend_avg= rvs.length ? r2(rvs.reduce((a,b)=>a+b,0)/rvs.length) : 0;

  // Venta del día = viene ya calculada del Apps Script (suma Monto de VTA+TRN+LIB)
  const venta_hoy = r2(ventaTotal || units.filter(u=>u.esVenta).reduce((s,u)=>s+(u.monto||0),0));

  // Acumulado mes desde DATA (totales de circuitos de las 83 unidades)
  const tm  = totalesMes || {};
  const fact_mes = r2(tm.fact  || units.reduce((s,u)=>s+(u.fact||0),0));
  const util_mes = r2(tm.util  || units.reduce((s,u)=>s+(u.util||0),0));
  const gasto_mes= r2(tm.gasto || units.reduce((s,u)=>s+(u.gasto||0),0));

  return {
    total, trn, vta, lib, dco, dso, so, cp, sg, rm, per,
    prod, improd,
    prod_pct:   pct(prod, total),
    improd_pct: pct(improd, total),
    util_flota: pct(prod, total),
    rend_avg,
    bajo_rend:  units.filter(u=>u.rf==='critico').length,
    venta_hoy, fact_mes, util_mes, gasto_mes,
    margen_mes: fact_mes>0 ? pct(util_mes, fact_mes) : 0,
    rentabilidad: fact_mes>0 ? r2(util_mes/fact_mes*100) : 0,
    inc_mes:    units.reduce((s,u)=>s+u.inc,0),
    sol_mtto:   units.reduce((s,u)=>s+u.mtto.length,0),
    mtto_pendientes: units.reduce((s,u)=>s+u.mtto_pendiente.length,0),
  };
}

// ── COORDINADORES ─────────────────────────────────────────────
function calcCoords(units, totalesMes) {
  return CONFIG.COORDINADORES.map(cname => {
    const cu   = units.filter(u => u.coord === cname);
    if (!cu.length) return null;
    const t    = cu.length;
    // Productivas = TRN+VTA+LIB
    const prod = cu.filter(u => CONFIG.PRODUCTIVOS.includes(u.code)).length;
    const so   = cu.filter(u => u.code==='SO').length;
    const mtto = cu.filter(u => CONFIG.MANTENIMIENTO.includes(u.code)).length;
    const dco  = cu.filter(u => ['DCO','DSO'].includes(u.code)).length;

    // Venta del día = suma de Monto de VTA+TRN+LIB de este coordinador
    const venta_hoy = r2(cu.filter(u=>u.esVenta).reduce((s,u)=>s+(u.monto||0),0));

    // Acumulado mes desde DATA (fact, util, gasto por unidad ya filtrada a NAL)
    const fact = r2(cu.reduce((s,u)=>s+(u.fact||0),0));
    const util = r2(cu.reduce((s,u)=>s+(u.util||0),0));
    const gasto= r2(cu.reduce((s,u)=>s+(u.gasto||0),0));

    const rvs  = cu.filter(u=>u.rv&&u.rv>0.5&&u.rv<9).map(u=>u.rv);
    const rend = rvs.length ? r2(rvs.reduce((a,b)=>a+b,0)/rvs.length) : 0;

    // Tramos
    const tramo_largo = cu.filter(u=>u.tramo==='Largo').length;
    const tramo_corto = cu.filter(u=>u.tramo==='Corto').length;

    // Circuitos
    const circs = [...new Set(cu.map(u=>u.circ).filter(Boolean))];

    // Unidades por circuito (para el detalle click)
    const circuito_detalle = {};
    cu.forEach(u => {
      if (!u.circ) return;
      if (!circuito_detalle[u.circ]) circuito_detalle[u.circ]=[];
      circuito_detalle[u.circ].push({ unidad:u.unidad, operador:u.operador, code:u.code });
    });

    return {
      coord: cname,
      alias: CONFIG.coordAlias(cname),
      total: t, prod, so, mtto, dco,
      util_flota: pct(prod, t),
      venta_hoy, fact, util, gasto,
      margen: fact>0 ? pct(util,fact) : 0,
      rentabilidad: fact>0 ? r2(util/fact*100) : 0,
      rend,
      inc:   cu.reduce((s,u)=>s+u.inc,0),
      tramo_largo, tramo_corto,
      circs, circuito_detalle,
    };
  }).filter(Boolean);
}

function calcRendTipo(units) {
  const tipos = {};
  units.forEach(u => {
    const tu = (u.tu||'').toUpperCase();
    const cat = tu.includes('RABON')||tu.includes('RABÓN') ? 'Rabón'
              : tu.includes('3.5') ? '3.5 Ton'
              : 'Tractor';
    if (!tipos[cat]) tipos[cat]={cat,units:0,rvs:[],kms:0};
    tipos[cat].units++;
    if (u.rv&&u.rv>0.5&&u.rv<9) tipos[cat].rvs.push(u.rv);
    if (u.kms) tipos[cat].kms+=u.kms;
  });
  return Object.values(tipos).map(td=>({
    cat:td.cat, units:td.units,
    rend:td.rvs.length ? r2(td.rvs.reduce((a,b)=>a+b,0)/td.rvs.length) : 0,
    kms:r1(td.kms),
  }));
}

function calcTopOp(inc) {
  const c={};
  inc.forEach(i=>{if(i.operador)c[i.operador]=(c[i.operador]||0)+1;});
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([op,n])=>({op,n}));
}
function calcTopUnit(units) {
  return [...units].sort((a,b)=>b.inc-a.inc).slice(0,8).map(u=>({u:u.unidad,n:u.inc}));
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
function renderAll() {
  if (!APP.data) return;
  renderDash();
  renderGrid(APP.data.units);
  const renders = {
    inc:renderInc, rend:renderRend, mtto:renderMtto,
    seg:renderSeg, circ:renderCirc, mens:renderMens,
    cajas:renderCajas,
  };
  if (APP.currentTab !== 'dash' && renders[APP.currentTab]) renders[APP.currentTab]();
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDash() {
  const D=APP.data, K=D.K;

  // Fecha — desde estatus_diario
  const fhdr=document.getElementById('fhdr');
  if (fhdr) {
    const fStr = D.fecha+'T12:00:00';
    fhdr.textContent='📅 '+new Date(fStr).toLocaleDateString('es-MX',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  }

  // KPIs
  set('kd',`
    <div class="kt kb"><div class="v">${K.total}</div><div class="l">Unidades NAL</div><div class="s" style="color:#2980b9">83 autorizadas</div></div>
    <div class="kt kg"><div class="v">${K.prod}</div><div class="l">Productivas</div><div class="s" style="color:#27ae60">TRN+VTA+LIB · ${K.prod_pct}%</div></div>
    <div class="kt kb"><div class="v">${fM(K.venta_hoy)}</div><div class="l">Venta Hoy</div><div class="s" style="color:#2980b9">${D.fecha} · ${K.vta+K.trn+K.lib} unidades</div></div>
    <div class="kt kr2"><div class="v">${K.so}</div><div class="l">Sin Operador</div><div class="s" style="color:#c0392b">⚠ ${pct(K.so,K.total)}% flota</div></div>
    <div class="kt ko"><div class="v">${K.sol_mtto}</div><div class="l">Sol. Mtto</div><div class="s" style="color:#d35400">${K.mtto_pendientes} pendientes liberar</div></div>
    <div class="kt ky"><div class="v">${K.rend_avg}</div><div class="l">Rend. km/L</div><div class="s" style="color:#d68910">${K.bajo_rend} crítico</div></div>
  `);

  // Fleet grid
  const fd=[
    {c:'TRN',n:K.trn,l:'En Tránsito'},{c:'VTA',n:K.vta,l:'Facturando'},{c:'LIB',n:K.lib,l:'Por Liberar'},
    {c:'DCO',n:K.dco,l:'Dispo c/Op'}, {c:'SO',n:K.so,l:'Sin Operador'},{c:'CP',n:K.cp,l:'Correctivo'},
    {c:'SG',n:K.sg,l:'Siniestro'},    {c:'RM',n:K.rm,l:'Rep. Mayor'},  {c:'PER',n:K.per,l:'PER/IND'},
  ];
  set('fg',fd.map(f=>`
    <div class="fb f${f.c}" onclick="setFilter('${f.c}');goTab('flota')">
      <div class="fn">${f.n}</div><div class="fc">${f.c}</div><div class="fl">${f.l}</div>
    </div>`).join(''));

  set('pp',`${K.prod} (${K.prod_pct}%)`);
  set('dp',`${K.dco+K.dso} (${pct(K.dco+K.dso,K.total)}%)`);
  set('ip',`${K.improd} (${K.improd_pct}%)`);

  // Urgencias WhatsApp separadas por grupo
  renderUrgencias();

  // Críticos
  const so_u=D.units.filter(u=>u.code==='SO').map(u=>u.unidad).slice(0,5).join(', ');
  const rm_u=D.units.filter(u=>u.code==='RM').map(u=>u.unidad).join(', ');
  const sg_u=D.units.filter(u=>u.code==='SG').map(u=>u.unidad).slice(0,3).join(', ');
  const cr  =D.units.filter(u=>u.rf==='critico').slice(0,3).map(u=>`${u.unidad}(${u.rv?.toFixed(2)})`).join(', ');
  const mp  =D.units.flatMap(u=>u.mtto_pendiente).slice(0,3).map(m=>`${m.unidad||''}(${m.folio})`).join(', ');

  const criticos=[];
  if(K.so>0) criticos.push({d:'dr',t:`<b>${K.so} unidades SIN OPERADOR</b> — ${so_u}${K.so>5?'...':''}`});
  if(K.rm>0) criticos.push({d:'dr',t:`<b>${K.rm} Rep. Mayor:</b> ${rm_u}`});
  if(K.sg>0) criticos.push({d:'dr',t:`<b>${K.sg} Siniestros:</b> ${sg_u}`});
  if(K.mtto_pendientes>0) criticos.push({d:'do',t:`<b>${K.mtto_pendientes} unidades pendientes de liberar mtto:</b> ${mp}${K.mtto_pendientes>3?'...':''}`});
  if(K.bajo_rend>0) criticos.push({d:'dr',t:`<b>${K.bajo_rend} rendimiento crítico &lt;2.0:</b> ${cr}`});
  if(D.accidentes.length>0) criticos.push({d:'dr',t:`<b>${D.accidentes.length} accidente(s) en el mes</b>`});
  if(!criticos.length) criticos.push({d:'dg',t:'Sin alertas críticas activas ✓'});
  set('crit',criticos.map(a=>`<li><span class="dot ${a.d}"></span><span>${a.t}</span></li>`).join(''));

  // KPIs mes en dashboard
  const tm=D.dataTotales;
  set('kmes',`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
      <div style="padding:8px;background:#f8f9fa;border-radius:6px"><div class="bold" style="font-size:15px;color:#3498db">${fM(D.K.fact_mes)}</div><div class="muted">Facturación mes</div></div>
      <div style="padding:8px;background:#f8f9fa;border-radius:6px"><div class="bold" style="font-size:15px;color:#27ae60">${fM(D.K.util_mes)}</div><div class="muted">Utilidad mes</div></div>
      <div style="padding:8px;background:#f8f9fa;border-radius:6px"><div class="bold" style="font-size:15px;color:#e74c3c">${fM(D.K.gasto_mes)}</div><div class="muted">Gasto total mes</div></div>
      <div style="padding:8px;background:#f8f9fa;border-radius:6px"><div class="bold" style="font-size:14px;color:${D.K.margen_mes>=10?'#27ae60':D.K.margen_mes>=5?'#d68910':'#c0392b'}">${D.K.margen_mes}%</div><div class="muted">% Rentabilidad</div></div>
      <div style="padding:8px;background:#f8f9fa;border-radius:6px"><div class="bold" style="font-size:15px;color:#d68910">${D.K.rend_avg}</div><div class="muted">Rend prom km/L</div></div>
      <div style="padding:8px;background:#f8f9fa;border-radius:6px"><div class="bold" style="font-size:15px;color:#e74c3c">${D.K.inc_mes}</div><div class="muted">Incidencias mes</div></div>
    </div>`);

  // Coordinadores KPIs
  renderCoords();
}

// ── URGENCIAS WHATSAPP — separadas por grupo ──────────────────
function renderUrgencias() {
  const D=APP.data;
  const urg=D.urgencias||[];
  const wa=D.whatsapp||{};
  const grupos=wa.grupos||{};
  const rhs=wa.rhStats||{};

  const hoy=new Date().toISOString().substring(0,10);
  const ayer=new Date(Date.now()-86400000).toISOString().substring(0,10);
  const antayer=new Date(Date.now()-172800000).toISOString().substring(0,10);

  // Filtrar urgencias: del día + las de 1-2 días antes sin resolver
  const urgActivas=urg.filter(u=>{
    if(u.fecha===hoy) return true;
    if((u.fecha===ayer||u.fecha===antayer)&&u.estatus==='Pendiente') return true;
    return false;
  });

  const el=document.getElementById('urgencias-section');
  const tieneContenido=urgActivas.length||grupos.rescates?.length||grupos.siniestros?.length||rhs.entrevistasHoy>0;
  if(!el) return;

  if(!tieneContenido){el.style.display='none';return;}
  el.style.display='block';

  // ── 1. RESCATES (solo mis unidades NAL)
  const rescHTML = (grupos.rescates||[]).length ? `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;color:#d35400;text-transform:uppercase;margin-bottom:4px">🔧 RESCATES (${grupos.rescates.length})</div>
      ${grupos.rescates.map(r=>`
        <div style="background:#fff3e0;border-left:3px solid #e67e22;border-radius:4px;padding:6px 8px;margin-bottom:4px;font-size:11px">
          <div style="display:flex;justify-content:space-between">
            <span class="bold" style="color:#e67e22">${r.unidad}</span>
            <span style="color:#64748b;font-size:10px">${r.fecha} ${r.hora}</span>
          </div>
          <div>${r.descripcion.substring(0,120)}</div>
          <span class="bg ${r.estatus==='Pendiente'?'bgr':'bgx'}">${r.estatus}</span>
        </div>`).join('')}
    </div>` : '';

  // ── 2. SINIESTROS (solo mis unidades NAL)
  const sinHTML = (grupos.siniestros||[]).length ? `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;color:#c0392b;text-transform:uppercase;margin-bottom:4px">🚨 SINIESTROS (${grupos.siniestros.length})</div>
      ${grupos.siniestros.map(s=>`
        <div style="background:#fde8e8;border-left:3px solid #e74c3c;border-radius:4px;padding:6px 8px;margin-bottom:4px;font-size:11px">
          <div style="display:flex;justify-content:space-between">
            <span class="bold" style="color:#c0392b">${s.unidad}</span>
            <span style="color:#64748b;font-size:10px">${s.fecha} ${s.hora}</span>
          </div>
          <div>${s.descripcion.substring(0,120)}</div>
          <span class="bg bgr">${s.estatus}</span>
        </div>`).join('')}
    </div>` : '';

  // ── 3. RH — entrevistas de la semana, liberaciones, sin trazabilidad
  const det=rhs.detalle||[];
  const entrevistasHTML = det.filter(e=>e.tipo==='Entrevista').map(e=>`
    <div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
      <span style="min-width:60px;color:#64748b;font-size:10px">${e.fecha} ${e.hora}</span>
      <div style="flex:1">
        <span class="bold">${e.operador||'Sin nombre'}</span>
        ${e.unidadAsig?`<span class="bg bgb" style="margin-left:4px">${e.unidadAsig}</span>`:''}
      </div>
      <span class="bg ${e.estatus==='Liberado'?'bgg':e.estatus==='En proceso'?'bgy':'bgx'}">${e.estatus}</span>
    </div>`).join('');

  const liberacionesHTML = det.filter(e=>e.tipo==='Liberación').map(e=>`
    <div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
      <span style="min-width:60px;color:#64748b;font-size:10px">${e.fecha} ${e.hora}</span>
      <div style="flex:1"><span class="bold">${e.operador||'—'}</span>${e.unidadAsig?` → <span class="bg bgb">${e.unidadAsig}</span>`:''}</div>
      <span style="color:#64748b;font-size:10px">${e.tiempoRespMin!=null?Math.floor(e.tiempoRespMin/60)+'h '+e.tiempoRespMin%60+'min':'—'}</span>
    </div>`).join('');

  const rhHTML = (rhs.entrevistasSemana>0||rhs.liberadosSemana>0) ? `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;color:#2471a3;text-transform:uppercase;margin-bottom:6px">👤 RH — SEMANA ACTUAL</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px;font-size:11px">
        <div style="background:#ebf5fb;border-radius:6px;padding:7px;text-align:center">
          <div class="bold" style="font-size:18px;color:#2980b9">${rhs.entrevistasHoy||0}</div><div style="color:#64748b">Hoy</div></div>
        <div style="background:#ebf5fb;border-radius:6px;padding:7px;text-align:center">
          <div class="bold" style="font-size:18px;color:#2980b9">${rhs.entrevistasSemana||0}</div><div style="color:#64748b">Entrevistas sem.</div></div>
        <div style="background:#e9f7ef;border-radius:6px;padding:7px;text-align:center">
          <div class="bold" style="font-size:18px;color:#27ae60">${rhs.liberadosSemana||0}</div><div style="color:#64748b">Liberados</div></div>
        <div style="background:${rhs.sinTrazabilidad>0?'#fef9e7':'#f8f9fa'};border-radius:6px;padding:7px;text-align:center">
          <div class="bold" style="font-size:18px;color:${rhs.sinTrazabilidad>0?'#d68910':'#64748b'}">${rhs.sinTrazabilidad||0}</div><div style="color:#64748b">Sin respuesta</div></div>
      </div>
      ${rhs.tiempoPromMin!=null?`<div style="font-size:11px;color:#64748b;margin-bottom:6px">⏱ Tiempo promedio respuesta: <b>${Math.floor(rhs.tiempoPromMin/60)}h ${rhs.tiempoPromMin%60}min</b></div>`:''}
      ${det.length?`
      <details style="font-size:11px">
        <summary style="cursor:pointer;color:#2471a3;font-weight:600;margin-bottom:4px">Ver detalle entrevistas (${det.filter(e=>e.tipo==='Entrevista').length})</summary>
        ${entrevistasHTML||'<div class="muted">Sin entrevistas registradas</div>'}
      </details>
      <details style="font-size:11px;margin-top:6px">
        <summary style="cursor:pointer;color:#27ae60;font-weight:600;margin-bottom:4px">Ver liberaciones (${det.filter(e=>e.tipo==='Liberación').length})</summary>
        ${liberacionesHTML||'<div class="muted">Sin liberaciones</div>'}
      </details>`:''}
    </div>` : '';

  // Urgencias del día + sin seguimiento
  const urgHTML = urgActivas.length ? `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;color:#7d3c98;text-transform:uppercase;margin-bottom:4px">📌 URGENCIAS ACTIVAS (${urgActivas.length})</div>
      ${urgActivas.map(u=>`
        <div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
          <span class="dot ${u.prioridad==='Alta'?'dr':u.fecha<hoy?'dy':'db2'}" style="margin-top:4px;flex-shrink:0"></span>
          <div style="flex:1">
            ${u.unidad?`<b>${u.unidad}</b> · `:''}${u.tipo}
            ${u.fecha<hoy?`<span class="bg bgy" style="margin-left:4px">Sin seguimiento ${u.fecha}</span>`:''}
            <div style="color:#64748b">${u.descripcion.substring(0,80)}</div>
          </div>
          <span class="bg ${u.estatus==='Pendiente'?'bgr':'bgx'}">${u.estatus}</span>
        </div>`).join('')}
    </div>` : '';

  set('urgencias-list', rescHTML+sinHTML+rhHTML+urgHTML || '<div class="muted" style="font-size:11px">Sin urgencias activas</div>');
}

// ── COORDINADORES — tarjetas con click para ver circuitos ─────
function renderCoords() {
  const D=APP.data;
  const colors=['#27ae60','#3498db','#9b59b6'];
  set('coords', D.coords.map((c,i)=>`
    <div class="cc" style="border-left-color:${colors[i]||'#95a5a6'}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="cname">${c.alias}</div>
        <div style="font-size:9px;color:#64748b">${c.coord.split(' ').slice(0,3).join(' ')}</div>
      </div>
      <div class="cstats">
        <div class="cstat"><div class="cv" style="color:#2980b9">${c.total}</div><div class="cl">Uds</div></div>
        <div class="cstat"><div class="cv" style="color:#27ae60">${c.prod}</div><div class="cl">Activas</div></div>
        <div class="cstat"><div class="cv" style="color:#d68910;font-size:11px">${fM(c.venta_hoy)}</div><div class="cl">Venta hoy</div></div>
        <div class="cstat"><div class="cv" style="color:${c.margen>=10?'#27ae60':c.margen>=5?'#d68910':'#c0392b'};font-size:11px">${fM(c.util)}</div><div class="cl">Utilidad mes</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;font-size:10px">
        <div style="background:#f8f9fa;border-radius:4px;padding:4px 6px"><span class="muted">Facturación:</span> <b>${fM(c.fact)}</b></div>
        <div style="background:#f8f9fa;border-radius:4px;padding:4px 6px"><span class="muted">Gasto:</span> <b>${fM(c.gasto)}</b></div>
        <div style="background:#f8f9fa;border-radius:4px;padding:4px 6px"><span class="muted">Rentabilidad:</span> <b style="color:${c.margen>=10?'#27ae60':c.margen>=5?'#d68910':'#c0392b'}">${c.margen}%</b></div>
        <div style="background:#f8f9fa;border-radius:4px;padding:4px 6px"><span class="muted">Rend.:</span> <b>${c.rend} km/L</b></div>
      </div>
      <div style="margin-top:6px;font-size:10px;display:flex;gap:8px;flex-wrap:wrap">
        <span>🔴 SO:${c.so}</span><span>🔧 Mtto:${c.mtto}</span>
        <span>🟡 Largo:${c.tramo_largo}</span><span>🔵 Corto:${c.tramo_corto}</span>
        <span>⚠ ${c.inc} inc.</span>
      </div>
      <div style="margin-top:5px">
        <div style="font-size:9px;color:#64748b;margin-bottom:2px">UTILIZACIÓN ${c.util_flota}%</div>
        <div class="prog"><div class="pf" style="width:${c.util_flota}%;background:${c.util_flota>=70?'#27ae60':c.util_flota>=40?'#f59e0b':'#e74c3c'}"></div></div>
      </div>
      ${c.circs.length?`
      <div style="margin-top:6px">
        <div style="font-size:9px;color:#64748b;font-weight:700;margin-bottom:3px">CIRCUITOS (clic para ver unidades):</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px">
          ${c.circs.map(circ=>`<span class="bg bgb" style="cursor:pointer;font-size:9px" onclick="openCircuitoCoord('${c.coord}','${circ}')">${circ}</span>`).join('')}
        </div>
      </div>` : ''}
    </div>`).join(''));
}

// Modal: unidades de un circuito de un coordinador
function openCircuitoCoord(coord, circ) {
  const D=APP.data;
  const c=D.coords.find(x=>x.coord===coord);
  if(!c) return;
  const uds=c.circuito_detalle[circ]||[];
  const mc=document.getElementById('mc');
  if(!mc) return;
  mc.innerHTML=`
    <div style="padding-bottom:12px;border-bottom:2px solid #f0f2f5;margin-bottom:14px">
      <div style="font-size:18px;font-weight:800">${circ}</div>
      <div style="font-size:12px;color:#64748b;margin-top:3px">Coordinador: ${CONFIG.coordAlias(coord)} · ${uds.length} unidades</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
      ${uds.map(u=>`
        <div style="background:#f8f9fa;border-radius:8px;padding:10px;cursor:pointer" onclick="closeModal();setTimeout(()=>openUnit('${u.unidad}'),100)">
          <div style="font-size:14px;font-weight:800;color:#1a1a2e">${u.unidad}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.operador||'Sin operador'}</div>
          <div style="margin-top:5px">${bg(u.code)}</div>
        </div>`).join('')}
    </div>`;
  document.getElementById('modal').classList.add('open');
}

// ── FLOTA ─────────────────────────────────────────────────────
function renderGrid(allUnits) {
  const q=APP.searchQuery.toLowerCase();
  const filtered=allUnits.filter(u=>{
    if(APP.filter!=='ALL'&&u.code!==APP.filter) return false;
    if(q&&![u.unidad,u.operador,u.ruta,u.coord,u.obs,u.circ].some(s=>String(s||'').toLowerCase().includes(q))) return false;
    return true;
  });
  const cnt=document.getElementById('ucnt');
  if(cnt) cnt.textContent=`${filtered.length} de ${allUnits.length} unidades`;
  set('ugrid',filtered.map(u=>`
    <div class="uc uc${u.code}" onclick="openUnit('${u.unidad}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="un">${u.unidad}</div>${bg(u.code)}
      </div>
      <div class="uop">${u.operador||'Sin operador'}</div>
      ${u.ruta?`<div class="urt">→ ${u.ruta}</div>`:''}
      ${u.obs?`<div style="font-size:10px;color:#94a3b8;margin-top:2px">${String(u.obs).substring(0,55)}</div>`:''}
      <div class="tags">
        ${u.rv?`<span class="bg ${u.rf==='critico'?'bgr':u.rf==='bajo'?'bgy':'bgx'}">${u.rv.toFixed(2)} km/L</span>`:''}
        ${u.inc>0?`<span class="bg ${u.inc>=10?'bgr':u.inc>=5?'bgy':'bgx'}">${u.inc} inc.</span>`:''}
        ${u.monto>0?`<span class="bg bgg">${fM(u.monto)}</span>`:''}
        ${u.mtto_pendiente&&u.mtto_pendiente.length?`<span class="bg bgo">⚙ ${u.mtto_pendiente.length} liberar</span>`:''}
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:5px">
        ${u.tu} · ${u.circ||'—'} ${u.tramo?`· ${u.tramo}`:''}</div>
    </div>`).join(''));
}

// ── MANTENIMIENTO — con pendientes de liberar ─────────────────
function renderMtto() {
  const D=APP.data, K=D.K;
  const pendientes=D.units.flatMap(u=>u.mtto_pendiente.map(m=>({...m,unidad:u.unidad,coord:u.coord})));
  const todas=D.units.flatMap(u=>u.mtto.map(m=>({...m,unidad:u.unidad,coord:u.coord})));

  set('kmtto',`
    <div class="kt kr2"><div class="v">${K.sol_mtto}</div><div class="l">Sol. Abiertas</div></div>
    <div class="kt ko"><div class="v">${K.mtto_pendientes}</div><div class="l">Pendientes liberar</div></div>
    <div class="kt ko"><div class="v">${D.units.filter(u=>u.code==='CP').length}</div><div class="l">En Correctivo</div></div>
    <div class="kt kp"><div class="v">${D.units.filter(u=>u.code==='RM').length}</div><div class="l">Rep. Mayor</div></div>
  `);

  // Sección: pendientes de liberar
  set('mtto-pendientes-section', pendientes.length ? `
    <div class="card" style="border:2px solid #f59e0b">
      <div class="chd" style="color:#d35400;border-bottom-color:#fef0e7">⚙ PENDIENTES DE LIBERAR (${pendientes.length})</div>
      <div class="ovf"><table class="tbl"><thead><tr><th>FOLIO</th><th>UNIDAD</th><th>DESCRIPCIÓN</th><th>FECHA</th><th>COORD</th></tr></thead><tbody>
      ${pendientes.map(m=>`<tr style="cursor:pointer;background:#fffdf0" onclick="openUnit('${m.unidad}')">
        <td>${m.folio}</td>
        <td class="bold" style="color:#e67e22">${m.unidad}</td>
        <td>${m.desc}</td><td>${m.fecha}</td>
        <td style="font-size:10px;color:#64748b">${CONFIG.coordAlias(m.coord)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>` : '');

  set('mttobody',todas.map(m=>`
    <tr style="cursor:pointer" onclick="openUnit('${m.unidad}')">
      <td>${m.folio}</td>
      <td class="bold" style="color:#2980b9">${m.unidad}</td>
      <td>${m.desc}</td><td>${m.fecha}</td>
      <td><span class="bg ${m.pendiente?'bgo':'bgx'}">${m.estatus}</span></td>
      <td style="font-size:10px;color:#64748b">${CONFIG.coordAlias(m.coord)}</td>
    </tr>`).join(''));
}

// ── INCIDENCIAS ───────────────────────────────────────────────
function renderInc() {
  const D=APP.data, K=D.K;
  set('kinc',`
    <div class="kt kr2"><div class="v">${K.inc_mes}</div><div class="l">Total Mes NAL</div></div>
    <div class="kt ko"><div class="v">${D.accidentes.length}</div><div class="l">Accidentes</div><div class="s" style="color:#d35400">${fM(D.accidentes.reduce((s,a)=>s+a.costo,0))}</div></div>
    <div class="kt ky"><div class="v">${D.multas.length}</div><div class="l">Multas</div><div class="s" style="color:#d68910">${fM(D.multas.reduce((s,m)=>s+m.costo,0))}</div></div>
    <div class="kt kb"><div class="v">${D.indisciplinas.length}</div><div class="l">Indisciplinas</div></div>
  `);
  set('incop',D.op_rec.map((o,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
      <span style="color:#64748b">${i+1}.</span>
      <span style="flex:1">${o.op.split(' ').slice(0,3).join(' ')}</span>
      <span class="bg ${o.n>=10?'bgr':o.n>=5?'bgy':'bgx'}">${o.n}</span>
    </div>`).join(''));
  set('incunit',D.unit_rec.map((u,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:11px;cursor:pointer" onclick="openUnit('${u.u}')">
      <span style="color:#64748b">${i+1}.</span>
      <span class="bold" style="color:#2980b9;flex:1">${u.u}</span>
      <span class="bg ${u.n>=10?'bgr':u.n>=5?'bgy':'bgx'}">${u.n} inc.</span>
    </div>`).join(''));
  set('multasbody',D.multas.map(m=>`
    <tr><td>${m.fecha}</td>
      <td class="bold" style="color:#2980b9;cursor:pointer" onclick="openUnit('${m.unidad}')">${m.unidad}</td>
      <td>${m.operador.split(' ').slice(0,2).join(' ')}</td>
      <td><span class="bg bgy">${m.subtipo}</span></td>
      <td class="${m.costo>0?'tye bold':''}">${m.costo>0?fM(m.costo):'—'}</td>
      <td><span class="bg bgx">${m.estatus}</span></td>
    </tr>`).join(''));
}

// ── RENDIMIENTO ───────────────────────────────────────────────
function renderRend() {
  const D=APP.data, K=D.K;
  set('krend',`
    <div class="kt kb"><div class="v">${K.rend_avg}</div><div class="l">Promedio NAL</div></div>
    <div class="kt kr2"><div class="v">${K.bajo_rend}</div><div class="l">Crítico &lt;2.0</div></div>
    <div class="kt ky"><div class="v">${D.units.filter(u=>u.rf==='bajo').length}</div><div class="l">Bajo 2.0–2.5</div></div>
    <div class="kt kg"><div class="v">${D.units.filter(u=>u.rv&&u.rv<9).reduce((m,u)=>Math.max(m,u.rv||0),0).toFixed(2)}</div><div class="l">Máximo</div></div>
  `);
  const maxR=Math.max(...D.rend_tipo.map(t=>t.rend||0),1);
  set('rtipo',D.rend_tipo.map(t=>`
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
  set('rendbody',D.units.filter(u=>u.rv&&u.rv>0).sort((a,b)=>a.rv-b.rv).map(u=>{
    const cl=u.rf==='critico'?'bgr':u.rf==='bajo'?'bgy':'bgg';
    return `<tr style="cursor:pointer" onclick="openUnit('${u.unidad}')">
      <td class="bold" style="color:#2980b9">${u.unidad}</td>
      <td>${(u.operador||'').split(' ').slice(0,2).join(' ')}</td>
      <td><span class="bg bgx" style="font-size:9px">${u.tu}</span></td>
      <td><span class="bg ${cl}">${u.rv.toFixed(2)}</span></td>
      <td>${u.kms?fN(u.kms):'—'}</td><td>${u.lit?fN(u.lit):'—'}</td>
      <td>${u.vmax||'—'}</td><td>${u.rel!=null?u.rel+'%':'—'}</td>
      <td><span class="bg ${cl}">${u.rf.toUpperCase()}</span></td>
    </tr>`;}).join(''));
}

// ── SEGURIDAD ─────────────────────────────────────────────────
function renderSeg() {
  const D=APP.data;
  const cA=D.accidentes.reduce((s,a)=>s+a.costo,0);
  const cM=D.multas.reduce((s,m)=>s+m.costo,0);
  set('kseg',`
    <div class="kt kr2"><div class="v">${D.accidentes.length}</div><div class="l">Accidentes NAL</div></div>
    <div class="kt ky"><div class="v">${D.multas.length}</div><div class="l">Multas NAL</div></div>
    <div class="kt ko"><div class="v">${fM(cA)}</div><div class="l">Costo Accidentes</div></div>
    <div class="kt ky"><div class="v">${fM(cM)}</div><div class="l">Costo Multas</div></div>
  `);
  set('accfull',D.accidentes.map(a=>`
    <div style="border:1px solid #fde8e8;border-radius:7px;padding:10px;background:#fff9f9;margin-bottom:7px;cursor:pointer" onclick="openUnit('${a.unidad}')">
      <div style="display:flex;justify-content:space-between">
        <span class="bold tr" style="font-size:14px">${a.unidad}</span>
        <span class="bg bgx">${a.estatus}</span>
      </div>
      <div style="font-size:11px;margin-top:5px">
        <div>${a.operador} · ${a.fecha}</div>
        <div style="color:#64748b">${a.lugar}</div>
        <div>${a.desc.substring(0,100)}</div>
        ${a.costo>0?`<div class="tye bold">Costo: ${fM(a.costo)}</div>`:''}
      </div>
    </div>`).join('')||'<p class="muted" style="font-size:11px">Sin accidentes registrados</p>');
  set('indisfull',D.indisciplinas.map(i=>`
    <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f0f2f5;font-size:11px;cursor:pointer" onclick="openUnit('${i.unidad}')">
      <span class="bold" style="color:#2980b9;min-width:78px">${i.unidad}</span>
      <div style="flex:1"><div>${i.operador.split(' ').slice(0,3).join(' ')}</div><div class="muted">${i.fecha}</div></div>
      <span class="bg bgo">${i.subtipo}</span>
    </div>`).join('')||'<p class="muted" style="font-size:11px">Sin indisciplinas</p>');
}

// ── CIRCUITOS ─────────────────────────────────────────────────
function renderCirc() {
  const D=APP.data;
  set('circbody',[...D.circs].sort((a,b)=>b.util-a.util).map(c=>{
    const sem=c.util<0?'<span class="bg bgr">🔴</span>':c.util_ud<10000?'<span class="bg bgy">🟡</span>':'<span class="bg bgg">🟢</span>';
    return `<tr>
      <td class="bold">${c.circ}</td><td>${c.uds}</td>
      <td class="bold" style="color:#2980b9">${fM(c.fact)}</td>
      <td class="bold" style="color:${c.util<0?'#c0392b':'#27ae60'}">${fM(c.util)}</td>
      <td style="color:${c.util_ud<0?'#c0392b':'#475569'}">${fM(c.util_ud)}</td>
      <td>${fN(c.kms)}</td><td>${c.rend?.toFixed(2)||'—'}</td><td>${sem}</td>
    </tr>`;}).join(''));
}

// ── MENSUAL ───────────────────────────────────────────────────
// Lee acumulado desde DATA (totales de los circuitos de las 83 unidades)
function renderMens() {
  const D=APP.data, K=D.K;
  const tm=D.dataTotales;

  set('kmens',`
    <div class="kt kb"><div class="v">${fM(K.fact_mes)}</div><div class="l">Facturación Mes</div><div class="s" style="color:#2980b9">83 uds NAL · de DATA</div></div>
    <div class="kt kg"><div class="v">${fM(K.util_mes)}</div><div class="l">Utilidad Bruta</div><div class="s" style="color:#27ae60">Margen ${K.margen_mes}%</div></div>
    <div class="kt kr2"><div class="v">${fM(K.gasto_mes)}</div><div class="l">Gasto Total Mes</div><div class="s" style="color:#c0392b">sin anticipos</div></div>
    <div class="kt ky"><div class="v">${K.rend_avg}</div><div class="l">Rend. prom km/L</div></div>
  `);

  // Desglose de gastos
  set('gasto-desglose', tm.comb!=null ? `
    <div class="card">
      <div class="chd">💸 DESGLOSE DE GASTOS MES</div>
      <div style="font-size:11px">
        ${[
          ['Combustible',   tm.comb  ],
          ['Casetas',       tm.cas   ],
          ['Costo Ops',     tm.cops  ],
          ['Costo Admin',   tm.cadm  ],
          ['Mantenimiento', tm.cmtto ],
          ['Costo Financiero',tm.cfin],
          ['Seguro',        tm.seg   ],
        ].map(([l,v])=>v?`
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f2f5">
          <span class="muted">${l}</span><span class="bold">${fM(v)}</span>
        </div>`:''  ).join('')}
        <div style="display:flex;justify-content:space-between;padding:7px 0;font-weight:700;font-size:12px">
          <span>TOTAL GASTO</span><span style="color:#c0392b">${fM(K.gasto_mes)}</span>
        </div>
      </div>
    </div>` : '');

  // RH / Gastos nómina (sin anticipos)
  const mov=D.mov_rh;
  const items=mov.items||[];
  const ant=mov.anticipos||{cant:0,monto:0};

  set('rhbody',items.map(m=>`
    <tr><td>${m.tipo}</td><td>${m.cant}</td>
      <td class="${m.tipo.toLowerCase().includes('pista')?'tr bold':''}">${fM(m.monto)}</td>
    </tr>`).join('') + `
    <tr style="font-weight:700;border-top:2px solid #e2e8f0;background:#f8f9fa">
      <td>TOTAL GASTOS</td><td>${mov.totalItems||0}</td>
      <td style="color:#c0392b">${fM(mov.totalGasto||0)}</td>
    </tr>
    <tr style="color:#94a3b8;font-size:10px">
      <td colspan="3">⚠ Anticipos (${ant.cant} · ${fM(ant.monto)}) excluidos — se descuentan en liquidación</td>
    </tr>`);
}

// ── CAJAS ─────────────────────────────────────────────────────
function renderCajas() {
  const D=APP.data;
  const c=D.cajas||{cajas:[],stats:{}};
  const s=c.stats||{};

  set('kcajas',`
    <div class="kt kb"><div class="v">${s.total||0}</div><div class="l">Total Cajas</div></div>
    <div class="kt kr2"><div class="v">${s.danadas||0}</div><div class="l">Dañadas</div></div>
    <div class="kt ko"><div class="v">${s.cargadas||0}</div><div class="l">Cargadas</div></div>
    <div class="kt kg"><div class="v">${s.disponibles||0}</div><div class="l">Disponibles</div></div>
  `);

  // Por patio
  const pp=s.porPatio||{};
  set('cajas-patios',Object.entries(pp).length ? `
    <div class="card">
      <div class="chd">📍 POR PATIO</div>
      <div style="font-size:11px">
        ${Object.entries(pp).map(([p,v])=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f2f5">
            <span class="bold">${p}</span>
            <div style="display:flex;gap:8px">
              <span>${v.total} total</span>
              ${v.danadas?`<span class="bg bgr">${v.danadas} dañadas</span>`:''}
              ${v.cargadas?`<span class="bg bgo">${v.cargadas} cargadas</span>`:''}
              <span class="bg bgg">${v.disponibles||v.total-v.danadas-v.cargadas} disp.</span>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '<div class="muted" style="font-size:11px">Sin patios registrados en Control_Cajas</div>');

  // Tabla detalle
  set('cajasbody',(c.cajas||[]).map(cj=>`
    <tr>
      <td class="bold">${cj.numero}</td>
      <td><span class="bg ${cj.danada?'bgr':cj.cargada?'bgo':'bgg'}">${cj.estado||'—'}</span></td>
      <td>${cj.patio||'—'}</td>
      <td>${cj.cargada?'✓':'—'}</td>
      <td style="font-size:10px;color:#64748b">${cj.obs||''}</td>
    </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;color:#94a3b8;font-size:11px">Sin datos — llena la hoja Control_Cajas</td></tr>');

  // También procesar detección de cajas desde WhatsApp
  const cajasWA=(D.whatsapp?.grupos?.cajas||[]);
  set('cajas-wa', cajasWA.length ? `
    <div class="card">
      <div class="chd">📱 CAJAS DETECTADAS EN WHATSAPP (${cajasWA.length})</div>
      <div style="font-size:11px">
        ${cajasWA.map(c=>`
          <div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5">
            <span class="bold" style="min-width:60px">#${c.numCaja}</span>
            <div style="flex:1">${c.descripcion.substring(0,100)}</div>
            <div>
              ${c.esDanada?'<span class="bg bgr">Dañada</span>':''}
              ${c.esCargada?'<span class="bg bgo">Cargada</span>':''}
              <span style="font-size:10px;color:#64748b">${c.fecha}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '');
}

// ── MODAL UNIDAD ──────────────────────────────────────────────
function openUnit(uid) {
  const D=APP.data;
  const u=D.units.find(x=>x.unidad===uid);
  if(!u) return;
  const clr={critico:'#c0392b',bajo:'#d68910',ok:'#27ae60',nd:'#64748b'}[u.rf]||'#64748b';
  const incRows=u.ilist?.length?`
    <div class="ovf"><table class="tbl"><thead><tr><th>FECHA</th><th>TIPO</th><th>SUBTIPO</th><th>DESC</th></tr></thead><tbody>
    ${u.ilist.slice(0,15).map(i=>`<tr><td>${i.fecha}</td><td>${i.tipo}</td><td>${i.subtipo}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.desc}</td></tr>`).join('')}
    </tbody></table></div>`:'<p style="font-size:11px;color:#64748b">Sin incidencias</p>';
  const mttoRows=u.mtto?.length?`
    <div class="ovf"><table class="tbl"><thead><tr><th>#</th><th>DESC</th><th>FECHA</th><th>ESTATUS</th></tr></thead><tbody>
    ${u.mtto.map(m=>`<tr><td>${m.folio}</td><td>${m.desc}</td><td>${m.fecha}</td>
      <td><span class="bg ${m.pendiente?'bgo':'bgx'}">${m.estatus}</span></td></tr>`).join('')}
    </tbody></table></div>`:'<p style="font-size:11px;color:#64748b">Sin solicitudes</p>';
  const mc=document.getElementById('mc');
  if(!mc) return;
  mc.innerHTML=`
    <div style="border-bottom:2px solid #f0f2f5;padding-bottom:14px;margin-bottom:16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:22px;font-weight:800">${u.unidad}</div>
        <div style="font-size:13px;color:#64748b;margin-top:2px">${u.operador||'Sin operador'}</div>
        <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">
          ${bg(u.code)} <span class="bg bgx">${u.tu}</span>
          ${u.circ?`<span class="bg bgb">${u.circ}</span>`:''}
          ${u.tramo?`<span class="bg bgy">${u.tramo}</span>`:''}
        </div>
      </div>
      <div style="text-align:right;font-size:11px;color:#64748b">
        <div>Coord: <b>${CONFIG.coordAlias(u.coord)||'—'}</b></div>
        ${u.ruta?`<div>Ruta: <span style="color:#2980b9">${u.ruta}</span></div>`:''}
        ${u.obs?`<div style="max-width:180px">${u.obs}</div>`:''}
      </div>
    </div>
    <div class="g3" style="margin-bottom:14px">
      <div style="background:#f8f9fa;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase">Venta hoy</div>
        <div style="font-size:20px;font-weight:800;color:#2980b9;margin-top:4px">${fM(u.monto||0)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px">Facturación mes: ${fM(u.fact)}</div>
        <div style="font-size:11px;margin-top:2px;color:${(u.util||0)>=0?'#27ae60':'#c0392b'}">Utilidad: ${fM(u.util)}</div>
      </div>
      <div style="background:#f8f9fa;border-radius:8px;padding:12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase">Rendimiento</div>
        ${u.rv?`
          <div style="display:flex;align-items:center;gap:7px;margin-top:8px;font-size:11px">
            <span style="font-weight:700;color:${clr};min-width:38px">${u.rv.toFixed(2)}</span>
            <div style="flex:1;background:#f0f2f5;border-radius:3px;height:5px;overflow:hidden">
              <div style="height:100%;border-radius:3px;width:${Math.min(100,u.rv/5*100)}%;background:${clr}"></div>
            </div>
          </div>
          <div style="font-size:10px;color:#64748b;margin-top:4px">${fN(u.kms)} km · ${fN(u.lit)} L</div>`
        :'<div style="color:#64748b;font-size:11px;margin-top:8px">Sin datos</div>'}
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
  APP.currentTab=id;
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  const pane=document.getElementById('pane-'+id);
  if(pane) pane.classList.add('on');
  if(btn) btn.classList.add('on');
  else document.querySelectorAll('.tb').forEach(b=>{if(b.getAttribute('onclick')?.includes(`'${id}'`))b.classList.add('on');});
  const renders={
    flota:()=>renderGrid(APP.data.units),
    inc:renderInc, rend:renderRend, mtto:renderMtto,
    seg:renderSeg, circ:renderCirc, mens:renderMens,
    cajas:renderCajas,
  };
  if(APP.data && renders[id]) renders[id]();
}

function setFilter(f) {
  APP.filter=f;
  document.querySelectorAll('.fbtn').forEach(b=>{
    b.classList.toggle('on', b.getAttribute('onclick')?.includes(`'${f}'`));
  });
  if(APP.data) renderGrid(APP.data.units);
}

function filterU() {
  APP.searchQuery=document.getElementById('srch')?.value||'';
  if(APP.data) renderGrid(APP.data.units);
}

function filterRend(q) {
  document.querySelectorAll('#rendbody tr').forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}

function filterMtto(q) {
  document.querySelectorAll('#mttobody tr').forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}

function closeModal() { document.getElementById('modal')?.classList.remove('open'); }

function initRefreshSelector() {
  const sel=document.getElementById('refreshSel');
  if(!sel) return;
  CONFIG.REFRESH_OPTIONS.forEach(opt=>{
    const o=document.createElement('option');
    o.value=opt.value; o.textContent=opt.label;
    if(opt.value===CONFIG.REFRESH_DEFAULT) o.selected=true;
    sel.appendChild(o);
  });
  sel.addEventListener('change',()=>{
    APP.refreshInterval=parseInt(sel.value);
    SHEETS.setRefreshInterval(APP.refreshInterval);
    showToast(APP.refreshInterval>0?`Auto-refresh: ${sel.options[sel.selectedIndex].text}`:'Auto-refresh desactivado');
  });
}

function initClock() {
  const update=()=>{const d=new Date();const el=document.getElementById('clock');if(el)el.textContent=d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});};
  update(); setInterval(update,1000);
}
