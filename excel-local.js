'use strict';

// Local Excel import. File contents stay in the browser; this module makes no requests.
(function (global) {
  const MAX_COMPRESSED = 25 * 1024 * 1024;
  const MAX_EXPANDED = 200 * 1024 * 1024;
  const MAPS = {
    inventario: {
      producto: 'Número de Producto', descripcion: 'Descripcion', unidad: 'Unidad de medida',
      stock: 'Cant Exis - Detalle Inv', maestro: 'Cant Exis - Mstro Inv', asignado: 'Cantidad Asignada',
      ubicacion: 'Ubicac', tipo: 'Tipo de ubicación', lote: 'Lote/Serie', referencia: 'Referencia',
      vencimiento: 'Fecha Vencimiento', meses: 'Meses', estado: 'Estado', planta: 'Planta'
    },
    equivalencias: {
      producto: 'Número de Producto', descripcion: 'Descripcion', unidad: 'Unidad de medida',
      largo: 'Largo del bulto', ancho: 'Ancho del bulto', alto: 'Alto del bulto',
      palletBultos: 'Bulto x Palet', bultoUnidades: 'Cantidad x bulto'
    },
    ubicaciones: {
      ubicacion: 'Ubica', sub: 'Sub división', ocupacion: 'Estad', estado: 'Estad',
      sector: 'Secto', producto: 'Prod', lote: 'Lote', referencia: 'Ref', bultos: 'Bulto',
      stock: 'Stock', unidad: 'U. Me', porcentaje: 'Porc.', descripcion: 'Desc'
    }
  };
  const NUMBERS = new Set([
    'stock', 'maestro', 'asignado', 'bultos', 'porcentaje', 'largo', 'ancho', 'alto',
    'palletBultos', 'bultoUnidades'
  ]);
  const EQ = ['largo', 'ancho', 'alto', 'palletBultos', 'bultoUnidades'];
  const PREFERRED = {
    inventario: ['Datos', 'RESUMEN'], ubicaciones: ['TOTAL', 'TOTAL (2)'], equivalencias: ['Fusion de datos']
  };
  const REQUIRED = {
    inventario: ['producto', 'stock', 'ubicacion', 'lote', 'unidad'],
    ubicaciones: ['ubicacion', 'producto', 'stock', 'unidad'],
    equivalencias: ['producto', 'palletBultos', 'bultoUnidades']
  };

  const normalize = value => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const product = value => String(value ?? '').trim().toUpperCase().replace(/^0+/, '') || '0';
  const blank = value => value === undefined || value === null || value === '';

  function assertKind(kind) {
    if (!Object.prototype.hasOwnProperty.call(MAPS, kind)) throw Error('Seleccioná un tipo de carga válido.');
  }

  function decodeBase64(base64) {
    if (typeof base64 !== 'string' || !base64.length || base64.length > 4 * Math.ceil(MAX_COMPRESSED / 3)) {
      throw Error('Seleccioná un archivo .xlsx de hasta 25 MB.');
    }
    let binary;
    try { binary = global.atob(base64); } catch (_) { throw Error('No se pudo leer el archivo Excel.'); }
    if (binary.length > MAX_COMPRESSED) throw Error('El archivo supera los 25 MB.');
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function validateZip(bytes) {
    // Inspect ZIP directory before SheetJS decompresses the workbook.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) throw Error('El archivo no es un .xlsx válido.');
    let end = -1;
    for (let position = bytes.length - 22; position >= Math.max(0, bytes.length - 65557); position--) {
      if (view.getUint32(position, true) === 0x06054b50 && position + 22 + view.getUint16(position + 20, true) === bytes.length) {
        end = position;
        break;
      }
    }
    if (end < 0) throw Error('El archivo Excel está incompleto o dañado.');
    const entries = view.getUint16(end + 10, true);
    const directorySize = view.getUint32(end + 12, true);
    let cursor = view.getUint32(end + 16, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) ||
        entries !== view.getUint16(end + 8, true) || entries === 0xffff ||
        directorySize === 0xffffffff || cursor === 0xffffffff || cursor + directorySize !== end) {
      throw Error('Usá una copia .xlsx normal, sin cifrado ni formato ZIP64.');
    }
    const directoryEnd = cursor + directorySize;
    let expanded = 0, workbook = false, contentTypes = false;
    for (let index = 0; index < entries; index++) {
      if (cursor + 46 > directoryEnd || view.getUint32(cursor, true) !== 0x02014b50) throw Error('El archivo Excel está dañado.');
      const flags = view.getUint16(cursor + 8, true);
      const size = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      if (flags & 1 || size === 0xffffffff) throw Error('Usá una copia .xlsx sin cifrado ni formato ZIP64.');
      if (next > directoryEnd) throw Error('El archivo Excel está incompleto.');
      expanded += size;
      if (expanded > MAX_EXPANDED) throw Error('El Excel supera los 200 MB al descomprimirlo.');
      const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      workbook ||= name === 'xl/workbook.xml';
      contentTypes ||= name === '[Content_Types].xml';
      cursor = next;
    }
    if (cursor !== directoryEnd || !workbook || !contentTypes) throw Error('El archivo no contiene un libro .xlsx válido.');
  }

  function numericValue(value, line, key) {
    if (blank(value)) return 0;
    // A decimal comma or thousands separator is not guessed; numeric Excel cells are accepted directly.
    if (typeof value !== 'number' && (typeof value !== 'string' ||
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) {
      throw Error(`Fila ${line}, ${key}: se esperaba un número.`);
    }
    const number = Number(value);
    if (!Number.isFinite(number)) throw Error(`Fila ${line}, ${key}: se esperaba un número finito.`);
    return number;
  }

  function textValue(cell) {
    if (!cell || blank(cell.v)) return '';
    const value = cell.v;
    if (typeof value === 'number' && Number.isInteger(value)) {
      const raw = String(value);
      if (/^0+$/.test(cell.z || '') && value >= 0) return raw.padStart(cell.z.length, '0');
      return raw;
    }
    return String(value).trim();
  }

  function uniqueEquivalences(rows) {
    const unique = new Map();
    for (const row of rows) {
      const code = product(row.producto);
      if (unique.has(code) && EQ.some(key => unique.get(code)[key] !== row[key])) {
        throw Error(`El producto ${row.producto} tiene equivalencias contradictorias.`);
      }
      unique.set(code, row);
    }
    return [...unique.values()];
  }

  function parse(base64, kind) {
    assertKind(kind);
    const xlsx = global.XLSX;
    if (!xlsx?.read || !xlsx?.utils) throw Error('No se pudo cargar la biblioteca de Excel. Recargá el portal.');
    const bytes = decodeBase64(base64);
    validateZip(bytes);
    let book;
    try {
      book = xlsx.read(bytes, { type: 'array', cellNF: true, cellDates: false, cellFormula: true, cellHTML: false });
    } catch (_) {
      throw Error('No se pudo abrir el Excel. Guardá una copia .xlsx sin contraseña e intentá nuevamente.');
    }
    const preferred = PREFERRED[kind];
    const priority = name => preferred.includes(name) ? preferred.indexOf(name) : preferred.length;
    const ordered = [...book.SheetNames].sort((left, right) => priority(left) - priority(right));
    const candidates = [];
    for (const name of ordered) {
      const sheet = book.Sheets[name];
      if (!sheet?.['!ref']) continue;
      const range = xlsx.utils.decode_range(sheet['!ref']);
      if (range.e.r > 1048575 || range.e.c > 16383 || range.s.r < 0 || range.s.c < 0) {
        throw Error('El Excel declara un rango de celdas no válido. Guardá una copia y volvé a intentar.');
      }
      for (let rowIndex = 0; rowIndex < 10 && rowIndex <= range.e.r; rowIndex++) {
        const headers = [];
        for (let column = 0; column <= range.e.c; column++) {
          headers.push(normalize(sheet[xlsx.utils.encode_cell({ r: rowIndex, c: column })]?.v));
        }
        const mapping = {};
        for (const [key, alias] of Object.entries(MAPS[kind])) {
          let matches = headers.map((header, index) => header === normalize(alias) || header === normalize(key) ? index : -1).filter(index => index >= 0);
          if (key === 'sub' && !matches.length) matches = headers.map((header, index) => header === 'sub d' ? index : -1).filter(index => index >= 0);
          if (matches.length) mapping[key] = kind === 'ubicaciones' && key === 'estado' ? matches[matches.length - 1] : matches[0];
        }
        if (REQUIRED[kind].every(key => Object.prototype.hasOwnProperty.call(mapping, key))) {
          candidates.push({ sheet, name, header: rowIndex, range, mapping });
          break;
        }
      }
    }
    if (!candidates.length) throw Error('No se encontraron las columnas necesarias para ' + kind + '. Usá el formato del archivo original.');
    const preferredCandidates = candidates.filter(candidate => preferred.includes(candidate.name));
    if (!preferredCandidates.length && candidates.length > 1) {
      throw Error('Hay varias hojas compatibles. Usá una copia con una sola hoja de datos para evitar duplicaciones.');
    }
    const chosen = (preferredCandidates.length ? preferredCandidates : candidates)[0];
    const { sheet, mapping } = chosen;
    const identity = kind === 'ubicaciones' ? 'ubicacion' : 'producto';
    let rows = [];
    for (let rowIndex = chosen.header + 1; rowIndex <= chosen.range.e.r; rowIndex++) {
      const line = rowIndex + 1;
      const getCell = key => Object.prototype.hasOwnProperty.call(mapping, key)
        ? sheet[xlsx.utils.encode_cell({ r: rowIndex, c: mapping[key] })] : undefined;
      const identityCell = getCell(identity);
      if (!identityCell || blank(identityCell.v) || String(identityCell.v).trim() === '') {
        if (REQUIRED[kind].some(key => !blank(getCell(key)?.v))) throw Error(`Fila ${line}: falta ${identity}.`);
        continue;
      }
      const record = {};
      for (const key of Object.keys(MAPS[kind])) {
        const cell = getCell(key);
        if (cell?.t === 'e') throw Error(`Fila ${line}, ${key}: contiene un error de Excel.`);
        if (cell?.f && blank(cell.v)) throw Error(`Fila ${line}, ${key}: la fórmula no tiene un resultado guardado. Recalculá y guardá el Excel.`);
        record[key] = NUMBERS.has(key) ? numericValue(cell?.v, line, key) : textValue(cell);
      }
      if (kind === 'ubicaciones') record.origen = chosen.name;
      rows.push(record);
    }
    if (!rows.length) throw Error('La hoja no contiene registros para importar.');
    if (kind === 'equivalencias') rows = uniqueEquivalences(rows);
    return { rows, sheet: chosen.name };
  }

  function merge(source, kind, rows) {
    assertKind(kind);
    if (!source || !Array.isArray(source.inventario) || !Array.isArray(rows) || !rows.length) {
      throw Error('No hay datos válidos para confirmar la carga.');
    }
    const incoming = rows.map(row => ({ ...row }));
    if (kind === 'equivalencias') {
      source.equivalencias = uniqueEquivalences(incoming);
      const matches = new Map(source.equivalencias.map(row => [product(row.producto), row]));
      for (const row of source.inventario) {
        const match = matches.get(product(row.producto));
        for (const key of EQ) row[key] = match?.[key] ?? 0;
      }
    } else if (kind === 'inventario') {
      const matches = new Map((source.equivalencias || source.inventario).map(row => [product(row.producto), row]));
      for (const row of incoming) {
        const match = matches.get(product(row.producto));
        for (const key of EQ) row[key] = match?.[key] ?? 0;
      }
      source.inventario = incoming;
    } else {
      source.ubicaciones = incoming;
    }
    return source;
  }

  global.PortalExcel = Object.freeze({ parse, merge });
})(window);
