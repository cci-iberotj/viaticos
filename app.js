/* ═══════════════════════════════════════════════════════════
   Viáticos · la app

   CÓMO GUARDA
   Todo cambio se aplica primero en el celular (se ve al instante) y
   entra a una COLA en IndexedDB. La cola se sube sola: al guardar, al
   volver la señal y cada 30 s mientras quede algo. Sin señal en el
   estadio no se pierde nada; el encabezado dice cuántos faltan.

   Los tickets se mandan por DIFERENCIA (sólo los campos que cambiaron):
   si Claude llena el total desde la foto y el celular trae otro cambio
   pendiente, ninguno borra al otro.
   ═══════════════════════════════════════════════════════════ */
'use strict';

(() => {

  /* ── Iconos (trazo, heredan el color) ────────────────── */
  const I = {
    camara: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    fiscal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14 10h4M14 13.5h3"/></svg>',
    maleta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12h18"/></svg>',
    copiar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
    palomita: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    flecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    abajo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    imagen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    compartir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>',
    abrir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  /* ── Utilidades ──────────────────────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const dinero = n => (n == null || isNaN(n)) ? '—' : pesos.format(n);
  const hoy = () => new Date().toLocaleDateString('en-CA');            // AAAA-MM-DD, hora del celular
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS_L = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const aFecha = s => { const [a, m, d] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
  const fechaCorta = s => { if (!s) return ''; const f = aFecha(s); return f.getUTCDate() + ' ' + MESES[f.getUTCMonth()]; };
  const fechaLarga = s => { const f = aFecha(s); return DIAS_L[f.getUTCDay()] + ' ' + f.getUTCDate() + ' de ' + MESES_L[f.getUTCMonth()]; };
  const diasHasta = s => Math.round((aFecha(s) - aFecha(hoy())) / 864e5);
  const finDeMes = s => { const f = aFecha(s); return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };
  const nuevoId = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const numero = v => {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  };
  const cat = id => (CONFIG.categorias.find(c => c.id === id) || {}).nombre || '';
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const dmy = s => s ? s.split('-').reverse().join('/') : '';   // 2026-11-08 → 08/11/2026, como lo piden los portales
  const conHttp = u => /^https?:/i.test(u) ? u : 'https://' + u;

  /* Portales aprendidos: cada vez que anotas el portal de un comercio,
     se recuerda para el siguiente ticket de ese comercio. No se trae
     una lista de fábrica a propósito: una dirección inventada es peor
     que ninguna. */
  function portalConocido(comercio) {
    const c = norm(comercio); if (!c) return '';
    const p = (E.datos.ajustes || {}).portales || {};
    const k = Object.keys(p).find(k => c === k || c.startsWith(k + ' ') || k.startsWith(c + ' '));
    return k ? p[k] : '';
  }
  function aprenderPortal(comercio, portal) {
    const c = norm(comercio); if (!c || !portal) return;
    // Sólo la dirección base: los QR traen el folio de ESE ticket en la dirección.
    portal = portal.replace(/[?#].*$/, '');
    const p = Object.assign({}, (E.datos.ajustes || {}).portales);
    if (p[c] === portal) return;
    p[c] = portal;
    hacer({ tipo: 'ajustes', cambios: { portales: p } });
  }

  /* Pistas por tipo de comercio: dónde se pide la factura cuando no
     hay portal impreso. Se buscan en el nombre del comercio. */
  const PISTAS = [
    { re: /\b(hotel|inn|hostal|posada|suites|resort|marriott|hilton|hyatt|holiday|city express|fiesta|camino real|ibis|airbnb)\b/,
      txt: 'Hotel: pídela en recepción al hacer check-out, con estos datos. Si ya saliste, en su sitio con el número de reservación. En Airbnb, desde la reservación en la app.' },
    { re: /\b(uber|didi|cabify|indrive|beat)\b/,
      txt: 'Viajes por app: la factura se pide en la misma app, en su apartado de facturación, con los datos de la Ibero. Da de alta los datos una vez y pide las de cada viaje.' },
    { re: /\b(volaris|viva|vivaaerobus|aeromexico|aerolinea|aeropuerto|ado|etn|primera plus|autobus)\b/,
      txt: 'Vuelos y autobuses: en su sitio, sección de facturación, con la clave de reservación o el número de boleto.' },
    { re: /\b(gas|gasolina|gasolinera|pemex|bp|shell|mobil|g500|oxxo gas)\b/,
      txt: 'Gasolinera: el portal viene en el ticket; suelen pedir número de estación, folio y la fecha exacta. Algunas sólo dan unos días.' },
    { re: /\b(taxi|propina|estacionamiento|parquimetro)\b/,
      txt: 'Taxis de la calle, propinas y parquímetros casi nunca dan factura. Si no hay, márcalo como «No tiene»: se comprueba aparte.' },
  ];
  const pista = comercio => { const c = norm(comercio); const p = PISTAS.find(p => p.re.test(c)); return p ? p.txt : ''; };

  /* ── Almacén local: IndexedDB para la cola y las fotos ── */
  const idb = (() => {
    let p;
    const abrir = () => p || (p = new Promise((ok, mal) => {
      const r = indexedDB.open('viaticos', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('cola', { autoIncrement: true });
        r.result.createObjectStore('fotos');
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    }));
    const tx = async (almacen, modo, fn) => {
      const db = await abrir();
      return new Promise((ok, mal) => {
        const t = db.transaction(almacen, modo);
        const res = fn(t.objectStore(almacen));
        t.oncomplete = () => ok(res && 'result' in res ? res.result : res);
        t.onerror = () => mal(t.error);
      });
    };
    return {
      encolar: op => tx('cola', 'readwrite', s => s.add(op)),
      quitar: k => tx('cola', 'readwrite', s => s.delete(k)),
      cola: async () => {
        const db = await abrir();
        return new Promise((ok, mal) => {
          const out = [], r = db.transaction('cola').objectStore('cola').openCursor();
          r.onsuccess = () => { const c = r.result; if (c) { out.push({ k: c.key, op: c.value }); c.continue(); } else ok(out); };
          r.onerror = () => mal(r.error);
        });
      },
      foto: id => tx('fotos', 'readonly', s => s.get(id)),
      ponerFoto: (id, datos) => tx('fotos', 'readwrite', s => s.put(datos, id)),
      vaciar: () => Promise.all([tx('cola', 'readwrite', s => s.clear()), tx('fotos', 'readwrite', s => s.clear())]),
    };
  })();

  /* ── La nube: funciones via_* ────────────────────────── */
  const LLAVE_SESION = 'viaticos.sesion', LLAVE_DATOS = 'viaticos.datos';
  const ls = {
    get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio: la cola sigue en IndexedDB */ } },
    del: k => { try { localStorage.removeItem(k); } catch (e) { } },
  };

  async function rpc(funcion, args = {}) {
    let r;
    // Con datos lentos el fetch puede quedarse colgado: a los 25 s (60 s
    // si va una foto) se corta y cuenta como «sin señal»; la cola reintenta.
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), funcion === 'via_guardar_foto' ? 60000 : 25000);
    try {
      r = await fetch(CONFIG.nube.url + '/rest/v1/rpc/' + funcion, {
        method: 'POST',
        headers: { apikey: CONFIG.nube.llave, Authorization: 'Bearer ' + CONFIG.nube.llave, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: corte.signal,
      });
    } catch (e) { const x = new Error('SIN_RED'); x.red = true; throw x; }
    finally { clearTimeout(reloj); }
    const texto = await r.text();
    let d = null; try { d = texto ? JSON.parse(texto) : null; } catch (e) { }
    if (!r.ok) {
      const x = new Error((d && d.message) || 'Error ' + r.status);
      x.red = r.status >= 500 || r.status === 0;
      throw x;
    }
    return d;
  }
  const token = () => (E.sesion || {}).token;

  /* ── Estado ──────────────────────────────────────────── */
  const E = {
    sesion: ls.get(LLAVE_SESION),
    datos: Object.assign({ nombre: '', ajustes: {}, viajes: [], tickets: [], facturas: [], buzon: {} }, ls.get(LLAVE_DATOS) || {}),
    pendientes: 0,
    sinRed: false,
    sincronizando: false,
    ultimaSync: null,
  };
  const guardarCache = () => ls.set(LLAVE_DATOS, E.datos);

  /* Aplica una operación a los datos locales (al hacerla y, después de
     bajar de la nube, a las que todavía no suben). */
  function aplicar(datos, op) {
    if (op.tipo === 'ticket') {
      let t = datos.tickets.find(x => x.id === op.id);
      if (!t) { t = { id: op.id }; datos.tickets.unshift(t); }
      Object.assign(t, op.cambios);
    } else if (op.tipo === 'foto') {
      let t = datos.tickets.find(x => x.id === op.id);
      if (t) t.foto = true;
    } else if (op.tipo === 'borrar') {
      if (op.si) datos.tickets = datos.tickets.filter(x => x.id !== op.id);
      else if (op.ticket && !datos.tickets.some(x => x.id === op.id)) datos.tickets.unshift(op.ticket);
    } else if (op.tipo === 'viaje') {
      const i = datos.viajes.findIndex(x => x.id === op.v.id);
      if (i >= 0) datos.viajes[i] = Object.assign({}, datos.viajes[i], op.v); else datos.viajes.unshift(op.v);
    } else if (op.tipo === 'borrarViaje') {
      datos.viajes = datos.viajes.filter(x => x.id !== op.id);
    } else if (op.tipo === 'ajustes') {
      datos.ajustes = Object.assign({}, datos.ajustes, op.cambios);
    } else if (op.tipo === 'asignar') {
      // Igual que viaticos._ligar en la base
      datos.facturas = datos.facturas || [];
      const f = datos.facturas.find(x => x.uuid === op.uuid); if (!f) return;
      datos.tickets.forEach(t => { if (t.uuid === op.uuid && t.id !== op.ticket) { delete t.uuid; t.factura = 'pendiente'; } });
      datos.facturas.forEach(x => { if (op.ticket && x.ticket === op.ticket && x.uuid !== op.uuid) x.ticket = null; });
      f.ticket = op.ticket || null;
      const t = op.ticket && datos.tickets.find(x => x.id === op.ticket);
      if (t) {
        Object.assign(t, { factura: 'recibida', uuid: op.uuid, rfc: f.emisor_rfc });
        if (!t.comercio) t.comercio = f.emisor_nombre;
        if (!(t.total > 0)) t.total = f.total;
        if (!t.fecha) t.fecha = f.fecha;
      }
    }
  }

  async function hacer(op) {
    aplicar(E.datos, op);
    guardarCache();
    await idb.encolar(op);
    E.pendientes++;
    pintarCola();
    sincronizar();
  }

  function ejecutar(op) {
    const p_token = token();
    switch (op.tipo) {
      case 'ticket': return rpc('via_guardar_ticket', { p_token, p_id: op.id, p_cambios: op.cambios });
      case 'foto': return rpc('via_guardar_foto', { p_token, p_id: op.id, p_datos: op.datos });
      case 'borrar': return rpc('via_borrar_ticket', { p_token, p_id: op.id, p_si: op.si });
      case 'viaje': return rpc('via_guardar_viaje', { p_token, p_v: op.v });
      case 'borrarViaje': return rpc('via_borrar_viaje', { p_token, p_id: op.id });
      case 'ajustes': return rpc('via_guardar_ajustes', { p_token, p_cambios: op.cambios });
      case 'asignar': return rpc('via_asignar_factura', { p_token, p_uuid: op.uuid, p_ticket: op.ticket || null });
    }
  }

  async function sincronizar() {
    if (E.sincronizando || !token()) return;
    E.sincronizando = true;
    try {
      for (const { k, op } of await idb.cola()) {
        try {
          await ejecutar(op);
        } catch (e) {
          if (e.red) throw e;
          if (e.message === 'SIN_SESION') throw e;
          // Error permanente (dato inválido): no se queda trabando la cola.
          if (e.message === 'VIAJE_CON_TICKETS') avisar('Ese viaje tiene tickets: muévelos o bórralos primero.');
          else avisar('No se pudo guardar un cambio (' + e.message + ').');
        }
        await idb.quitar(k);
      }
      const d = await rpc('via_datos', { p_token: token() });
      const resto = await idb.cola();
      resto.forEach(({ op }) => aplicar(d, op));
      E.datos = d;
      const repuestas = await reponerFotos(d, resto);
      E.pendientes = resto.length + repuestas;
      if (repuestas) setTimeout(sincronizar, 0);
      E.sinRed = false;
      E.ultimaSync = new Date();
      guardarCache();
      if (alSincronizar) alSincronizar();
      pintar(true);
    } catch (e) {
      if (e.message === 'SIN_SESION') { salir(true); return; }
      E.sinRed = !!e.red;
      E.pendientes = (await idb.cola()).length;
    } finally {
      E.sincronizando = false;
      pintarCola();
    }
  }
  // Si una foto se quedó sólo en el celular (la subida se perdió), la vuelve
  // a encolar. Una vez por foto mientras la app está abierta, para no
  // insistir en bucle si la base la rechaza.
  const fotosRepuestas = new Set();
  async function reponerFotos(d, resto) {
    if (!Array.isArray(d.con_foto)) return 0;
    const subidas = new Set(d.con_foto);
    const enCola = new Set(resto.filter(x => x.op.tipo === 'foto').map(x => x.op.id));
    let n = 0;
    for (const t of d.tickets || []) {
      if (!t.foto || subidas.has(t.id) || enCola.has(t.id) || fotosRepuestas.has(t.id)) continue;
      const datos = await idb.foto(t.id).catch(() => null);
      if (!datos) continue;
      fotosRepuestas.add(t.id);
      await idb.encolar({ tipo: 'foto', id: t.id, datos });
      n++;
    }
    return n;
  }
  window.addEventListener('online', sincronizar);
  setInterval(() => { if (E.pendientes) sincronizar(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });

  /* ── Aviso flotante ──────────────────────────────────── */
  let avisoT;
  function avisar(texto, accion) {
    const a = $('#aviso');
    a.innerHTML = '<span>' + esc(texto) + '</span>' + (accion ? '<button type="button">' + esc(accion.texto) + '</button>' : '');
    a.hidden = false;
    if (accion) a.querySelector('button').onclick = () => { a.hidden = true; accion.fn(); };
    clearTimeout(avisoT);
    avisoT = setTimeout(() => { a.hidden = true; }, accion ? 6000 : 2600);
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch (e) {
      const t = document.createElement('textarea');
      t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { }
      t.remove(); return ok;
    }
  }

  /* ── Reglas del ticket ───────────────────────────────── */
  const limite = t => t.limite || (t.fecha ? finDeMes(t.fecha) : null);
  const facturaDe = t => (E.datos.facturas || []).find(f => f.ticket === t.id) || null;
  const sinTicket = () => (E.datos.facturas || []).filter(f => !f.ticket);
  function hace(iso) {
    if (!iso) return '';
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 2) return 'hace un momento';
    if (m < 60) return 'hace ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
    const d = Math.round(h / 24);
    return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  const faltaDato = t => !(t.total > 0) || !t.comercio;
  const porFacturar = t => (t.factura || 'pendiente') === 'pendiente';

  function estado(t) {
    const f = t.factura || 'pendiente';
    if (f === 'sin') return { c: 'e-sin', txt: 'Sin factura' };
    if (f === 'recibida') {
      const x = facturaDe(t);
      if (x && (x.errores || []).length) return { c: 'e-vencido', txt: 'Factura con datos mal' };
      return { c: 'e-ok', txt: x ? 'Factura recibida · PDF y XML' : 'Factura recibida' };
    }
    if (f === 'solicitada') {
      const n = t.solicitada_el ? -diasHasta(t.solicitada_el) : 0;
      return n >= 2 ? { c: 'e-alerta', txt: 'Pedida hace ' + n + ' días · revisa tu correo' } : { c: 'e-pedida', txt: 'Factura pedida' };
    }
    if (faltaDato(t)) return { c: 'e-leer', txt: t.foto ? 'Por leer' : 'Faltan datos' };
    const lim = limite(t);
    if (!lim) return { c: 'e-pedir', txt: 'Por facturar' };
    const d = diasHasta(lim);
    if (d < 0) return { c: 'e-vencido', txt: 'Venció el ' + fechaCorta(lim) };
    if (d === 0) return { c: 'e-alerta', txt: 'Factura hoy' };
    if (d <= CONFIG.avisoDias) return { c: 'e-alerta', txt: 'Factura antes del ' + fechaCorta(lim) };
    return { c: 'e-pedir', txt: 'Por facturar · antes del ' + fechaCorta(lim) };
  }

  function viajeActivo() {
    const vs = E.datos.viajes;
    const elegido = E.datos.ajustes && E.datos.ajustes.viajeActivo;
    if (elegido === '_sin') return null;
    return vs.find(v => v.id === elegido)
      || vs.find(v => v.inicio && v.fin && v.inicio <= hoy() && hoy() <= v.fin)
      || vs[0] || null;
  }
  const ticketsDe = vid => E.datos.tickets.filter(t => (t.viaje || null) === (vid || null));

  function cuentas(ts) {
    return {
      gastado: ts.reduce((s, t) => s + (t.total > 0 ? t.total : 0), 0),
      n: ts.length,
      leer: ts.filter(t => faltaDato(t) && t.factura !== 'sin').length,
      facturar: ts.filter(t => (t.factura || 'pendiente') === 'pendiente' || t.factura === 'solicitada').length,
      sin: ts.filter(t => t.factura === 'sin').length,
    };
  }

  /* ── Qué entregar a Contabilidad ─────────────────────────
     La comida tiene tope diario. Cada día se escogen, de los tickets con
     factura (o por pedirla), los que más se acercan al tope sin pasarse;
     lo demás no se entrega y corre por cuenta de él. Él puede forzar
     cualquiera a «entregar» o «no entregar» (t.presentar true/false;
     null = automático). Lo que no es comida se entrega completo. */
  const topeDe = v => (v && v.tope_alimentos > 0) ? Number(v.tope_alimentos) : CONFIG.topeAlimentos;
  const entregable = t => t.factura !== 'sin' && t.total > 0;
  function mejorDelDia(lista, cupo) {
    if (cupo <= 0.005 || !lista.length) return [];
    // A igual monto, gana la que ya tiene factura (una menos que pedir).
    const peso = t => t.total + (t.factura === 'recibida' ? 0.001 : 0);
    if (lista.length > 15) {
      const out = []; let s = 0;
      lista.slice().sort((a, b) => b.total - a.total).forEach(t => { if (s + t.total <= cupo + 0.005) { out.push(t); s += t.total; } });
      return out;
    }
    let mejor = 0, puntos = -1;
    for (let m = 0; m < (1 << lista.length); m++) {
      let s = 0, p = 0;
      for (let i = 0; i < lista.length; i++) if (m >> i & 1) { s += lista[i].total; p += peso(lista[i]); }
      if (s <= cupo + 0.005 && p > puntos) { puntos = p; mejor = m; }
    }
    return lista.filter((_, i) => mejor >> i & 1);
  }
  // «Si metes un día una de 1000 no pasa nada, pero no lo hagas los 7 días»
  // (Sol, nov-2026): unos cuantos días pueden llegar a un tope alto.
  const topeAltoDe = v => (v && v.tope_alto > 0) ? Number(v.tope_alto) : CONFIG.topeAlto;
  const diasAltosDe = v => (v && v.dias_altos != null && v.dias_altos >= 0) ? Number(v.dias_altos) : CONFIG.diasAltos;
  function entrega(v) {
    const tope = topeDe(v), alto = Math.max(topeAltoDe(v), tope), nAltos = diasAltosDe(v);
    const ts = ticketsDe(v.id);
    const sel = new Set(), comida = {};
    ts.filter(entregable).forEach(t => {
      if (t.categoria !== 'alimentos') { if (t.presentar !== false) sel.add(t.id); return; }
      (comida[t.fecha || ''] = comida[t.fecha || ''] || []).push(t);
    });
    const suma0 = l => l.reduce((s, t) => s + t.total, 0);
    // Para cada día: la mejor selección con el tope normal y con el alto.
    const planes = Object.keys(comida).map(d => {
      const lista = comida[d];
      const fijos = lista.filter(t => t.presentar === true);
      const libres = lista.filter(t => t.presentar == null);
      const normal = mejorDelDia(libres, tope - suma0(fijos));
      const conAlto = mejorDelDia(libres, alto - suma0(fijos));
      return { d, fijos, normal, conAlto, gana: suma0(conAlto) - suma0(normal) };
    });
    // Los días altos van a donde más rinden.
    const altos = new Set(planes.filter(p => p.gana > 0.005).sort((a, b) => b.gana - a.gana).slice(0, nAltos).map(p => p.d));
    planes.forEach(p => {
      p.fijos.forEach(t => sel.add(t.id));
      (altos.has(p.d) ? p.conAlto : p.normal).forEach(t => sel.add(t.id));
    });
    const suma = f => ts.filter(f).reduce((s, t) => s + (t.total > 0 ? t.total : 0), 0);
    return {
      tope, alto, nAltos, altos, sel, ts,
      topeDia: d => altos.has(d) ? alto : tope,
      gastado: suma(() => true),
      entregas: suma(t => sel.has(t.id)),
      comidaDe: d => ts.filter(t => t.categoria === 'alimentos' && (t.fecha || '') === d),
    };
  }

  /* ── Enrutador ───────────────────────────────────────── */
  function ruta() {
    const h = location.hash.replace(/^#/, '') || 'tickets';
    const [camino, q] = h.split('?');
    const [vista, id] = camino.split('/');
    return { vista, id, q: q || '' };
  }
  let antesDeSalir = null;   // guarda lo que se estaba escribiendo en una ficha
  let alSincronizar = null;  // una vista que se actualiza sola sin repintarse (Gmail)
  let relojVista = null;
  window.addEventListener('hashchange', () => { pintar(); window.scrollTo(0, 0); });

  function pintar(desdeSync) {
    if (!token()) return vistaAcceso();
    const r = ruta();
    if (!desdeSync && antesDeSalir) { const g = antesDeSalir; antesDeSalir = null; g(); }
    // Al llegar datos nuevos no se repinta un formulario mientras se escribe en él.
    if (!desdeSync) { alSincronizar = null; clearInterval(relojVista); }
    if (desdeSync && (r.vista === 'ticket' || r.vista === 'viaje' || r.vista === 'facturar' || r.vista === 'gmail')) return;
    if (desdeSync && document.activeElement && document.activeElement.matches('input, textarea, select')) return;
    if (r.vista === 'facturas') return vistaFacturas();
    if (r.vista === 'gmail') return vistaGmail();
    if (r.vista === 'ticket') return vistaTicket(r.id, r.q === 'nuevo');
    if (r.vista === 'facturar') return vistaFacturar(r.id);
    if (r.vista === 'fiscales') return vistaFiscales();
    if (r.vista === 'viajes') return vistaViajes();
    if (r.vista === 'viaje') return vistaViaje(r.id);
    if (r.vista === 'entregar') return vistaEntregar(r.id);
    return vistaTickets();
  }

  function cabeza(sub) {
    return '<header class="cabeza"><h1>Viáticos<small>' + esc(sub || 'IBERO Tijuana') + '</small></h1><span id="cola"></span></header>';
  }
  function pintarCola() {
    const c = $('#cola'); if (!c) return;
    if (E.pendientes > 0) {
      c.className = 'cola';
      // En iPhone, cerrar la app corta la subida: hay que decirlo claro.
      c.textContent = (E.sinRed ? 'Sin señal · ' : 'Subiendo · ') + E.pendientes + (E.pendientes === 1 ? ' cambio' : ' cambios') + ' · no cierres la app';
    } else if (E.ultimaSync) {
      c.className = 'cola ok'; c.textContent = 'Todo guardado';
    } else { c.className = ''; c.textContent = ''; }
  }
  function nav(actual) {
    const it = (h, ic, txt, id) => '<a href="#' + h + '"' + (actual === id ? ' aria-current="page"' : '') + '>' + I[ic] + txt + '</a>';
    return '<nav class="nav"><div>' + it('tickets', 'ticket', 'Tickets', 'tickets') + it('fiscales', 'fiscal', 'Datos fiscales', 'fiscales') + it('viajes', 'maleta', 'Viajes', 'viajes') + '</div></nav>';
  }

  /* ── Vista: acceso ───────────────────────────────────── */
  function vistaAcceso() {
    app.innerHTML = '<div class="acceso"><form id="f-acceso" autocomplete="on">' +
      '<h1>Viáticos</h1><p>Tickets y facturas de tus viajes de trabajo</p>' +
      '<label class="campo"><span>Usuario</span><input name="usuario" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>' +
      '<label class="campo"><span>Clave</span><input name="clave" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>' +
      '<label class="ver-clave"><input type="checkbox" id="ver-clave"> Mostrar la clave</label>' +
      '<p class="error" id="error"></p>' +
      '<button class="btn primario ancho">Entrar</button></form></div>';
    $('#ver-clave').onchange = ev => { $('#f-acceso').clave.type = ev.target.checked ? 'text' : 'password'; };
    $('#f-acceso').onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target, b = f.querySelector('button');
      b.disabled = true; b.textContent = 'Entrando…'; $('#error').textContent = '';
      try {
        // El teclado del iPhone a veces agrega un espacio al final o pone mayúscula inicial.
        E.sesion = await rpc('via_entrar', { p_usuario: f.usuario.value.trim().toLowerCase(), p_clave: f.clave.value.trim() });
        ls.set(LLAVE_SESION, E.sesion);
        location.hash = '#tickets';
        pintar(); sincronizar();
      } catch (e) {
        $('#error').textContent = e.message === 'CLAVE' ? 'Usuario o clave incorrectos. El usuario es «leo», en minúsculas.' : e.red ? 'La conexión no respondió. Intenta de nuevo; si sigue, prueba con Wi-Fi.' : e.message;
        b.disabled = false; b.textContent = 'Entrar';
      }
    };
  }

  function salir(vencida) {
    const t = token();
    // Al salir a propósito se vacía lo guardado en este aparato: si otra
    // persona entra aquí, la cola no debe subirse a su cuenta.
    if (!vencida) {
      if (E.pendientes > 0 && !confirm('Hay ' + E.pendientes + ' cambios que todavía no suben. Si sales ahora, se pierden. ¿Salir de todos modos?')) return;
      idb.vaciar().catch(() => { });
      E.pendientes = 0;
    }
    E.sesion = null; ls.del(LLAVE_SESION); ls.del(LLAVE_DATOS);
    E.datos = { nombre: '', ajustes: {}, viajes: [], tickets: [], facturas: [], buzon: {} };
    if (t && !vencida) rpc('via_salir', { p_token: t }).catch(() => { });
    location.hash = '';
    vistaAcceso();
    if (vencida) avisar('Tu sesión venció. Vuelve a entrar.');
  }

  /* ── Agregar a la pantalla de inicio ─────────────────────
     iPhone no deja instalar con un botón: sólo Safari puede, desde
     Compartir › Agregar a inicio. Se le enseñan los pasos. Android
     (Chrome) sí avisa con beforeinstallprompt y ahí va un botón. La
     tarjeta no sale cuando ya se abrió desde el ícono. */
  const LLAVE_INSTALAR = 'viaticos.instalar';
  const yaInstalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const esIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let avisoInstalar = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); avisoInstalar = e; if (ruta().vista === 'tickets') vistaTickets(); });
  window.addEventListener('appinstalled', () => { ls.set(LLAVE_INSTALAR, 'hecho'); avisoInstalar = null; });

  function tarjetaInstalar(forzar) {
    if (yaInstalada()) return '';
    const pospuesta = ls.get(LLAVE_INSTALAR);
    if (!forzar && (pospuesta === 'hecho' || (typeof pospuesta === 'number' && Date.now() < pospuesta))) return '';
    let cuerpo;
    if (avisoInstalar) {
      cuerpo = '<p class="chico" style="margin:0 0 12px">Queda como app, con su ícono, y abre directo en tus tickets.</p>' +
        '<button class="btn primario ancho" id="b-instalar">' + I.mas + 'Instalar Viáticos</button>';
    } else if (esIphone()) {
      const safari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
      cuerpo = '<p class="chico" style="margin:0 0 10px">Así abre directo en tus tickets, como cualquier app.' +
        (safari ? '' : ' <b>Si no ves «Agregar a inicio», ábrela en Safari.</b>') + '</p>' +
        '<ol class="pasos-inicio">' +
        '<li><span class="ico-ios">' + I.compartir + '</span><span>Toca <b>Compartir</b>. Si no lo ves abajo, está dentro del botón <b>•••</b>.</span></li>' +
        '<li><span class="ico-ios">' + I.mas + '</span><span>Baja y elige <b>Agregar a inicio</b> (o «Agregar a pantalla de inicio»).</span></li>' +
        '<li><span class="ico-ios"><img src="icono-180.png" alt=""></span><span>Toca <b>Agregar</b>. Ya queda el ícono rojo.</span></li></ol>';
    } else {
      cuerpo = '<p class="chico" style="margin:0">En el menú del navegador (⋮), elige <b>Agregar a la pantalla de inicio</b> o <b>Instalar app</b>.</p>';
    }
    return '<section class="tarjeta instalar" id="t-instalar"><h2>Ponla en tu pantalla de inicio</h2>' + cuerpo +
      '<p style="margin:10px 0 0;text-align:right"><button class="enlace chico" id="b-instalar-no">' + (forzar ? 'Cerrar' : 'Ahora no') + '</button></p></section>';
  }
  function activarInstalar() {
    const bi = $('#b-instalar');
    if (bi) bi.onclick = async () => {
      if (!avisoInstalar) return;
      avisoInstalar.prompt();
      const r = await avisoInstalar.userChoice.catch(() => ({}));
      if (r.outcome === 'accepted') { ls.set(LLAVE_INSTALAR, 'hecho'); $('#t-instalar')?.remove(); }
      avisoInstalar = null;
    };
    const bn = $('#b-instalar-no');
    if (bn) bn.onclick = () => { ls.set(LLAVE_INSTALAR, Date.now() + 7 * 864e5); $('#t-instalar')?.remove(); };
  }

  /* ── Vista: tickets (inicio) ─────────────────────────── */
  function vistaTickets() {
    const v = viajeActivo();
    const ts = ticketsDe(v ? v.id : null);
    const k = cuentas(ts);
    const huerfanos = E.datos.tickets.some(t => !t.viaje);

    const opciones = E.datos.viajes.map(x => '<option value="' + esc(x.id) + '"' + (v && v.id === x.id ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') +
      (huerfanos || !v ? '<option value="_sin"' + (!v ? ' selected' : '') + '>Tickets sin viaje</option>' : '');

    // Resumen del dinero
    let resumen = '';
    if (v) {
      const asig = v.asignado > 0 ? v.asignado : null;
      const queda = asig != null ? asig - k.gastado : null;
      const pct = asig ? Math.min(100, k.gastado / asig * 100) : 0;
      resumen = '<section class="tarjeta">' +
        '<div class="resumen"><div><b>' + (asig != null ? dinero(asig) : '—') + '</b><span>Asignado</span></div>' +
        '<div><b>' + dinero(k.gastado) + '</b><span>Gastado</span></div>' +
        '<div><b' + (queda != null && queda < 0 ? ' style="color:var(--peligro)"' : '') + '>' + (queda != null ? dinero(queda) : '—') + '</b><span>' + (queda != null && queda < 0 ? 'Te pasaste' : 'Queda') + '</span></div></div>' +
        (asig != null ? '<div class="barra' + (queda < 0 ? ' pasado' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>'
          : '<p class="chico tenue" style="margin:10px 0 6px;text-align:center">¿Cuánto te dieron de viáticos? <a href="#viaje/' + esc(v.id) + '">Anótalo</a></p>') +
        '<div class="cuentas"><span>' + k.n + (k.n === 1 ? ' ticket' : ' tickets') + '</span>' +
        (k.leer ? '<span>' + k.leer + ' por leer</span>' : '') +
        (k.facturar ? '<span>' + k.facturar + ' sin factura todavía</span>' : '') +
        (k.sin ? '<span>' + k.sin + ' sin CFDI</span>' : '') + '</div>' +
        (() => {
          const tope = topeDe(v);
          const comidaHoy = ts.filter(t => t.categoria === 'alimentos' && t.fecha === hoy()).reduce((s, t) => s + (t.total > 0 ? t.total : 0), 0);
          const enViaje = !v.inicio || !v.fin || (v.inicio <= hoy() && hoy() <= v.fin);
          return (enViaje ? '<p class="comida-hoy' + (comidaHoy > tope ? ' pasado' : '') + '">Comida hoy: <b>' + dinero(comidaHoy) + '</b> de ' + dinero(tope) +
            (comidaHoy > tope ? ' · te pasaste ' + dinero(comidaHoy - tope) : comidaHoy ? ' · te quedan ' + dinero(tope - comidaHoy) : '') + '</p>' : '') +
            (ts.length ? '<a class="btn ancho" href="#entregar/' + esc(v.id) + '" style="margin-top:12px">' + I.palomita + 'Qué entregar a Contabilidad</a>' : '');
        })() + '</section>';
    }

    // Franja de vencimientos (de todos los viajes: una factura vencida es dinero perdido)
    const urgentes = E.datos.tickets.filter(t => porFacturar(t) && limite(t) && diasHasta(limite(t)) <= CONFIG.avisoDias);
    const vencidos = urgentes.filter(t => diasHasta(limite(t)) < 0);
    let franja = '';
    if (urgentes.length) {
      const pronto = urgentes.length - vencidos.length;
      const prox = urgentes.map(limite).filter(l => diasHasta(l) >= 0).sort()[0];
      franja = '<div class="franja ' + (vencidos.length ? 'peligro' : 'alerta') + '">' + I.reloj + '<div>' +
        (pronto ? '<b>' + pronto + (pronto === 1 ? ' ticket vence' : ' tickets vencen') + ' pronto.</b> El primero, el ' + fechaCorta(prox) + '. ' : '') +
        (vencidos.length ? '<b>' + vencidos.length + ' ya ' + (vencidos.length === 1 ? 'venció' : 'vencieron') + '.</b> Intenta igual: algunos comercios todavía facturan. ' : '') +
        '<button class="enlace" id="b-ver-urgentes" style="padding:0;color:inherit">Ver cuáles</button></div></div>';
    }

    // Filtros: sólo aparecen los que tienen algo
    const FILTROS = [
      { id: 'todos', nombre: 'Todos', f: () => true },
      { id: 'facturar', nombre: 'Por facturar', f: t => porFacturar(t) },
      { id: 'pedidas', nombre: 'Pedidas', f: t => t.factura === 'solicitada' },
      { id: 'leer', nombre: 'Por leer', f: t => faltaDato(t) && t.factura !== 'sin' },
      { id: 'sin', nombre: 'Sin factura', f: t => t.factura === 'sin' },
    ];
    const conteos = FILTROS.map(x => ts.filter(x.f).length);
    if (!FILTROS.some((x, i) => x.id === E.filtro && conteos[i])) E.filtro = 'todos';
    const filtro = FILTROS.find(x => x.id === E.filtro);
    const vis = ts.filter(filtro.f);
    const filtros = ts.length ? '<div class="filtros" role="group" aria-label="Filtrar">' + FILTROS.map((x, i) => (i && !conteos[i]) ? '' :
      '<button type="button" data-filtro="' + x.id + '" aria-pressed="' + (x.id === E.filtro) + '">' + x.nombre + (i ? '<b>' + conteos[i] + '</b>' : '') + '</button>').join('') + '</div>' : '';

    let lista = '';
    if (!ts.length) {
      lista = '<p class="vacio">Todavía no hay tickets' + (v ? ' en este viaje' : '') + '.<br>Toma la foto en cuanto pagues: es lo único que no se puede recuperar después.</p>';
    } else if (E.filtro === 'facturar') {
      // Por facturar: en orden de fecha límite, el que vence primero arriba
      lista = '<h3 class="dia">El que vence primero, arriba</h3><div class="lista">' +
        vis.slice().sort((a, b) => (limite(a) || '9').localeCompare(limite(b) || '9')).map(fila).join('') + '</div>';
    } else {
      const grupos = {};
      vis.forEach(t => { const d = t.fecha || ''; (grupos[d] = grupos[d] || []).push(t); });
      lista = Object.keys(grupos).sort().reverse().map(d =>
        '<h3 class="dia">' + (d ? fechaLarga(d) : 'Sin fecha') + '</h3><div class="lista">' +
        grupos[d].map(fila).join('') + '</div>').join('');
    }

    app.innerHTML = cabeza(E.datos.nombre ? 'Hola, ' + E.datos.nombre : '') +
      (E.datos.viajes.length || huerfanos ? '<label class="viaje-sel">' + I.maleta + '<select id="sel-viaje" aria-label="Viaje">' + opciones + '</select>' + I.abajo + '</label>'
        : '<div class="franja info">' + I.info + '<div>Primero <a href="#viaje/nuevo">da de alta tu viaje</a>; los tickets se van juntando ahí.</div></div>') +
      '<button class="btn primario capturar" id="b-capturar">' + I.camara + 'Foto del ticket</button>' +
      '<div class="bajo-captura"><button class="enlace" id="b-galeria">Subir imagen</button><span class="tenue">·</span><button class="enlace" id="b-sinfoto">Sin foto</button></div>' +
      tarjetaInstalar(false) + franja +
      (sinTicket().length ? '<a class="franja info" href="#facturas" style="text-decoration:none">' + I.info + '<div><b>' + sinTicket().length +
        (sinTicket().length === 1 ? ' factura llegó' : ' facturas llegaron') + ' sin ticket.</b> <u>Asignarlas</u></div></a>' : '') +
      resumen + filtros + lista + nav('tickets');
    activarInstalar();

    $$('[data-filtro]').forEach(b => b.onclick = () => { E.filtro = b.dataset.filtro; vistaTickets(); });
    const bu = $('#b-ver-urgentes');
    if (bu) bu.onclick = () => { E.filtro = 'facturar'; vistaTickets(); const l = $('.filtros'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const sel = $('#sel-viaje');
    if (sel) sel.onchange = () => hacer({ tipo: 'ajustes', cambios: { viajeActivo: sel.value } }).then(pintar);
    $('#b-capturar').onclick = () => tomarFoto(null, 'camara');
    $('#b-galeria').onclick = () => tomarFoto(null, 'galeria');
    $('#b-sinfoto').onclick = () => nuevoTicket(null);
    pintarCola();
    miniaturas();
  }

  function fila(t) {
    const e = estado(t);
    return '<a class="fila" href="#ticket/' + esc(t.id) + '">' +
      '<span class="miniatura" data-foto="' + (t.foto ? esc(t.id) : '') + '">' + (t.foto ? '' : I.ticket) + '</span>' +
      '<span class="medio"><span class="comercio' + (t.comercio ? '' : ' falta') + '">' + esc(t.comercio || (t.foto ? 'Ticket sin leer' : 'Sin comercio')) + '</span>' +
      '<span class="chico tenue">' + esc(cat(t.categoria) || 'Sin categoría') + '</span><br>' +
      '<span class="etiqueta ' + e.c + '">' + esc(e.txt) + '</span></span>' +
      '<span class="total">' + (t.total > 0 ? dinero(t.total) : '') + '</span></a>';
  }

  async function miniaturas() {
    for (const m of $$('.miniatura[data-foto]')) {
      const id = m.dataset.foto; if (!id) continue;
      const f = await idb.foto(id).catch(() => null);
      if (f) m.style.backgroundImage = 'url("' + f + '")';
      else m.innerHTML = I.imagen;
    }
  }

  /* ── Captura ─────────────────────────────────────────── */
  let fotoPara = null;   // id del ticket al que va la foto (null = ticket nuevo)
  function tomarFoto(id, fuente) {
    fotoPara = id;
    const inp = $(fuente === 'galeria' ? '#galeria' : '#camara');
    inp.value = '';
    inp.click();
  }
  ['#camara', '#galeria'].forEach(s => $(s).addEventListener('change', async ev => {
    const archivo = ev.target.files && ev.target.files[0];
    if (!archivo) return;
    let datos;
    try { datos = await comprimir(archivo); }
    catch (e) { avisar('No pude abrir esa imagen. Intenta con otra.'); return; }
    if (fotoPara) {
      await idb.ponerFoto(fotoPara, datos);
      await hacer({ tipo: 'foto', id: fotoPara, datos });
      pintar();
    } else {
      await nuevoTicket(datos);
    }
  }));

  async function nuevoTicket(datosFoto) {
    const v = viajeActivo();
    const id = nuevoId('tk');
    const t = { viaje: v ? v.id : null, fecha: hoy(), factura: 'pendiente', creado: new Date().toISOString() };
    if (datosFoto) { await idb.ponerFoto(id, datosFoto); t.foto = true; }
    await hacer({ tipo: 'ticket', id, cambios: t });
    if (datosFoto) await hacer({ tipo: 'foto', id, datos: datosFoto });
    location.hash = '#ticket/' + id + '?nuevo';
  }

  // Reduce la foto a 1600 px de lado largo. La orientación del celular
  // ya la aplica el navegador al decodificar (image-orientation: from-image).
  function comprimir(archivo) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        const { lado, calidad } = CONFIG.foto;
        const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('imagen')); };
      img.src = url;
    });
  }

  /* ── Vista: ficha del ticket ─────────────────────────── */
  function vistaTicket(id, esNuevo) {
    const t = E.datos.tickets.find(x => x.id === id);
    if (!t) {
      app.innerHTML = cabeza() + '<p class="vacio">Ese ticket ya no existe.</p><a class="btn ancho" href="#tickets">Volver a los tickets</a>' + nav('tickets');
      return;
    }
    const chips = (lista, campo, val) => '<div class="chips" data-chips="' + campo + '">' +
      lista.map(o => '<button type="button" data-v="' + o.id + '" aria-pressed="' + (val === o.id) + '">' + esc(o.nombre) + '</button>').join('') + '</div>';
    const viajes = '<option value="">Sin viaje</option>' + E.datos.viajes.map(v => '<option value="' + esc(v.id) + '"' + (t.viaje === v.id ? ' selected' : '') + '>' + esc(v.nombre) + '</option>').join('');
    const lim = limite(t);

    app.innerHTML =
      '<div class="cabeza" style="padding-bottom:4px"><button class="volver" id="b-volver">' + I.flecha + 'Tickets</button><span id="cola"></span></div>' +
      (t.foto ? '<img class="foto-grande" id="foto" alt="Foto del ticket">'
        : '<div class="sin-foto"><span>Sin foto</span><div><button class="enlace" data-foto="camara">Tomar foto</button> · <button class="enlace" data-foto="galeria">Subir imagen</button></div></div>') +
      (esNuevo && faltaDato(t) ? '<div class="franja info">' + I.info + '<div><b>Listo, ya quedó guardado.</b> Si tienes prisa, déjalo así: queda «Por leer» y los datos se llenan después desde la foto.</div></div>' : '') +
      (facturaDe(t) ? tarjetaFactura(facturaDe(t), t) : '') +
      ((t.factura || 'pendiente') === 'pendiente' ? '<a class="btn primario ancho" href="#facturar/' + esc(id) + '" style="margin-bottom:14px">' + I.fiscal + 'Pedir factura</a>' : '') +
      '<form id="f-ticket" autocomplete="off">' +
      '<p class="guardado" id="guardado"></p>' +
      '<label class="campo total"><span>Total</span><input name="total" inputmode="decimal" placeholder="0.00" value="' + (t.total != null && t.total !== '' ? esc(Number(t.total).toFixed(2)) : '') + '"></label>' +
      '<label class="campo"><span>Comercio</span><input name="comercio" placeholder="Ej. Hotel Fiesta Inn, OXXO, Uber" value="' + esc(t.comercio || '') + '" autocapitalize="words"></label>' +
      '<div class="campo"><span>Categoría</span>' + chips(CONFIG.categorias, 'categoria', t.categoria) + '</div>' +
      '<div class="dos"><label class="campo"><span>Fecha</span><input name="fecha" type="date" value="' + esc(t.fecha || '') + '"></label>' +
      '<label class="campo"><span>Folio o núm. de ticket</span><input name="folio" value="' + esc(t.folio || '') + '" autocapitalize="characters"></label></div>' +
      '<div class="campo"><span>Factura</span>' + chips(CONFIG.facturas, 'factura', t.factura || 'pendiente') + '</div>' +
      '<label class="campo"><span>Portal de facturación</span><input name="portal" type="url" inputmode="url" placeholder="La dirección que viene en el ticket" value="' + esc(t.portal || '') + '"></label>' +
      (t.portal ? '<a class="btn ancho" style="margin:-4px 0 14px" target="_blank" rel="noopener" href="' + esc(/^https?:/i.test(t.portal) ? t.portal : 'https://' + t.portal) + '">' + I.abrir + 'Abrir portal</a>' : '') +
      '<label class="campo"><span>Fecha límite para facturar</span><input name="limite" type="date" value="' + esc(t.limite || lim || '') + '">' +
      '<span class="rapidas"><button type="button" data-lim="0">Mismo día</button><button type="button" data-lim="1">24 h</button><button type="button" data-lim="3">72 h</button><button type="button" data-lim="mes">Fin de mes</button></span>' +
      '<small class="chico tenue">Casi todos dejan facturar dentro del mismo mes. Si el ticket dice otra cosa, cámbiala.</small></label>' +
      '<label class="campo"><span>Viaje</span><select name="viaje">' + viajes + '</select></label>' +
      '<label class="campo"><span>Notas</span><textarea name="notas" placeholder="Ej. comida con el equipo de voleibol">' + esc(t.notas || '') + '</textarea></label>' +
      '<div class="pie-ficha">' + (t.foto ? '<button type="button" class="btn" data-foto="camara">' + I.camara + 'Otra foto</button>' : '') +
      '<button type="button" class="btn peligro" id="b-borrar">Borrar</button></div>' +
      '<button type="button" class="btn primario ancho" id="b-listo" style="margin-top:12px">Listo</button>' +
      '</form>' + nav('tickets');

    pintarCola();
    const f = $('#f-ticket');
    const volver = () => { guardarYa(); location.hash = '#tickets'; };
    $('#b-volver').onclick = volver;
    $('#b-listo').onclick = volver;
    $$('[data-foto]').forEach(b => b.onclick = () => tomarFoto(id, b.dataset.foto));

    // Foto: primero la del celular; si no está, se baja una vez y se guarda.
    if (t.foto) {
      const img = $('#foto');
      idb.foto(id).then(async local => {
        let src = local;
        if (!src && token()) {
          try { src = await rpc('via_foto', { p_token: token(), p_id: id }); if (src) idb.ponerFoto(id, src); } catch (e) { }
        }
        if (src) img.src = src; else img.replaceWith(Object.assign(document.createElement('div'), { className: 'sin-foto', textContent: 'La foto se verá cuando haya señal' }));
      });
      img.onclick = () => verFoto(img.src);
    }

    // Guardado por diferencia, sin botón: cada campo se guarda solo.
    const base = Object.assign({}, t);
    let timer;
    const leer = () => ({
      total: numero(f.total.value), comercio: f.comercio.value.trim(), fecha: f.fecha.value || null,
      folio: f.folio.value.trim(), portal: f.portal.value.trim(), viaje: f.viaje.value || null,
      notas: f.notas.value.trim(),
      // si la fecha límite es la de fin de mes calculada, no se fija: sigue a la fecha del ticket
      limite: f.limite.value && f.limite.value !== (f.fecha.value ? finDeMes(f.fecha.value) : '') ? f.limite.value : null,
    });
    function guardarYa() {
      clearTimeout(timer);
      if (!f.isConnected) return;
      const ahora = leer(), cambios = {};
      Object.keys(ahora).forEach(k => { if ((ahora[k] || null) !== (base[k] || null)) cambios[k] = ahora[k]; });
      if (!Object.keys(cambios).length) return;
      Object.assign(base, cambios);
      if (base.portal && base.comercio && ('portal' in cambios || 'comercio' in cambios)) aprenderPortal(base.comercio, base.portal);
      hacer({ tipo: 'ticket', id, cambios });
      const g = $('#guardado'); if (g) { g.textContent = 'Guardado'; setTimeout(() => { if (g) g.textContent = ''; }, 1500); }
    }
    f.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(guardarYa, 700); });
    f.addEventListener('change', ev => {
      if (ev.target.name === 'fecha' && !base.limite) f.limite.value = f.fecha.value ? finDeMes(f.fecha.value) : '';
      if (ev.target.name === 'comercio' && !f.portal.value) {
        const p = portalConocido(f.comercio.value);
        if (p) { f.portal.value = p; avisar('Usé el portal de la vez pasada'); }
      }
      guardarYa();
    });
    antesDeSalir = guardarYa;   // el enrutador lo llama antes de cambiar de vista
    $$('[data-lim]', f).forEach(b => b.onclick = () => {
      const desde = f.fecha.value || hoy();
      f.limite.value = b.dataset.lim === 'mes' ? finDeMes(desde)
        : new Date(aFecha(desde).getTime() + Number(b.dataset.lim) * 864e5).toISOString().slice(0, 10);
      guardarYa();
    });
    $$('[data-chips]', f).forEach(g => g.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const campo = g.dataset.chips;
      const val = (campo === 'categoria' && b.getAttribute('aria-pressed') === 'true') ? null : b.dataset.v;
      $$('button', g).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === val)));
      base[campo] = val;
      const cambios = { [campo]: val };
      if (campo === 'factura' && val === 'solicitada' && !base.solicitada_el) cambios.solicitada_el = base.solicitada_el = hoy();
      hacer({ tipo: 'ticket', id, cambios });
      const gd = $('#guardado'); if (gd) { gd.textContent = 'Guardado'; setTimeout(() => { gd.textContent = ''; }, 1500); }
    }));

    const bs = $('#b-soltar');
    if (bs) bs.onclick = () => {
      const x = facturaDe(t);
      hacer({ tipo: 'asignar', uuid: x.uuid, ticket: null });
      vistaTicket(id);
      avisar('La factura quedó sin ticket', { texto: 'Deshacer', fn: () => hacer({ tipo: 'asignar', uuid: x.uuid, ticket: id }).then(() => vistaTicket(id)) });
    };
    $('#b-borrar').onclick = () => {
      const copia = Object.assign({}, E.datos.tickets.find(x => x.id === id));
      hacer({ tipo: 'borrar', id, si: true });
      location.hash = '#tickets';
      avisar('Ticket borrado', { texto: 'Deshacer', fn: () => hacer({ tipo: 'borrar', id, si: false, ticket: copia }).then(pintar) });
    };
  }

  /* ── Factura (la que llegó por Gmail) ────────────────── */
  function tarjetaFactura(f, t) {
    const err = f.errores || [], av = f.avisos || [];
    const fila = (k, v, mono) => v == null || v === '' ? '' : '<div><dt>' + esc(k) + '</dt><dd' + (mono ? ' class="mono"' : '') + '>' + esc(v) + '</dd></div>';
    const sat = f.sat && f.sat.estado;
    const difiere = t && t.total > 0 && Math.abs(t.total - f.total) > 1;
    const enlace = (k, txt) => f.drive && f.drive[k] ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(f.drive[k].url) + '">' + I.abrir + txt + '</a>' : '';
    return '<section class="tarjeta factura"><h2>Factura</h2>' +
      (err.length ? '<div class="franja peligro">' + I.info + '<div><b>Pide que la corrijan:</b><ul>' + err.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul></div></div>' : '') +
      (av.length ? '<div class="franja alerta">' + I.info + '<div>' + av.map(esc).join('<br>') + '</div></div>' : '') +
      (difiere ? '<div class="franja alerta">' + I.info + '<div>El ticket dice ' + dinero(t.total) + ' y la factura ' + dinero(f.total) + '. Si fue por la propina, está bien; anota la diferencia aparte.</div></div>' : '') +
      '<dl class="fact">' + fila('Emisor', f.emisor_nombre) + fila('RFC del emisor', f.emisor_rfc) +
      fila('Folio fiscal (UUID)', f.uuid, true) + fila('Fecha', f.fecha ? fechaLarga(f.fecha) : '') +
      fila('Subtotal', dinero(f.subtotal)) + fila('IVA', dinero(f.iva)) + fila('Total', dinero(f.total)) +
      fila('Ante el SAT', sat ? sat + (f.sat.revisado ? ' · ' + hace(f.sat.revisado) : '') : 'Sin verificar') + '</dl>' +
      (f.drive ? '<div class="dos" style="margin-top:12px">' + enlace('pdf', 'PDF') + enlace('xml', 'XML') + '</div>' : '<p class="chico tenue" style="margin:10px 0 0">' + (f.origen === 'descarga'
          ? 'El PDF y el XML ya están a salvo (los bajaste del portal). Se suben a tu Drive en cuanto el buzón de Gmail reciba el correo de esta factura.'
          : 'Los archivos se guardan en tu Drive en la siguiente revisión del buzón.') + '</p>') +
      (f.drive && !f.drive.pdf ? '<p class="chico tenue" style="margin:8px 0 0">El correo no traía PDF; el XML es lo que vale.</p>' : '') +
      (t ? '<p style="margin:10px 0 0;text-align:right"><button class="enlace chico" id="b-soltar">No es de este ticket</button></p>' : '') +
      '</section>';
  }

  /* ── Vista: facturas que llegaron sin ticket ─────────── */
  function vistaFacturas() {
    const fs = sinTicket();
    const libres = E.datos.tickets.filter(t => !t.uuid && t.factura !== 'sin');
    app.innerHTML =
      '<div class="cabeza" style="padding-bottom:4px"><button class="volver" id="b-volver">' + I.flecha + 'Tickets</button><span id="cola"></span></div>' +
      '<h2 class="titulo-paso">Facturas sin ticket</h2>' +
      (fs.length ? '<p class="tenue" style="margin:-6px 0 14px">Llegaron a tu correo pero no supe de qué ticket son (casi siempre porque el total no coincide, por la propina). Elige el ticket, o crea uno si no le tomaste foto.</p>' : '<p class="vacio">Todas las facturas tienen su ticket.</p>') +
      fs.map(f => {
        const opciones = libres.slice().sort((a, b) => Math.abs((a.total || 0) - f.total) - Math.abs((b.total || 0) - f.total))
          .map(t => '<option value="' + esc(t.id) + '">' + esc((t.comercio || 'Sin leer') + ' · ' + (t.total > 0 ? dinero(t.total) : 'sin total') + (t.fecha ? ' · ' + fechaCorta(t.fecha) : '')) + '</option>').join('');
        return '<section class="tarjeta" data-uuid="' + esc(f.uuid) + '">' +
          '<h2 style="margin-bottom:2px">' + esc(f.emisor_nombre || f.emisor_rfc) + '</h2>' +
          '<p class="tenue" style="margin:0 0 10px">' + (f.fecha ? fechaLarga(f.fecha) : '') + ' · <b style="color:var(--tinta)">' + dinero(f.total) + '</b> · IVA ' + dinero(f.iva) + '</p>' +
          ((f.errores || []).length ? '<div class="franja peligro">' + I.info + '<div>' + f.errores.map(esc).join('<br>') + '</div></div>' : '') +
          ((f.tipo || 'I') !== 'I' ? '<p class="chico" style="color:var(--alerta)">' + esc((f.avisos || [])[0] || '') + '</p>' : '') +
          (opciones ? '<label class="campo"><span>¿De qué ticket es?</span><select class="sel-ticket">' + opciones + '</select></label>' +
            '<button class="btn primario ancho b-asignar">Asignar a ese ticket</button>' : '') +
          '<div class="dos" style="margin-top:10px"><button class="btn b-crear">Crear ticket</button>' +
          (f.drive && f.drive.pdf ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(f.drive.pdf.url) + '">' + I.abrir + 'Ver PDF</a>' : '<span></span>') + '</div>' +
          '</section>';
      }).join('') + nav('tickets');
    pintarCola();
    $('#b-volver').onclick = () => { location.hash = '#tickets'; };
    $$('[data-uuid]').forEach(s => {
      const uuid = s.dataset.uuid, f = fs.find(x => x.uuid === uuid);
      const ba = $('.b-asignar', s);
      if (ba) ba.onclick = () => { hacer({ tipo: 'asignar', uuid, ticket: $('.sel-ticket', s).value }).then(vistaFacturas); avisar('Factura asignada'); };
      $('.b-crear', s).onclick = async () => {
        const v = E.datos.viajes.find(x => x.inicio && x.fin && x.inicio <= f.fecha && f.fecha <= x.fin) || viajeActivo();
        const id = nuevoId('tk');
        await hacer({ tipo: 'ticket', id, cambios: { viaje: v ? v.id : null, fecha: f.fecha, comercio: f.emisor_nombre, total: f.total, rfc: f.emisor_rfc, factura: 'pendiente', creado: new Date().toISOString() } });
        await hacer({ tipo: 'asignar', uuid, ticket: id });
        location.hash = '#ticket/' + id;
      };
    });
  }

  /* ── Vista: conectar Gmail ───────────────────────────── */
  function estadoBuzon() {
    const b = E.datos.buzon || {};
    if (!b.visto) return { ok: false, txt: b.conectado ? 'Esperando la primera revisión del script…' : 'Todavía no está conectado.' };
    const horas = (Date.now() - new Date(b.visto)) / 36e5;
    return {
      ok: horas < 2,
      txt: (horas < 2 ? 'Conectado' : 'Hace ' + hace(b.visto).replace('hace ', '') + ' que no revisa tu correo') +
        (b.cuenta ? ' · ' + b.cuenta : '') + '. Última revisión ' + hace(b.visto) + '.',
      errores: b.errores || [],
    };
  }

  function vistaGmail() {
    const pintaEstado = () => {
      const e = estadoBuzon(), c = $('#estado-buzon'); if (!c) return;
      c.className = 'franja ' + (e.ok ? 'ok' : 'info');
      c.innerHTML = (e.ok ? I.palomita : I.info) + '<div>' + esc(e.txt) +
        ((e.errores || []).length ? '<br><b>Problemas:</b> ' + e.errores.map(esc).join(' · ') : '') + '</div>';
    };
    app.innerHTML =
      '<div class="cabeza" style="padding-bottom:4px"><button class="volver" id="b-volver">' + I.flecha + 'Viajes</button><span id="cola"></span></div>' +
      '<h2 class="titulo-paso">Facturas desde tu Gmail</h2>' +
      '<div id="estado-buzon"></div>' +
      '<section class="tarjeta"><p style="margin:0 0 10px">Un script en <b>tu</b> cuenta de Google revisa tu correo cada 15 minutos. Cuando llega una factura: lee el XML, revisa que esté a nombre de la Ibero, la junta con su ticket y guarda el PDF y el XML en tu Drive, en la carpeta <b>Viáticos</b>, una por viaje.</p>' +
      '<p class="chico tenue" style="margin:0">No borra ni mueve correos: sólo les pone la etiqueta «Viaticos-procesado».</p></section>' +
      '<section class="tarjeta paso"><h3><i>1</i>Abre Apps Script</h3>' +
      '<p class="chico" style="margin:0 0 10px">Mejor en la computadora. Entra con <b>el Gmail donde te llegan las facturas</b>.</p>' +
      '<a class="btn ancho" target="_blank" rel="noopener" href="https://script.google.com/home/projects/create">' + I.abrir + 'Nuevo proyecto en script.google.com</a>' +
      '<p class="chico tenue" style="margin:10px 0 0">Arriba a la izquierda dice «Proyecto sin título»: cámbiale el nombre a «Viáticos».</p></section>' +
      '<section class="tarjeta paso"><h3><i>2</i>Pega el script</h3>' +
      '<p class="chico" style="margin:0 0 10px">Borra lo que trae el editor (<i>function myFunction…</i>) y pega esto:</p>' +
      '<button class="btn primario ancho" id="b-script">' + I.copiar + 'Copiar el script</button>' +
      '<textarea id="txt-script" class="script" readonly hidden></textarea></section>' +
      '<section class="tarjeta paso"><h3><i>3</i>Instálalo</h3><ol class="lista-pasos">' +
      '<li>Guarda: el ícono del disquete, o Ctrl + S.</li>' +
      '<li>En la barra de arriba, a la derecha de «Depurar», elige <b>instalar</b> y toca <b>▷ Ejecutar</b>.</li>' +
      '<li>Google pide permiso: <b>Revisar permisos</b> → tu cuenta → <b>Configuración avanzada</b> → <b>Ir a Viáticos (no seguro)</b> → <b>Permitir</b>.</li></ol>' +
      '<p class="chico tenue" style="margin:10px 0 0">Dice «no seguro» sólo porque el script es tuyo y Google no lo ha revisado. Lo que pide: leer tu correo, guardar archivos en tu Drive y conectarse a la app.</p></section>' +
      '<section class="tarjeta paso"><h3><i>4</i>Listo</h3><p class="chico" style="margin:0">Arriba dirá «Conectado» en cuanto termine la primera revisión. Para probar, reenvíate a ese Gmail una factura vieja con su XML.</p></section>' +
      nav('viajes');
    pintarCola();
    pintaEstado();
    alSincronizar = pintaEstado;
    relojVista = setInterval(() => { if (ruta().vista === 'gmail') { E.sincronizando || sincronizar(); } }, 10000);
    $('#b-volver').onclick = () => { location.hash = '#viajes'; };
    $('#b-script').onclick = async () => {
      const b = E.datos.buzon || {};
      if (b.conectado && !confirm('El buzón ya tiene un script. Copiarlo de nuevo crea una llave nueva: el script que ya instalaste deja de funcionar hasta que pegues éste en su lugar. ¿Seguir?')) return;
      const bt = $('#b-script'); bt.disabled = true; bt.textContent = 'Preparando…';
      try {
        const [llave, codigo] = await Promise.all([
          rpc('via_llave_buzon', { p_token: token() }),
          fetch('buzon.gs?v=' + CONFIG.version).then(r => { if (!r.ok) throw new Error('script'); return r.text(); }),
        ]);
        const texto = codigo.replace('__LLAVE__', llave);
        E.datos.buzon = Object.assign({}, E.datos.buzon, { conectado: true });
        const ta = $('#txt-script'); ta.value = texto; ta.hidden = false;
        const ok = await copiar(texto);
        bt.innerHTML = I.palomita + (ok ? 'Copiado. Pégalo en el editor' : 'Selecciona el texto de abajo y cópialo');
        if (!ok) { ta.focus(); ta.select(); }
        pintaEstado();
      } catch (e) {
        bt.textContent = e.red ? 'Sin conexión. Intenta de nuevo' : 'No se pudo: ' + e.message;
      } finally { bt.disabled = false; }
    };
  }

  /* ── Vista: pedir factura (el asistente) ─────────────── */
  function vistaFacturar(id) {
    const t = E.datos.tickets.find(x => x.id === id);
    if (!t) { location.hash = '#tickets'; return; }
    const correo = (E.datos.ajustes || {}).correo || '';
    const portal = t.portal || portalConocido(t.comercio);
    const p = pista(t.comercio);
    const lim = limite(t);
    const dato = (etq, val, extra) => val
      ? '<button class="dato" data-copiar="' + esc(val) + '" data-que="' + esc(etq) + '"><span class="medio"><small>' + esc(etq) + '</small><b>' + esc(val) + '</b>' + (extra ? '<em>' + esc(extra) + '</em>' : '') + '</span><span class="copiar">' + I.copiar + '</span></button>'
      : '';
    const falta = [!t.folio && 'folio', !(t.total > 0) && 'total', !t.fecha && 'fecha'].filter(Boolean);

    app.innerHTML =
      '<div class="cabeza" style="padding-bottom:4px"><button class="volver" id="b-volver">' + I.flecha + 'Ticket</button><span id="cola"></span></div>' +
      '<h2 class="titulo-paso">Pedir factura</h2>' +
      '<p class="tenue" style="margin:-6px 0 14px">' + esc(t.comercio || 'Comercio sin nombre') + (t.total > 0 ? ' · ' + dinero(t.total) : '') +
      (lim ? ' · <span class="' + (diasHasta(lim) < 0 ? 'rojo' : '') + '">' + (diasHasta(lim) < 0 ? 'venció el ' : 'antes del ') + fechaCorta(lim) + '</span>' : '') + '</p>' +

      '<section class="tarjeta paso"><h3><i>1</i>Entra al portal</h3>' +
      (portal ? '<a class="btn primario ancho" target="_blank" rel="noopener" href="' + esc(conHttp(portal)) + '">' + I.abrir + 'Abrir ' + esc(portal.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')) + '</a>'
        : '<p class="chico" style="margin:0 0 10px">Busca en el ticket una dirección que diga «facturación» o «factura electrónica». Si no la trae:</p>' +
          (t.comercio ? '<a class="btn ancho" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent('facturación ' + t.comercio) + '">' + I.abrir + 'Buscar «facturación ' + esc(t.comercio) + '»</a>' : '') +
          '<p class="chico tenue" style="margin:10px 0 0">Cuando la encuentres, anótala en el ticket: la próxima vez de ese comercio ya sale sola.</p>') +
      (p ? '<div class="franja info" style="margin:12px 0 0">' + I.info + '<div>' + esc(p) + '</div></div>' : '') +
      '</section>' +

      '<section class="tarjeta paso"><h3><i>2</i>Datos del ticket</h3>' +
      (falta.length ? '<p class="chico" style="color:var(--alerta);margin:0 0 6px">Falta ' + falta.join(', ') + '. Está en la foto: <a href="#ticket/' + esc(id) + '">ver ticket</a>.</p>' : '') +
      dato('Folio o núm. de ticket', t.folio) + dato('Total', t.total > 0 ? Number(t.total).toFixed(2) : '') +
      dato('Fecha', dmy(t.fecha), t.fecha ? fechaLarga(t.fecha) : '') +
      (t.foto ? '<button class="btn ancho" id="b-ver" style="margin-top:10px">' + I.imagen + 'Ver la foto del ticket</button>' : '') +
      '</section>' +

      '<section class="tarjeta paso"><h3><i>3</i>Datos de la Ibero</h3>' +
      CONFIG.fiscales.map(d => dato(d.etiqueta, d.valor, d.detalle)).join('') +
      (correo ? dato('Correo', correo) : '<p class="chico" style="margin:10px 0 0">Falta tu correo para recibirla: <a href="#fiscales">anótalo en Datos fiscales</a>.</p>') +
      '</section>' +

      '<section class="tarjeta paso"><h3><i>4</i>¿Ya la pediste?</h3>' +
      '<p class="chico tenue" style="margin:0 0 10px">Te tiene que llegar al correo en PDF y XML. Si el portal te deja descargarla, bájala también.</p>' +
      '<button class="btn primario ancho" id="b-pedida">' + I.palomita + 'Ya la pedí</button>' +
      '<div class="dos" style="margin-top:10px"><button class="btn" id="b-recibida">Ya me llegó</button><button class="btn" id="b-sin">No dan factura</button></div>' +
      '</section>' + nav('tickets');
    pintarCola();

    $('#b-volver').onclick = () => { location.hash = '#ticket/' + id; };
    const bv = $('#b-ver');
    if (bv) bv.onclick = async () => {
      let src = await idb.foto(id).catch(() => null);
      if (!src && token()) { try { src = await rpc('via_foto', { p_token: token(), p_id: id }); if (src) idb.ponerFoto(id, src); } catch (e) { } }
      if (src) verFoto(src); else avisar('La foto se verá cuando haya señal');
    };
    $$('[data-copiar]').forEach(b => b.onclick = async () => {
      await copiar(b.dataset.copiar);
      b.classList.add('copiado'); b.querySelector('.copiar').innerHTML = I.palomita;
      setTimeout(() => { b.classList.remove('copiado'); b.querySelector('.copiar').innerHTML = I.copiar; }, 1400);
      avisar('Copiado: ' + b.dataset.que);
    });
    const marcar = (factura, txt) => {
      const cambios = { factura };
      if (factura === 'solicitada' && !t.solicitada_el) cambios.solicitada_el = hoy();
      if (!t.portal && portal) cambios.portal = portal;
      hacer({ tipo: 'ticket', id, cambios });
      location.hash = '#tickets';
      avisar(txt, { texto: 'Deshacer', fn: () => hacer({ tipo: 'ticket', id, cambios: { factura: 'pendiente' } }).then(pintar) });
    };
    $('#b-pedida').onclick = () => marcar('solicitada', 'Marcada como pedida');
    $('#b-recibida').onclick = () => marcar('recibida', 'Marcada como recibida');
    $('#b-sin').onclick = () => marcar('sin', 'Va en «sin factura»');
  }

  function verFoto(src) {
    if (!src) return;
    const v = document.createElement('div');
    v.className = 'visor';
    v.innerHTML = '<img alt="Ticket"><button class="btn">Cerrar</button>';
    v.querySelector('img').src = src;
    v.querySelector('img').onclick = () => v.classList.toggle('zoom');
    v.querySelector('button').onclick = () => v.remove();
    document.body.appendChild(v);
  }

  /* ── Vista: datos fiscales ───────────────────────────── */
  function vistaFiscales() {
    const correo = (E.datos.ajustes || {}).correo || '';
    const filas = CONFIG.fiscales.map(d =>
      '<button class="dato" data-copiar="' + esc(d.valor) + '" data-que="' + esc(d.etiqueta) + '"><span class="medio"><small>' + esc(d.etiqueta) + '</small><b>' + esc(d.valor) + '</b>' +
      (d.detalle ? '<em>' + esc(d.detalle) + '</em>' : '') + (d.nota ? '<span class="nota">' + esc(d.nota) + '</span>' : '') +
      '</span><span class="copiar">' + I.copiar + '</span></button>').join('');
    const filaCorreo = correo
      ? '<button class="dato" data-copiar="' + esc(correo) + '" data-que="Correo"><span class="medio"><small>Correo para recibir la factura</small><b style="font-size:17px">' + esc(correo) + '</b></span><span class="copiar">' + I.copiar + '</span></button>' +
        '<p style="margin:0;text-align:right"><button class="enlace chico" id="b-cambiar-correo">Cambiar correo</button></p>'
      : '<form id="f-correo" style="padding-top:12px"><label class="campo"><span>Correo para recibir la factura</span><input name="correo" type="email" inputmode="email" autocapitalize="none" placeholder="tu Gmail personal" required></label><button class="btn primario ancho">Guardar correo</button></form>';

    app.innerHTML = cabeza('Datos para facturar') +
      '<section class="tarjeta"><h2>Universidad Iberoamericana Tijuana</h2><p class="chico tenue" style="margin:-4px 0 4px">Toca cualquier dato para copiarlo.</p>' + filas + filaCorreo + '</section>' +
      '<button class="btn ancho" id="b-todo" style="margin-bottom:14px">' + I.copiar + 'Copiar todos los datos</button>' +
      '<section class="tarjeta"><h2>Cómo pedir una factura</h2><ol style="margin:0;padding-left:20px;line-height:1.5">' +
      '<li>Pide <b>siempre</b> el ticket y tómale foto aquí en cuanto pagues.</li>' +
      '<li>Entra al portal de facturación que viene impreso en el ticket. En el hotel, pídela al hacer <i>check-out</i>; en Uber o DiDi, desde su app.</li>' +
      '<li>Pega estos datos tal cual. El portal pide además el folio y el total del ticket.</li>' +
      '<li>Que llegue a tu correo: manda <b>PDF y XML</b>. Se entregan los dos; el XML es la factura de verdad.</li>' +
      '<li>Marca el ticket como «Pedida» y, cuando llegue, como «Recibida».</li></ol>' +
      '<p class="chico tenue" style="margin:12px 0 0">Propinas, taxis de la calle y otros gastos sin factura también se anotan: marca «No tiene» y van en una sección aparte de la comprobación.</p></section>' +
      nav('fiscales');
    pintarCola();

    $$('[data-copiar]').forEach(b => b.onclick = async () => {
      await copiar(b.dataset.copiar);
      b.classList.add('copiado'); b.querySelector('.copiar').innerHTML = I.palomita;
      setTimeout(() => { b.classList.remove('copiado'); b.querySelector('.copiar').innerHTML = I.copiar; }, 1400);
      avisar('Copiado: ' + b.dataset.que);
    });
    $('#b-todo').onclick = async () => {
      const txt = CONFIG.fiscales.map(d => d.etiqueta + ': ' + d.valor + (d.detalle ? ' – ' + d.detalle : '')).join('\n') + (correo ? '\nCorreo: ' + correo : '');
      await copiar(txt); avisar('Copiados todos los datos');
    };
    const fc = $('#f-correo');
    if (fc) fc.onsubmit = ev => { ev.preventDefault(); hacer({ tipo: 'ajustes', cambios: { correo: fc.correo.value.trim() } }).then(vistaFiscales); };
    const bc = $('#b-cambiar-correo');
    if (bc) bc.onclick = () => hacer({ tipo: 'ajustes', cambios: { correo: '' } }).then(vistaFiscales);
  }

  /* ── Vista: viajes ───────────────────────────────────── */
  function vistaViajes() {
    const vs = E.datos.viajes;
    app.innerHTML = cabeza('Tus viajes') +
      '<a class="btn primario ancho" href="#viaje/nuevo" style="margin-bottom:14px">Nuevo viaje</a>' +
      (vs.length ? '<div class="lista">' + vs.map(v => {
        const k = cuentas(ticketsDe(v.id));
        return '<a class="fila" href="#viaje/' + esc(v.id) + '"><span class="miniatura">' + I.maleta + '</span><span class="medio"><span class="comercio">' + esc(v.nombre) + '</span>' +
          '<span class="chico tenue">' + (v.inicio ? fechaCorta(v.inicio) + (v.fin ? ' – ' + fechaCorta(v.fin) : '') : 'Sin fechas') + ' · ' + k.n + (k.n === 1 ? ' ticket' : ' tickets') + '</span></span>' +
          '<span class="total">' + dinero(k.gastado) + (v.asignado > 0 ? '<br><span class="chico tenue" style="font-family:var(--texto);font-weight:400">de ' + dinero(v.asignado) + '</span>' : '') + '</span></a>';
      }).join('') + '</div>' : '<p class="vacio">Todavía no hay viajes.</p>') +
      (() => {
        const e = estadoBuzon();
        return '<section class="tarjeta" style="margin-top:22px"><h2>Facturas desde tu Gmail</h2>' +
          '<p class="chico ' + (e.ok ? '' : 'tenue') + '" style="margin:0 0 12px' + (e.ok ? ';color:var(--ok)' : '') + '">' + esc(e.txt) + '</p>' +
          '<a class="btn ancho" href="#gmail">' + (E.datos.buzon && E.datos.buzon.visto ? 'Ver la conexión' : 'Conectar mi Gmail') + '</a></section>';
      })() +
      (yaInstalada() ? '' : '<div id="hueco-instalar" style="margin-top:22px"><button class="btn ancho" id="b-ver-instalar">' + I.mas + 'Agregar a mi pantalla de inicio</button></div>') +
      '<p style="text-align:center;margin-top:30px"><button class="enlace chico" id="b-salir">Cerrar sesión</button><br><span class="chico tenue">Versión ' + esc(CONFIG.version) + '</span></p>' +
      nav('viajes');
    pintarCola();
    $('#b-salir').onclick = () => salir(false);
    const bvi = $('#b-ver-instalar');
    if (bvi) bvi.onclick = () => { $('#hueco-instalar').innerHTML = tarjetaInstalar(true); activarInstalar(); };
  }

  function vistaViaje(id) {
    const nuevo = id === 'nuevo';
    const v = nuevo ? { id: nuevoId('vj') } : E.datos.viajes.find(x => x.id === id);
    if (!v) { location.hash = '#viajes'; return; }
    const n = nuevo ? 0 : ticketsDe(v.id).length;
    app.innerHTML =
      '<div class="cabeza" style="padding-bottom:4px"><button class="volver" onclick="history.back()">' + I.flecha + 'Volver</button><span id="cola"></span></div>' +
      '<form id="f-viaje" class="tarjeta"><h2>' + (nuevo ? 'Nuevo viaje' : 'Editar viaje') + '</h2>' +
      '<label class="campo"><span>Nombre</span><input name="nombre" required placeholder="Ej. INTERSUJ CDMX" value="' + esc(v.nombre || '') + '"></label>' +
      '<div class="dos"><label class="campo"><span>Sale</span><input name="inicio" type="date" value="' + esc(v.inicio || '') + '"></label>' +
      '<label class="campo"><span>Regresa</span><input name="fin" type="date" value="' + esc(v.fin || '') + '"></label></div>' +
      '<label class="campo total"><span>Viáticos asignados</span><input name="asignado" inputmode="decimal" placeholder="0.00" value="' + (v.asignado > 0 ? esc(Number(v.asignado).toFixed(2)) : '') + '"></label>' +
      '<label class="campo"><span>Tope de comida por día</span><input name="tope" inputmode="decimal" placeholder="' + CONFIG.topeAlimentos + '" value="' + (v.tope_alimentos > 0 ? esc(String(v.tope_alimentos)) : '') + '">' +
      '<small class="tenue">Lo que Contabilidad acepta de alimentos al día. Vacío = ' + dinero(CONFIG.topeAlimentos) + '.</small></label>' +
      '<div class="dos"><label class="campo"><span>Días altos</span><input name="dias_altos" inputmode="numeric" placeholder="' + CONFIG.diasAltos + '" value="' + (v.dias_altos != null ? esc(String(v.dias_altos)) : '') + '"></label>' +
      '<label class="campo"><span>Tope del día alto</span><input name="tope_alto" inputmode="decimal" placeholder="' + CONFIG.topeAlto + '" value="' + (v.tope_alto > 0 ? esc(String(v.tope_alto)) : '') + '"></label></div>' +
      '<p class="chico tenue" style="margin:-8px 0 14px">Cuántos días se pueden pasar del tope, y hasta cuánto. 0 días = ninguno.</p>' +
      '<button class="btn primario ancho">Guardar</button>' +
      (nuevo ? '' : '<button type="button" class="btn peligro ancho" id="b-borrar-viaje" style="margin-top:10px">Borrar viaje</button>' +
        (n ? '<p class="chico tenue" style="margin:8px 0 0;text-align:center">Tiene ' + n + (n === 1 ? ' ticket' : ' tickets') + ': para borrarlo, primero muévelos a otro viaje o bórralos.</p>' : '')) +
      '</form>' + nav('viajes');
    pintarCola();
    const f = $('#f-viaje');
    f.onsubmit = async ev => {
      ev.preventDefault();
      const datos = { id: v.id, nombre: f.nombre.value.trim(), inicio: f.inicio.value || null, fin: f.fin.value || null, asignado: numero(f.asignado.value), tope_alimentos: numero(f.tope.value) || null,
        tope_alto: numero(f.tope_alto.value) || null, dias_altos: f.dias_altos.value.trim() === '' ? null : Math.max(0, Math.round(numero(f.dias_altos.value) || 0)) };
      await hacer({ tipo: 'viaje', v: datos });
      if (nuevo) await hacer({ tipo: 'ajustes', cambios: { viajeActivo: v.id } });
      avisar('Viaje guardado');
      location.hash = '#tickets';
    };
    const bb = $('#b-borrar-viaje');
    if (bb) bb.onclick = () => {
      if (n) { avisar('Primero mueve o borra sus ' + n + ' tickets.'); return; }
      hacer({ tipo: 'borrarViaje', id: v.id });
      location.hash = '#viajes';
      avisar('Viaje borrado');
    };
  }

  /* ── Vista: qué entregar ─────────────────────────────── */
  function vistaEntregar(id) {
    const v = E.datos.viajes.find(x => x.id === id);
    if (!v) { location.hash = '#tickets'; return; }
    const x = entrega(v);
    const asig = v.asignado > 0 ? Number(v.asignado) : null;
    const devuelves = asig != null ? asig - x.entregas : null;
    const bolsa = x.gastado - x.entregas;
    const pedir = x.ts.filter(t => x.sel.has(t.id) && porFacturar(t));
    const yaNo = x.ts.filter(t => !x.sel.has(t.id) && entregable(t) && porFacturar(t));
    const manuales = x.ts.some(t => t.presentar === true || t.presentar === false);

    const dias = {};
    x.ts.forEach(t => { const d = t.fecha || ''; (dias[d] = dias[d] || []).push(t); });
    const filaE = t => {
      const si = x.sel.has(t.id), puede = entregable(t);
      const quien = !puede ? (t.factura === 'sin' ? 'Sin factura · no se entrega' : 'Faltan datos')
        : t.presentar === true ? 'Lo marcaste tú' : t.presentar === false ? 'Lo quitaste tú'
        : (t.categoria === 'alimentos' ? (si ? 'Cabe en el tope' : 'No cabe en el tope') : 'Se entrega completo');
      return '<button type="button" class="fila entrega" data-id="' + esc(t.id) + '" aria-pressed="' + si + '"' + (puede ? '' : ' disabled') + '>' +
        '<span class="marca">' + (si ? I.palomita : '') + '</span>' +
        '<span class="medio"><span class="comercio">' + esc(t.comercio || 'Sin comercio') + '</span>' +
        '<span class="chico tenue">' + esc(cat(t.categoria) || 'Sin categoría') + ' · ' + esc(quien) + '</span></span>' +
        '<span class="total">' + (t.total > 0 ? dinero(t.total) : '') + '</span></button>';
    };
    const lista = Object.keys(dias).sort().map(d => {
      const comida = x.comidaDe(d);
      const comidaSi = comida.filter(t => x.sel.has(t.id)).reduce((s, t) => s + t.total, 0);
      const comidaTodo = comida.reduce((s, t) => s + (t.total > 0 ? t.total : 0), 0);
      const td = x.topeDia(d);
      const pct = Math.min(100, comidaSi / td * 100);
      return '<h3 class="dia">' + (d ? fechaLarga(d) : 'Sin fecha') + (x.altos.has(d) ? ' <span class="dia-alto">Día alto</span>' : '') + '</h3>' +
        (comida.length ? '<div class="tope-dia' + (comidaSi > td ? ' pasado' : '') + '"><span>Comida que entregas: <b>' + dinero(comidaSi) + '</b> de ' + dinero(td) +
          (comidaTodo > comidaSi ? ' <span class="tenue">· gastaste ' + dinero(comidaTodo) + '</span>' : '') + '</span>' +
          '<div class="barra' + (comidaSi > td ? ' pasado' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' : '') +
        '<div class="lista">' + dias[d].map(filaE).join('') + '</div>';
    }).join('');

    app.innerHTML =
      '<div class="cabeza" style="padding-bottom:4px"><button class="volver" onclick="history.back()">' + I.flecha + 'Volver</button><span id="cola"></span></div>' +
      '<section class="tarjeta"><h2>Qué entregar · ' + esc(v.nombre) + '</h2>' +
      '<div class="resumen"><div><b>' + dinero(x.entregas) + '</b><span>Entregas</span></div>' +
      '<div><b>' + (devuelves != null ? dinero(Math.max(0, devuelves)) : '—') + '</b><span>Devuelves</span></div>' +
      '<div><b' + (bolsa > 0 ? ' style="color:var(--peligro)"' : '') + '>' + dinero(Math.max(0, bolsa)) + '</b><span>De tu bolsa</span></div></div>' +
      '<p class="chico tenue" style="margin:12px 0 0">Comida: hasta <b>' + dinero(x.tope) + ' por día</b>' +
      (x.nAltos > 0 && x.alto > x.tope ? ', y ' + (x.nAltos === 1 ? 'un día' : x.nAltos + ' días') + ' hasta <b>' + dinero(x.alto) + '</b>, el que más rinda' : '') +
      ' (<a href="#viaje/' + esc(v.id) + '">cambiar</a>). ' +
      'Hotel, transporte y lo demás se entrega completo. Toca un ticket para ponerlo o quitarlo.</p>' +
      (asig == null ? '<p class="chico tenue" style="margin:8px 0 0">Para saber cuánto devuelves, <a href="#viaje/' + esc(v.id) + '">anota cuánto te dieron</a>.</p>' : '') +
      (manuales ? '<button class="enlace chico" id="b-automatico" style="margin-top:8px;padding:0">Volver a la selección automática</button>' : '') +
      '</section>' +
      (pedir.length ? '<div class="franja alerta">' + I.info + '<div><b>' + pedir.length + (pedir.length === 1 ? ' factura por pedir' : ' facturas por pedir') + '</b> de lo que vas a entregar: ' +
        esc(pedir.map(t => t.comercio + ' ' + dinero(t.total)).join(', ')) + '.</div></div>' : '') +
      (yaNo.length ? '<div class="franja info">' + I.info + '<div><b>Éstas ya no hace falta pedirlas</b> (no caben en el tope): ' +
        esc(yaNo.map(t => t.comercio + ' ' + dinero(t.total)).join(', ')) + '.</div></div>' : '') +
      lista + nav('tickets');
    pintarCola();

    $$('.fila.entrega:not([disabled])').forEach(b => b.onclick = async () => {
      const t = E.datos.tickets.find(z => z.id === b.dataset.id);
      await hacer({ tipo: 'ticket', id: t.id, cambios: { presentar: !x.sel.has(t.id) } });
      vistaEntregar(id);
    });
    const ba = $('#b-automatico');
    if (ba) ba.onclick = async () => {
      for (const t of x.ts.filter(z => z.presentar === true || z.presentar === false)) await hacer({ tipo: 'ticket', id: t.id, cambios: { presentar: null } });
      vistaEntregar(id);
    };
  }

  /* ── Arranque ────────────────────────────────────────── */
  idb.cola().then(c => { E.pendientes = c.length; pintarCola(); }).catch(() => { });
  pintar();
  sincronizar();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
})();
