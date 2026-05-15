// ============================================================
// SHEETS.JS — Conexión Google Sheets + Auto-Refresh
// ============================================================

const SHEETS = (() => {

  // ── ESTADO INTERNO ───────────────────────────────────────
  let _cache = {};
  let _lastFetch = 0;
  let _refreshTimer = null;
  let _refreshInterval = CONFIG.REFRESH_DEFAULT;
  let _onDataCallback = null;
  let _onErrorCallback = null;
  let _loading = false;

  // ── URL BASE DEL APPS SCRIPT ─────────────────────────────
  const getUrl = (action = 'all') =>
    `${CONFIG.APPS_SCRIPT_URL}?action=${action}&_=${Date.now()}`;

  // ── FETCH PRINCIPAL ──────────────────────────────────────
  async function fetchAll(force = false) {
    if (_loading && !force) return _cache;
    _loading = true;
    showLoading(true);

    try {
      const res = await fetch(getUrl('all'), {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.data?.error || 'Error en respuesta');

      _cache = json.data;
      _lastFetch = Date.now();
      _loading = false;
      showLoading(false);
      updateTimestamp();

      if (_onDataCallback) _onDataCallback(_cache);
      return _cache;

    } catch (err) {
      _loading = false;
      showLoading(false);
      console.error('Error fetching Sheets:', err);
      if (_onErrorCallback) _onErrorCallback(err);
      // Retornar cache anterior si existe
      if (Object.keys(_cache).length > 0) return _cache;
      throw err;
    }
  }

  // ── FETCH URGENCIAS ──────────────────────────────────────
  async function fetchUrgencias() {
    try {
      const res = await fetch(getUrl('urgencias'), { cache: 'no-store' });
      const json = await res.json();
      return json.ok ? json.data : [];
    } catch { return []; }
  }

  // ── PROCESAR WHATSAPP ────────────────────────────────────
  async function procesarWhatsapp() {
    try {
      const res = await fetch(getUrl('whatsapp'), { cache: 'no-store' });
      const json = await res.json();
      return json.ok ? json.data : { procesados: 0, urgencias: [] };
    } catch { return { procesados: 0, urgencias: [] }; }
  }

  // ── AUTO-REFRESH ─────────────────────────────────────────
  function startRefresh(intervalSeconds, callback) {
    stopRefresh();
    _onDataCallback = callback;
    _refreshInterval = intervalSeconds;

    if (intervalSeconds > 0) {
      _refreshTimer = setInterval(() => {
        fetchAll(true);
      }, intervalSeconds * 1000);
    }
  }

  function stopRefresh() {
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
  }

  function setRefreshInterval(seconds) {
    _refreshInterval = seconds;
    if (_onDataCallback) {
      startRefresh(seconds, _onDataCallback);
    }
  }

  // ── CALLBACKS ────────────────────────────────────────────
  function onData(cb)  { _onDataCallback  = cb; }
  function onError(cb) { _onErrorCallback = cb; }

  // ── TIEMPO DESDE ÚLTIMO FETCH ────────────────────────────
  function secondsSinceLastFetch() {
    if (!_lastFetch) return null;
    return Math.round((Date.now() - _lastFetch) / 1000);
  }

  // ── UI HELPERS ───────────────────────────────────────────
  function showLoading(show) {
    const el = document.getElementById('loadingBar');
    if (el) el.style.display = show ? 'block' : 'none';
    const btn = document.getElementById('btnRefresh');
    if (btn) {
      btn.disabled = show;
      btn.textContent = show ? '⏳ Actualizando...' : '🔄 Actualizar ahora';
    }
  }

  function updateTimestamp() {
    const el = document.getElementById('lastUpdate');
    if (el) {
      const now = new Date();
      el.textContent = 'Actualizado: ' + now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    }
    // Contador regresivo
    if (_refreshInterval > 0) {
      startCountdown(_refreshInterval);
    }
  }

  function startCountdown(seconds) {
    const el = document.getElementById('nextUpdate');
    if (!el) return;
    let remaining = seconds;
    const iv = setInterval(() => {
      remaining--;
      if (remaining <= 0) { clearInterval(iv); el.textContent = ''; return; }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      el.textContent = `Próximo en: ${m > 0 ? m+'m ' : ''}${s}s`;
    }, 1000);
  }

  // ── CACHE ────────────────────────────────────────────────
  function getCache() { return _cache; }
  function clearCache() { _cache = {}; _lastFetch = 0; }

  return {
    fetchAll, fetchUrgencias, procesarWhatsapp,
    startRefresh, stopRefresh, setRefreshInterval,
    onData, onError,
    getCache, clearCache,
    secondsSinceLastFetch,
    get isLoading() { return _loading; },
  };

})();
