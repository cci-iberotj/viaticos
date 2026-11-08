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
    try {
      r = await fetch(CONFIG.nube.url + '/rest/v1/rpc/' + funcion, {
        method: 'POST',
        headers: { apikey: CONFIG.nube.llave, Authorization: 'Bearer ' + CONFIG.nube.llave, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch (e) { const x = new Error('SIN_RED'); x.red = true; throw x; }
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
    datos: ls.get(LLAVE_DATOS) || { nombre: '', ajustes: {}, viajes: [], tickets: [] },
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
      E.pendientes = resto.length;
      E.sinRed = false;
      E.ultimaSync = new Date();
      guardarCache();
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
  const faltaDato = t => !(t.total > 0) || !t.comercio;
  const porFacturar = t => (t.factura || 'pendiente') === 'pendiente';

  function estado(t) {
    const f = t.factura || 'pendiente';
    if (f === 'sin') return { c: 'e-sin', txt: 'Sin factura' };
    if (f === 'recibida') return { c: 'e-ok', txt: 'Factura recibida' };
    if (f === 'solicitada') return { c: 'e-pedida', txt: 'Factura pedida' };
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

  /* ── Enrutador ───────────────────────────────────────── */
  function ruta() {
    const h = location.hash.replace(/^#/, '') || 'tickets';
    const [camino, q] = h.split('?');
    const [vista, id] = camino.split('/');
    return { vista, id, q: q || '' };
  }
  let antesDeSalir = null;   // guarda lo que se estaba escribiendo en una ficha
  window.addEventListener('hashchange', () => { pintar(); window.scrollTo(0, 0); });

  function pintar(desdeSync) {
    if (!token()) return vistaAcceso();
    const r = ruta();
    if (!desdeSync && antesDeSalir) { const g = antesDeSalir; antesDeSalir = null; g(); }
    // Al llegar datos nuevos no se repinta un formulario mientras se escribe en él.
    if (desdeSync && (r.vista === 'ticket' || r.vista === 'viaje')) return;
    if (desdeSync && document.activeElement && document.activeElement.matches('input, textarea, select')) return;
    if (r.vista === 'ticket') return vistaTicket(r.id, r.q === 'nuevo');
    if (r.vista === 'fiscales') return vistaFiscales();
    if (r.vista === 'viajes') return vistaViajes();
    if (r.vista === 'viaje') return vistaViaje(r.id);
    return vistaTickets();
  }

  function cabeza(sub) {
    return '<header class="cabeza"><h1>Viáticos<small>' + esc(sub || 'IBERO Tijuana') + '</small></h1><span id="cola"></span></header>';
  }
  function pintarCola() {
    const c = $('#cola'); if (!c) return;
    if (E.pendientes > 0) {
      c.className = 'cola';
      c.textContent = (E.sinRed ? 'Sin señal · ' : '') + E.pendientes + (E.pendientes === 1 ? ' cambio por subir' : ' cambios por subir');
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
      '<label class="campo"><span>Usuario</span><input name="usuario" autocomplete="username" autocapitalize="none" required></label>' +
      '<label class="campo"><span>Clave</span><input name="clave" type="password" autocomplete="current-password" required></label>' +
      '<p class="error" id="error"></p>' +
      '<button class="btn primario ancho">Entrar</button></form></div>';
    $('#f-acceso').onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target, b = f.querySelector('button');
      b.disabled = true; b.textContent = 'Entrando…'; $('#error').textContent = '';
      try {
        E.sesion = await rpc('via_entrar', { p_usuario: f.usuario.value, p_clave: f.clave.value });
        ls.set(LLAVE_SESION, E.sesion);
        location.hash = '#tickets';
        pintar(); sincronizar();
      } catch (e) {
        $('#error').textContent = e.message === 'CLAVE' ? 'Usuario o clave incorrectos.' : e.red ? 'No hay conexión. Intenta de nuevo cuando tengas señal.' : e.message;
        b.disabled = false; b.textContent = 'Entrar';
      }
    };
  }

  function salir(vencida) {
    const t = token();
    E.sesion = null; ls.del(LLAVE_SESION); ls.del(LLAVE_DATOS);
    E.datos = { nombre: '', ajustes: {}, viajes: [], tickets: [] };
    if (t && !vencida) rpc('via_salir', { p_token: t }).catch(() => { });
    location.hash = '';
    vistaAcceso();
    if (vencida) avisar('Tu sesión venció. Vuelve a entrar.');
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
        (k.sin ? '<span>' + k.sin + ' sin CFDI</span>' : '') + '</div></section>';
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
        '</div></div>';
    }

    // Lista agrupada por día
    let lista = '';
    if (!ts.length) {
      lista = '<p class="vacio">Todavía no hay tickets' + (v ? ' en este viaje' : '') + '.<br>Toma la foto en cuanto pagues: es lo único que no se puede recuperar después.</p>';
    } else {
      const grupos = {};
      ts.forEach(t => { const d = t.fecha || ''; (grupos[d] = grupos[d] || []).push(t); });
      lista = Object.keys(grupos).sort().reverse().map(d =>
        '<h3 class="dia">' + (d ? fechaLarga(d) : 'Sin fecha') + '</h3><div class="lista">' +
        grupos[d].map(fila).join('') + '</div>').join('');
    }

    app.innerHTML = cabeza(E.datos.nombre ? 'Hola, ' + E.datos.nombre : '') +
      (E.datos.viajes.length || huerfanos ? '<label class="viaje-sel">' + I.maleta + '<select id="sel-viaje" aria-label="Viaje">' + opciones + '</select>' + I.abajo + '</label>'
        : '<div class="franja info">' + I.info + '<div>Primero <a href="#viaje/nuevo">da de alta tu viaje</a>; los tickets se van juntando ahí.</div></div>') +
      '<button class="btn primario capturar" id="b-capturar">' + I.camara + 'Foto del ticket</button>' +
      '<div class="bajo-captura"><button class="enlace" id="b-galeria">Subir imagen</button><span class="tenue">·</span><button class="enlace" id="b-sinfoto">Sin foto</button></div>' +
      franja + resumen + lista + nav('tickets');

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
      '<small class="chico tenue">Casi todos dejan facturar dentro del mismo mes. Si el ticket dice otra cosa (24 o 72 horas), cámbiala.</small></label>' +
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
      hacer({ tipo: 'ticket', id, cambios });
      const g = $('#guardado'); if (g) { g.textContent = 'Guardado'; setTimeout(() => { if (g) g.textContent = ''; }, 1500); }
    }
    f.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(guardarYa, 700); });
    f.addEventListener('change', ev => {
      if (ev.target.name === 'fecha' && !base.limite) f.limite.value = f.fecha.value ? finDeMes(f.fecha.value) : '';
      guardarYa();
    });
    antesDeSalir = guardarYa;   // el enrutador lo llama antes de cambiar de vista
    $$('[data-chips]', f).forEach(g => g.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const campo = g.dataset.chips;
      const val = (campo === 'categoria' && b.getAttribute('aria-pressed') === 'true') ? null : b.dataset.v;
      $$('button', g).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === val)));
      base[campo] = val;
      hacer({ tipo: 'ticket', id, cambios: { [campo]: val } });
      const gd = $('#guardado'); if (gd) { gd.textContent = 'Guardado'; setTimeout(() => { gd.textContent = ''; }, 1500); }
    }));

    $('#b-borrar').onclick = () => {
      const copia = Object.assign({}, E.datos.tickets.find(x => x.id === id));
      hacer({ tipo: 'borrar', id, si: true });
      location.hash = '#tickets';
      avisar('Ticket borrado', { texto: 'Deshacer', fn: () => hacer({ tipo: 'borrar', id, si: false, ticket: copia }).then(pintar) });
    };
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
      '<p style="text-align:center;margin-top:30px"><button class="enlace chico" id="b-salir">Cerrar sesión</button><br><span class="chico tenue">Versión ' + esc(CONFIG.version) + '</span></p>' +
      nav('viajes');
    pintarCola();
    $('#b-salir').onclick = () => salir(false);
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
      '<button class="btn primario ancho">Guardar</button>' +
      (nuevo ? '' : '<button type="button" class="btn peligro ancho" id="b-borrar-viaje" style="margin-top:10px">Borrar viaje</button>' +
        (n ? '<p class="chico tenue" style="margin:8px 0 0;text-align:center">Tiene ' + n + (n === 1 ? ' ticket' : ' tickets') + ': para borrarlo, primero muévelos a otro viaje o bórralos.</p>' : '')) +
      '</form>' + nav('viajes');
    pintarCola();
    const f = $('#f-viaje');
    f.onsubmit = async ev => {
      ev.preventDefault();
      const datos = { id: v.id, nombre: f.nombre.value.trim(), inicio: f.inicio.value || null, fin: f.fin.value || null, asignado: numero(f.asignado.value) };
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

  /* ── Arranque ────────────────────────────────────────── */
  idb.cola().then(c => { E.pendientes = c.length; pintarCola(); }).catch(() => { });
  pintar();
  sincronizar();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
})();
