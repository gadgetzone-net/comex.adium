/* Operaciones locales del portal. No ejecuta movimientos en QAD. */
(function (root) {
  "use strict";

  const TYPES = Object.freeze(["Rack", "Estantes", "Transito", "Camara fria", "Frezeer"]);
  const DECIMAL_SCALE = 1000000000n;
  const FIELDS = Object.freeze(["producto", "lote", "unidad", "estado", "referencia"]);

  function key(value) {
    return String(value || "").trim().toUpperCase();
  }

  // Todas las comparaciones y restas usan enteros con nueve decimales.
  // Esto evita que, por ejemplo, 0.3 - 0.1 deje un saldo distinto de 0.2.
  function cantidad(value) {
    if (value === null || value === undefined || value === "" || value === false) return 0n;
    if (typeof value !== "number" && typeof value !== "string") {
      throw new Error("La cantidad debe ser un número válido.");
    }
    const raw = String(value).trim();
    const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(raw);
    if (!match || raw.length > 400) throw new Error("La cantidad debe ser un número válido.");
    const exponent = Number(match[5] || 0);
    if (!Number.isFinite(Number(raw)) || !Number.isSafeInteger(exponent) || Math.abs(exponent) > 400) {
      throw new Error("La cantidad debe ser un número válido.");
    }
    const fraction = match[3] || match[4] || "";
    const digits = BigInt((match[2] || "0") + fraction);
    const shift = 9 + exponent - fraction.length;
    let scaled;
    if (shift >= 0) {
      scaled = digits * (10n ** BigInt(shift));
    } else {
      const divisor = 10n ** BigInt(-shift);
      // Redondeo simétrico al noveno decimal.
      scaled = (digits + divisor / 2n) / divisor;
    }
    return match[1] === "-" ? -scaled : scaled;
  }

  function numero(value) {
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const integer = absolute / DECIMAL_SCALE;
    const fraction = String(absolute % DECIMAL_SCALE).padStart(9, "0");
    const result = Number(`${negative ? "-" : ""}${integer}.${fraction}`);
    if (!Number.isFinite(result)) throw new Error("La cantidad debe ser un número válido.");
    return result;
  }

  function texto(request, field, required = true) {
    const value = String(request[field] === undefined ? "" : request[field]).trim();
    if ((required && !value) || value.length > 150) throw new Error(`Revisá el campo ${field}.`);
    return value;
  }

  function sameSlot(row, location, subdivision) {
    return key(row.ubicacion) === location && key(row.sub) === subdivision;
  }

  function cleanSlot(row) {
    return {
      ...row, producto: "", descripcion: "", lote: "", referencia: "", estado: "",
      stock: 0, bultos: 0, porcentaje: 0, unidad: "", ocupacion: "LIBRE"
    };
  }

  function sameValue(left, right) {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (Array.isArray(left)) {
      return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
    }
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(field =>
      Object.prototype.hasOwnProperty.call(right, field) && sameValue(left[field], right[field])
    );
  }

  function clone(value) {
    return typeof root.structuredClone === "function" ? root.structuredClone(value) : JSON.parse(JSON.stringify(value));
  }

  function identifier() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    // getRandomValues también está disponible en contextos donde randomUUID no lo está.
    if (!root.crypto || typeof root.crypto.getRandomValues !== "function") {
      throw new Error("El navegador no permite generar un identificador. Usá una versión actual de Edge, Chrome o Firefox.");
    }
    const bytes = new Uint8Array(16);
    root.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function dateParts() {
    const now = new Date();
    const pad = value => String(value).padStart(2, "0");
    return {
      iso: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      display: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    };
  }

  function aplicar(source, request) {
    if (!source || !Array.isArray(source.inventario) || !Array.isArray(source.ubicaciones) || !source.meta || typeof source.meta !== "object") {
      throw new Error("Los datos del portal no son válidos. Volvé a cargarlos antes de operar.");
    }
    if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Solicitud no válida.");
    const action = request.accion;

    if (action === "guardar_pendiente") {
      const proposal = { ...clone(request), accion: "trasladar", verificado: true };
      aplicar(clone(source), proposal);
      proposal.verificado = false;
      const pending = { id: identifier(), fecha: dateParts().iso, estado: "Pendiente", solicitud: proposal };
      if (!source.meta.traslados_pendientes) source.meta.traslados_pendientes = [];
      source.meta.traslados_pendientes.push(pending);
      return pending;
    }

    if (action === "confirmar_pendiente" || action === "cancelar_pendiente") {
      const pending = (source.meta.traslados_pendientes || []).find(item => item.id === request.id);
      if (!pending || pending.estado !== "Pendiente") {
        throw new Error("El traslado ya fue procesado o no existe. Actualizá la pantalla.");
      }
      if (action === "cancelar_pendiente") {
        pending.estado = "Cancelado";
        pending.procesado = dateParts().iso;
        return pending;
      }
      const proposal = { ...pending.solicitud, verificado: request.verificado === true };
      const event = aplicar(source, proposal);
      event.pendiente_id = pending.id;
      pending.estado = "Confirmado";
      pending.procesado = dateParts().iso;
      return event;
    }

    const actor = texto(request, "responsable");
    const note = texto(request, "observacion", false);
    const event = { id: identifier(), fecha: dateParts().iso, accion: action, responsable: actor, observacion: note };

    if (action === "crear") {
      const location = texto(request, "ubicacion").toUpperCase();
      const subdivision = texto(request, "sub", false).toUpperCase();
      const sector = texto(request, "sector").toUpperCase();
      const kind = request.tipo;
      if (!TYPES.includes(kind)) throw new Error("Seleccioná el tipo de ubicación.");
      if (source.ubicaciones.some(row => sameSlot(row, location, subdivision))) {
        throw new Error("Esa ubicación y subdivisión ya existen.");
      }
      if (source.inventario.some(row => key(row.ubicacion) === location && cantidad(row.stock) !== 0n)) {
        throw new Error("El inventario ya contiene stock en ese código. Revisá sus subdivisiones antes de crear una posición.");
      }
      source.ubicaciones.push(cleanSlot({ ubicacion: location, sub: subdivision, sector, tipo: kind, origen: "Alta local" }));
      Object.assign(event, { destino: location, sub: subdivision, sector, tipo: kind, producto: "", lote: "", cantidad: 0, unidad: "", origen: "" });
    } else if (action === "trasladar") {
      const matches = source.inventario.filter(row => sameValue(row, request.registro));
      if (matches.length !== 1) {
        throw new Error("El registro cambió o está duplicado. Actualizá la pantalla y seleccioná nuevamente el origen.");
      }
      const record = matches[0];
      const amount = cantidad(request.cantidad);
      const stock = cantidad(record.stock);
      const assigned = cantidad(record.asignado);
      if (amount <= 0n || amount > stock - (assigned > 0n ? assigned : 0n)) {
        throw new Error("La cantidad debe ser positiva y no superar el stock disponible sin asignar.");
      }
      const destination = key(texto(request, "destino"));
      const subdivision = key(texto(request, "sub", false));
      if (destination === key(record.ubicacion)) throw new Error("Elegí una ubicación diferente al origen.");
      const destinations = source.ubicaciones.filter(row => sameSlot(row, destination, subdivision));
      if (destinations.length !== 1) throw new Error("La posición de destino no existe o tiene registros duplicados.");
      const dest = destinations[0];
      if (key(dest.producto) || key(dest.lote) || cantidad(dest.stock) !== 0n || !["", "LIB", "LIBRE"].includes(key(dest.ocupacion))) {
        throw new Error("El destino debe ser una posición vacía. Seleccioná otra posición.");
      }
      if (source.inventario.some(row => key(row.ubicacion) === destination && cantidad(row.stock) !== 0n)) {
        throw new Error("El inventario indica stock en el destino. Revisá la diferencia antes de trasladar.");
      }
      const kind = dest.tipo || request.tipo;
      if (!TYPES.includes(kind)) throw new Error("Indicá el tipo de la ubicación de destino.");
      if (request.verificado !== true) {
        throw new Error("Confirmá que verificaste físicamente el destino y sus condiciones de almacenamiento.");
      }
      const sourceSlots = source.ubicaciones.filter(row =>
        sameSlot(row, key(record.ubicacion), key(record.sub)) && FIELDS.every(field => key(row[field]) === key(record[field]))
      );
      const related = source.ubicaciones.filter(row => key(row.ubicacion) === key(record.ubicacion) &&
        key(row.producto) === key(record.producto) && key(row.lote) === key(record.lote) && cantidad(row.stock) !== 0n
      );
      if (related.some(row => !sourceSlots.includes(row))) {
        throw new Error("El origen tiene diferencias de estado, unidad, referencia o subdivisión entre archivos. Revisá los datos antes de trasladar.");
      }
      if (!sourceSlots.length && key(record.tipo) !== "TRANSITO") {
        throw new Error("No se encontró el saldo de origen en ubicaciones. Actualizá los archivos antes de trasladar desde ese sector.");
      }
      if (sourceSlots.length && sourceSlots.reduce((total, row) => total + cantidad(row.stock), 0n) !== stock) {
        throw new Error("El saldo de origen difiere entre inventario y ubicaciones. Actualizá los Excel antes de trasladar.");
      }

      let remaining = amount;
      for (const row of sourceSlots) {
        const rowStock = cantidad(row.stock);
        const deduct = rowStock < remaining ? rowStock : remaining;
        row.stock = numero(rowStock - deduct);
        remaining -= deduct;
        Object.assign(row, { bultos: 0, porcentaje: 0, ocupacion: "OCUPADA" });
        if (row.stock === 0) Object.assign(row, cleanSlot(row));
      }
      const moved = { ...record, ubicacion: destination, sub: subdivision, tipo: kind, stock: numero(amount), asignado: 0 };
      record.stock = numero(stock - amount);
      source.inventario.push(moved);
      for (const field of [...FIELDS, "descripcion"]) dest[field] = moved[field] === undefined ? "" : moved[field];
      Object.assign(dest, { stock: numero(amount), ocupacion: "OCUPADA", tipo: kind, bultos: 0, porcentaje: 0, origen: "Traslado local" });
      Object.assign(event, {
        producto: record.producto, lote: record.lote || "", unidad: record.unidad || "",
        cantidad: numero(amount), origen: record.ubicacion, destino: destination, sub: subdivision
      });
    } else {
      throw new Error("Operación desconocida.");
    }

    if (!source.meta.movimientos) source.meta.movimientos = [];
    source.meta.movimientos.push(event);
    source.meta.actualizado = dateParts().display;
    return event;
  }

  root.PortalOperaciones = Object.freeze({ aplicar });
})(window);
