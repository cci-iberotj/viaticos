/* ═══════════════════════════════════════════════════════════
   Viáticos · buzón de facturas
   Vive en TU Gmail (script.google.com). Cada 15 minutos:
     1. busca correos nuevos con factura (XML, o ZIP con XML adentro);
     2. lee el XML y pregunta al SAT si está vigente;
     3. lo manda a la app, que revisa que esté a nombre de la Ibero
        y lo empata con su ticket;
     4. guarda el PDF y el XML en tu Drive, en «Viáticos / <viaje>».
   No borra ni mueve correos: sólo les pone la etiqueta
   «Viaticos-procesado» para no leerlos dos veces.

   PARA INSTALARLO: elige la función «instalar» arriba y toca
   «Ejecutar». Acepta los permisos. Ya no hay que hacer nada más.
   ═══════════════════════════════════════════════════════════ */

const LLAVE = '__LLAVE__';
const BASE = 'https://wrezcukptrtmnhnlxmao.supabase.co/rest/v1/rpc/';
const PUBLICABLE = 'sb_publishable_XTkkarWw-P3Ls31g5ZDTOA_ZghkWshN';
const ETIQUETA = 'Viaticos-procesado';
const BUSQUEDA = '{filename:xml filename:zip} newer_than:120d -label:viaticos-procesado';
const CARPETA_RAIZ = 'Viáticos';

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisar').timeBased().everyMinutes(15).create();
  revisar();
  Logger.log('Listo: el buzón revisa tu correo cada 15 minutos.');
}

function revisar() {
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(5000)) return;
  const informe = { facturas: 0, errores: [], cuenta: '' };
  try {
    try { informe.cuenta = Session.getActiveUser().getEmail(); } catch (e) { }
    const etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
    GmailApp.search(BUSQUEDA, 0, 25).forEach(hilo => {
      let bien = true;
      hilo.getMessages().forEach(m => {
        try { informe.facturas += procesarMensaje(m); }
        catch (e) { bien = false; informe.errores.push(m.getSubject().slice(0, 60) + ': ' + e.message); }
      });
      if (bien) hilo.addLabel(etiqueta);   // si falló, se reintenta en la siguiente vuelta
    });
    try { acomodar(); } catch (e) { informe.errores.push('Acomodar en Drive: ' + e.message); }
  } finally {
    informe.errores = informe.errores.slice(0, 5);
    try { rpc('via_buzon_latido', { p_llave: LLAVE, p_info: informe }); } catch (e) { }
    candado.releaseLock();
  }
}

function procesarMensaje(m) {
  const xmls = [], pdfs = [];
  m.getAttachments({ includeInlineImages: false }).forEach(a => {
    const n = a.getName().toLowerCase();
    if (n.endsWith('.xml')) xmls.push(a.copyBlob());
    else if (n.endsWith('.pdf')) pdfs.push(a.copyBlob());
    else if (n.endsWith('.zip')) {
      try {
        Utilities.unzip(a.copyBlob()).forEach(b => {
          const nb = b.getName().toLowerCase();
          if (nb.endsWith('.xml')) xmls.push(b); else if (nb.endsWith('.pdf')) pdfs.push(b);
        });
      } catch (e) { }
    }
  });
  let n = 0;
  xmls.forEach(x => {
    const f = leerCfdi(x.getDataAsString('UTF-8'));
    if (!f) return;                                   // no es una factura timbrada
    f.correo = { asunto: m.getSubject(), de: m.getFrom(), fecha: m.getDate().toISOString() };
    f.sat = estadoSat(f);
    const r = rpc('via_buzon_factura', { p_llave: LLAVE, p_f: f });
    if (!r.nuevo && r.drive) return;                  // ya estaba guardada
    const pdf = elegirPdf(pdfs, xmls, x, f.uuid);
    const drive = guardar(r.carpeta, nombreBase(f), x, pdf);
    rpc('via_buzon_archivos', { p_llave: LLAVE, p_uuid: f.uuid, p_drive: drive });
    n++;
  });
  return n;
}

/* Lee el CFDI por nombres locales (sirve para 3.3 y 4.0). */
function leerCfdi(texto) {
  let doc;
  try { doc = XmlService.parse(String(texto).replace(/^﻿/, '')); } catch (e) { return null; }
  const raiz = doc.getRootElement();
  if (raiz.getName() !== 'Comprobante') return null;
  const hijo = (el, nombre) => el ? (el.getChildren().filter(c => c.getName() === nombre)[0] || null) : null;
  const hijos = (el, nombre) => el ? el.getChildren().filter(c => c.getName() === nombre) : [];
  const at = (el, n) => { if (!el) return null; const a = el.getAttribute(n); return a ? a.getValue() : null; };
  const num = v => v == null || v === '' ? 0 : Number(v);

  const em = hijo(raiz, 'Emisor'), re = hijo(raiz, 'Receptor');
  const tfd = hijo(hijo(raiz, 'Complemento'), 'TimbreFiscalDigital');
  if (!tfd || !at(tfd, 'UUID')) return null;

  let iva = 0;
  hijos(hijo(hijo(raiz, 'Impuestos'), 'Traslados'), 'Traslado').forEach(t => {
    if (at(t, 'Impuesto') === '002') iva += num(at(t, 'Importe'));
  });
  const fecha = at(raiz, 'Fecha') || '';
  return {
    uuid: at(tfd, 'UUID').toUpperCase(),
    version: at(raiz, 'Version') || at(raiz, 'version'),
    tipo: at(raiz, 'TipoDeComprobante'),
    fecha: fecha.slice(0, 10), fecha_hora: fecha,
    timbrado: at(tfd, 'FechaTimbrado'),
    serie: at(raiz, 'Serie'), folio: at(raiz, 'Folio'),
    emisor_rfc: at(em, 'Rfc'), emisor_nombre: at(em, 'Nombre'), emisor_regimen: at(em, 'RegimenFiscal'),
    receptor_rfc: at(re, 'Rfc'), receptor_nombre: at(re, 'Nombre'),
    receptor_cp: at(re, 'DomicilioFiscalReceptor'), receptor_regimen: at(re, 'RegimenFiscalReceptor'),
    uso: at(re, 'UsoCFDI'),
    subtotal: num(at(raiz, 'SubTotal')), descuento: num(at(raiz, 'Descuento')),
    iva: Math.round(iva * 100) / 100, total: num(at(raiz, 'Total')),
    moneda: at(raiz, 'Moneda'), forma_pago: at(raiz, 'FormaPago'), metodo_pago: at(raiz, 'MetodoPago'),
    conceptos: hijos(hijo(raiz, 'Conceptos'), 'Concepto').slice(0, 3).map(c => at(c, 'Descripcion')),
  };
}

/* Pregunta al SAT si la factura existe y está vigente. */
function estadoSat(f) {
  try {
    const expr = '?re=' + f.emisor_rfc + '&rr=' + f.receptor_rfc + '&tt=' + Number(f.total).toFixed(6) + '&id=' + f.uuid;
    const sobre = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">' +
      '<soapenv:Header/><soapenv:Body><tem:Consulta><tem:expresionImpresa><![CDATA[' + expr + ']]></tem:expresionImpresa>' +
      '</tem:Consulta></soapenv:Body></soapenv:Envelope>';
    const r = UrlFetchApp.fetch('https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc', {
      method: 'post', contentType: 'text/xml; charset=utf-8', payload: sobre, muteHttpExceptions: true,
      headers: { SOAPAction: 'http://tempuri.org/IConsultaCFDIService/Consulta' },
    });
    const m = r.getContentText().match(/<a:Estado>([^<]*)<\/a:Estado>/);
    return m ? { estado: m[1], revisado: new Date().toISOString() } : null;
  } catch (e) { return null; }
}

function elegirPdf(pdfs, xmls, x, uuid) {
  if (!pdfs.length) return null;
  const base = s => s.getName().toLowerCase().replace(/\.[^.]+$/, '');
  return pdfs.filter(p => base(p) === base(x))[0]
    || pdfs.filter(p => p.getName().toUpperCase().indexOf(uuid) >= 0)[0]
    || (pdfs.length === 1 && xmls.length === 1 ? pdfs[0] : null);
}

/* 2026-11-08_Farmacia-Guadalajara_UUID */
function nombreBase(f) {
  const corto = String(f.emisor_nombre || f.emisor_rfc || 'Comercio')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(S\.?\s?A\.?\s?P?\.?\s?I?\.?\s?(DE\s)?C\.?\s?V\.?|S\.?\s?DE\s?R\.?\s?L\.?(\s?DE\s?C\.?\s?V\.?)?|S\.?\s?C\.?|A\.?\s?C\.?)\s*$/i, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return f.fecha + '_' + (corto || 'Comercio') + '_' + f.uuid;
}

function carpetaRaiz() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('raiz');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  const it = DriveApp.getRootFolder().getFoldersByName(CARPETA_RAIZ);
  const c = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(CARPETA_RAIZ);
  props.setProperty('raiz', c.getId());
  return c;
}

function subcarpeta(nombre) {
  const raiz = carpetaRaiz();
  const it = raiz.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : raiz.createFolder(nombre);
}

function guardar(carpeta, base, xml, pdf) {
  const c = subcarpeta(carpeta);
  const ficha = a => ({ id: a.getId(), url: a.getUrl(), nombre: a.getName() });
  const fx = c.createFile(xml.copyBlob().setName(base + '.xml'));
  const fp = pdf ? c.createFile(pdf.copyBlob().setName(base + '.pdf')) : null;
  return { carpeta: carpeta, carpeta_url: c.getUrl(), xml: ficha(fx), pdf: fp ? ficha(fp) : null };
}

/* Mueve los archivos de las facturas que cambiaron de viaje. */
function acomodar() {
  (rpc('via_buzon_pendientes', { p_llave: LLAVE }) || []).forEach(p => {
    const c = subcarpeta(p.carpeta);
    ['xml', 'pdf'].forEach(k => {
      if (p.drive && p.drive[k]) { try { DriveApp.getFileById(p.drive[k].id).moveTo(c); } catch (e) { } }
    });
    const drive = Object.assign({}, p.drive, { carpeta: p.carpeta, carpeta_url: c.getUrl() });
    rpc('via_buzon_archivos', { p_llave: LLAVE, p_uuid: p.uuid, p_drive: drive });
  });
}

function rpc(funcion, args) {
  const r = UrlFetchApp.fetch(BASE + funcion, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(args), muteHttpExceptions: true,
    headers: { apikey: PUBLICABLE, Authorization: 'Bearer ' + PUBLICABLE },
  });
  const t = r.getContentText();
  if (r.getResponseCode() >= 300) {
    let msg = t; try { msg = JSON.parse(t).message || t; } catch (e) { }
    throw new Error(msg);
  }
  return t ? JSON.parse(t) : null;
}
