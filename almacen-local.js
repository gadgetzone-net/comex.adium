'use strict';
// Datos del navegador. No se envían archivos ni solicitudes a un servidor.
window.PortalStore = (() => {
  const empty = () => ({inventario: [], ubicaciones: [], equivalencias: [], meta: {}});
  const databaseName = 'adium-logistica-html-v1:' + location.pathname.replace(/[^/]*$/, '');
  let databasePromise;
  const pending = new Map();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(databaseName) : null;
  if (channel) channel.onmessage = () => window.dispatchEvent(new Event('portal-cambio-externo'));
  function open() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('datos');
      request.onerror = () => reject(Error('No se puede guardar en este navegador. Habilitá el almacenamiento local.'));
      request.onblocked = () => reject(Error('Cerrá las otras pestañas del portal y volvé a abrirlo.'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
    return databasePromise;
  }
  async function snapshot(key = 'actual') {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('datos', 'readonly'), req = tx.objectStore('datos').get(key);
      req.onsuccess = () => resolve(req.result || (key === 'actual' ? {revision: 0, data: empty()} : null));
      req.onerror = () => reject(req.error);
    });
  }
  async function update(mutator) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('datos', 'readwrite'), store = tx.objectStore('datos');
      let result, error;
      const req = store.get('actual');
      req.onsuccess = () => {
        try {
          const old = req.result || {revision: 0, data: empty()};
          const next = structuredClone(old.data);
          result = mutator(next, old.revision);
          store.put(old, 'anterior');
          store.put({revision: old.revision + 1, data: next}, 'actual');
        } catch (e) { error = e; tx.abort(); }
      };
      tx.oncomplete = () => { channel?.postMessage('actualizado'); resolve(result); };
      tx.onabort = tx.onerror = () => reject(error || tx.error || Error('No se pudo guardar. Descargá un respaldo y revisá el espacio del navegador.'));
    });
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  async function request(path, options = {}) {
    try {
      if (path === '/api/datos' && !options.method) return json((await snapshot()).data);
      const body = JSON.parse(options.body || '{}');
      if (options.method !== 'POST') throw Error('Acción no disponible.');
      if (path === '/api/excel/validar') {
        for (const [id, item] of pending) if (item.expires < Date.now()) pending.delete(id);
        if (!String(body.nombre || '').toLowerCase().endsWith('.xlsx')) throw Error('Seleccioná un archivo .xlsx.');
        const revision = (await snapshot()).revision;
        const {rows, sheet} = await PortalExcel.parse(body.archivo, body.tipo);
        const token = crypto.randomUUID();
        if (pending.size >= 5) pending.delete(pending.keys().next().value);
        pending.set(token, {rows, sheet, kind: body.tipo, name: body.nombre, revision, expires: Date.now() + 900000});
        return json({token, registros: rows.length, hoja: sheet, muestra: rows.slice(0, 3)});
      }
      if (path === '/api/excel/confirmar') {
        const item = pending.get(body.token);
        if (!item || item.expires < Date.now()) throw Error('La vista previa venció. Validá nuevamente el archivo.');
        const result = await update((data, revision) => {
          if (revision !== item.revision) throw Error('Los datos cambiaron desde la vista previa. Validá nuevamente el archivo.');
          PortalExcel.merge(data, item.kind, structuredClone(item.rows));
          data.meta[item.kind] = item.name + ' / ' + item.sheet;
          data.meta.actualizado = new Date().toLocaleString('es-PY');
          return {registros: item.rows.length, respaldo: 'estado anterior en este navegador', actualizado: data.meta.actualizado};
        });
        pending.delete(body.token);
        return json(result);
      }
      if (path === '/api/operaciones') {
        const movimiento = await update(data => PortalOperaciones.aplicar(data, body));
        return json({movimiento, respaldo: 'estado anterior en este navegador'});
      }
      throw Error('Acción no disponible.');
    } catch (error) { return json({error: error.message}, 400); }
  }
  function validateBackup(value) {
    const obj = value?.formato === 'adium-logistica-v1' ? value.datos : value;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw Error('Respaldo JSON no válido.');
    const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
    function inspect(item, depth = 0) {
      if (depth > 12) throw Error('El respaldo tiene una estructura no válida.');
      if (typeof item === 'number' && !Number.isFinite(item)) throw Error('El respaldo contiene un número no válido.');
      if (item && typeof item === 'object') for (const [k,v] of Object.entries(item)) {
        if (forbidden.has(k)) throw Error('El respaldo contiene una propiedad no permitida.');
        inspect(v, depth + 1);
      }
    }
    inspect(obj);
    for (const key of ['inventario','ubicaciones','equivalencias']) {
      if (key === 'equivalencias' && obj[key] == null) continue;
      if (!Array.isArray(obj[key]) || obj[key].length > 200000) throw Error('Lista de '+key+' no válida.');
      for (const row of obj[key]) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Registro no válido en '+key+'.');
        for (const value of Object.values(row)) if (value != null && !['string','number','boolean'].includes(typeof value)) throw Error('Campo no válido en '+key+'.');
        const identity = key === 'ubicaciones' ? row.ubicacion : row.producto;
        if (typeof identity !== 'string' || !identity.trim()) throw Error('Falta código de producto o ubicación.');
        for (const field of ['stock','asignado','maestro','bultos','porcentaje','largo','ancho','alto','palletBultos','bultoUnidades']) {
          if (row[field] != null && row[field] !== '' && !Number.isFinite(Number(row[field]))) throw Error('Número no válido en '+field+'.');
        }
      }
    }
    const meta = obj.meta || {};
    if (typeof meta !== 'object' || Array.isArray(meta)) throw Error('Metadatos no válidos.');
    for (const key of ['actualizado','generado','inventario','ubicaciones','equivalencias']) if (meta[key] != null && typeof meta[key] !== 'string') throw Error('Metadatos no válidos.');
    for (const key of ['movimientos','traslados_pendientes']) {
      if (meta[key] == null) continue;
      if (!Array.isArray(meta[key])) throw Error('Historial no válido.');
      for (const event of meta[key]) {
        if (!event || typeof event.id !== 'string' || typeof event.fecha !== 'string') throw Error('Evento de historial no válido.');
        if (key === 'traslados_pendientes' && (!['Pendiente','Confirmado','Cancelado'].includes(event.estado) || !event.solicitud?.registro || typeof event.solicitud.destino !== 'string')) throw Error('Pendiente no válido.');
      }
    }
    const result = {inventario: obj.inventario, ubicaciones: obj.ubicaciones, meta};
    if (obj.equivalencias) result.equivalencias = obj.equivalencias;
    return structuredClone(result);
  }
  return {request,
    read: async () => (await snapshot()).data,
    previous: async () => (await snapshot('anterior'))?.data,
    restore: async value => {const imported = validateBackup(value); return update(data => {for (const k of Object.keys(data)) delete data[k]; Object.assign(data, imported);});},
    validateBackup
  };
})();
