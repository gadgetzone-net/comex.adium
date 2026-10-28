'use strict';
const gestion=document.createElement('section');gestion.id='gestionPanel';gestion.hidden=true;
const tiposHTML=['Rack','Estantes','Transito','Camara fria','Frezeer'].map(t=>`<option>${t}</option>`).join('');
gestion.innerHTML=`<div class="alarm-intro"><div><h3>Ubicaciones y movimientos</h3><p>Registrá posiciones nuevas y traslados en este navegador. No modifica QAD ni sincroniza otras computadoras.</p></div></div><div class="gestion-grid"><form id="crearUbicacion" class="panel"><h3>Nueva ubicación</h3><label class="upload-field">Código de ubicación<input name="ubicacion" required maxlength="150" placeholder="Ej.: 3RI25A01"></label><label class="upload-field">Subdivisión (opcional)<input name="sub" maxlength="150" placeholder="Ej.: A"></label><label class="upload-field">Sector<input name="sector" required maxlength="150" placeholder="Ej.: MP-APR" list="listaSectores"></label><datalist id="listaSectores"></datalist><label class="upload-field">Tipo<select name="tipo">${tiposHTML}</select></label><label class="upload-field">Responsable<input name="responsable" required maxlength="150"></label><label class="upload-field">Observación (opcional)<input name="observacion" maxlength="150"></label><button class="gestion-submit" type="submit">Crear ubicación vacía</button><p class="gestion-status" role="status"></p></form><form id="trasladarProducto" class="panel"><h3>Trasladar producto / lote</h3><label class="upload-field">Buscar origen<input id="movBuscar" placeholder="Producto, lote o ubicación" autocomplete="off"></label><label class="upload-field">Registro de origen<select id="movOrigen" required></select></label><p class="upload-note" id="movSaldo"></p><label class="upload-field">Cantidad a trasladar<input id="movCantidad" type="number" min="0.000001" step="any" required></label><label class="upload-field">Posición de destino vacía<input id="movDestino" list="listaDestinos" required placeholder="Código | subdivisión"></label><datalist id="listaDestinos"></datalist><label class="upload-field">Tipo de destino<select id="movTipo">${tiposHTML}</select></label><label class="upload-field">Responsable<input name="responsable" required maxlength="150"></label><label class="upload-field">Observación (opcional)<input name="observacion" maxlength="150"></label><label class="mov-check"><input id="movVerificado" type="checkbox">Verifiqué el destino físico, su capacidad y las condiciones de almacenamiento para este producto.</label><p class="upload-note">Se descuenta del origen y se registra en el destino. No se permite mover stock asignado ni trasladar a posiciones ocupadas.</p><button class="gestion-submit" type="submit">Revisar traslado</button><p class="gestion-status" role="status"></p></form></div><div class="alarm-legend"><strong>Últimos movimientos locales</strong></div><p class="upload-note">Una carga Excel reemplaza los saldos o ubicaciones seleccionados. Usá archivos que incluyan tus movimientos para no volver a un corte anterior.</p><div class="tableScroll"><table><thead><tr><th>Fecha</th><th>Operación</th><th>Producto / lote</th><th>Origen</th><th>Destino</th><th>Cantidad</th><th>Responsable</th><th>Observación</th></tr></thead><tbody id="movHistorial"></tbody></table></div>`;
document.querySelector('.workspace').append(gestion);
let destinosMov=new Map();
function buscarOrigen(){
 const q=norm(document.querySelector('#movBuscar').value),select=document.querySelector('#movOrigen');
 const rows=DB.inventario.map((r,i)=>({r,i})).filter(({r})=>num(r.stock)>Math.max(0,num(r.asignado))&&[r.producto,r.descripcion,r.lote,r.ubicacion].some(v=>norm(v).includes(q))).slice(0,100);
 select.innerHTML='<option value="">Seleccioná un registro (hasta 100 resultados)</option>'+rows.map(({r,i})=>`<option value="${i}">${escapeHTML([r.producto,r.lote||'Sin lote',r.ubicacion,fmt(r.stock)+' '+r.unidad].join(' · '))}</option>`).join('');actualizarSaldo();
}
function actualizarSaldo(){const selected=document.querySelector('#movOrigen').value,r=selected===''?null:DB.inventario[+selected];document.querySelector('#movSaldo').textContent=r?`${r.descripcion} · Disponible sin asignar: ${fmt(num(r.stock)-Math.max(0,num(r.asignado)))} ${r.unidad}`:'Buscá y seleccioná el producto y lote a trasladar.';document.querySelector('#movCantidad').value='';document.querySelector('#movVerificado').checked=false}
function refreshGestion(){
 buscarOrigen();destinosMov=new Map();const occupied=new Set(DB.inventario.filter(r=>num(r.stock)!==0).map(r=>String(r.ubicacion).trim().toUpperCase()));
 const groups=new Map();for(const r of DB.ubicaciones){const k=(String(r.ubicacion).trim().toUpperCase()+' | '+String(r.sub||'').trim().toUpperCase()).trim();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
 for(const [k,rows] of groups){const r=rows[0];if(rows.length===1&&!r.producto&&!r.lote&&num(r.stock)===0&&['','LIBRE','LIB'].includes(String(r.ocupacion||'').toUpperCase())&&!occupied.has(String(r.ubicacion).trim().toUpperCase()))destinosMov.set(k,r)}
 document.querySelector('#listaDestinos').innerHTML=[...destinosMov].map(([k,r])=>`<option value="${escapeHTML(k)}">${escapeHTML(r.sector)}</option>`).join('');
 document.querySelector('#listaSectores').innerHTML=[...new Set(DB.ubicaciones.map(r=>r.sector).filter(Boolean))].sort().map(s=>`<option value="${escapeHTML(s)}"></option>`).join('');
 document.querySelector('#movHistorial').innerHTML=[...(DB.meta?.movimientos||[])].reverse().slice(0,100).map(r=>'<tr>'+[r.fecha.replace('T',' '),r.accion==='crear'?'Nueva ubicación':'Traslado',[r.producto,r.lote].filter(Boolean).join(' / '),r.origen,r.destino+(r.sub?' / '+r.sub:''),r.accion==='crear'?'—':fmt(r.cantidad)+' '+r.unidad,r.responsable,r.observacion].map(v=>'<td>'+escapeHTML(v||'—')+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="8">Todavía no hay movimientos locales.</td></tr>';
}
document.querySelector('#movBuscar').oninput=buscarOrigen;document.querySelector('#movOrigen').onchange=actualizarSaldo;
document.querySelector('#movDestino').onchange=()=>{const r=destinosMov.get(document.querySelector('#movDestino').value.trim().toUpperCase());if(r?.tipo)document.querySelector('#movTipo').value=r.tipo;document.querySelector('#movVerificado').checked=false};
async function guardarOperacion(form,body){
 const status=form.querySelector('[role=status]');form.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);status.textContent='Guardando respaldo y operación…';
 try{await postExcel('/api/operaciones',body);status.textContent='Operación guardada correctamente. Se creó un respaldo.';const response=await PortalStore.request('/api/datos');if(!response.ok)throw Error('Se guardó la operación. Recargá la pantalla para ver los saldos.');DB=await response.json();form.reset();renderKPIs();actualizarFechaCarga();refreshGestion()}
 catch(e){status.textContent=e.message}finally{form.querySelectorAll('button,input,select').forEach(e=>e.disabled=false)}
}
document.querySelector('#crearUbicacion').onsubmit=e=>{e.preventDefault();guardarOperacion(e.target,{accion:'crear',...Object.fromEntries(new FormData(e.target))})};
document.querySelector('#trasladarProducto').onsubmit=e=>{
 e.preventDefault();const form=e.target,selected=document.querySelector('#movOrigen').value,dest=destinosMov.get(document.querySelector('#movDestino').value.trim().toUpperCase());
 if(selected===''||!dest){form.querySelector('[role=status]').textContent='Seleccioná un origen y un destino vacío de la lista.';return}
 revisarTraslado({accion:'guardar_pendiente',...Object.fromEntries(new FormData(form)),registro:DB.inventario[+selected],destino:dest.ubicacion,sub:dest.sub||'',tipo:document.querySelector('#movTipo').value,cantidad:document.querySelector('#movCantidad').value,verificado:document.querySelector('#movVerificado').checked});
};
const vistaAntesGestion=setView;
setView=function(v){gestion.hidden=v!=='gestion';if(v!=='gestion'){vistaAntesGestion(v);return}vistaAntesGestion('resumen');view='gestion';document.querySelector('#overview').hidden=true;document.querySelector('#dataArea').hidden=true;document.querySelector('#exportBtn').hidden=true;document.querySelector('#crumb').textContent='Gestión de depósito';document.querySelector('#pageTitle').textContent='Gestión de depósito';document.querySelector('#subtitle').textContent='Nuevas ubicaciones, traslados e historial local.';all('[data-view]').forEach(b=>{b.classList.toggle(b.closest('nav')?'active':'selected',b.dataset.view===v);if(b.closest('nav')){if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}});refreshGestion()};
document.querySelector('nav [data-view=gestion]').onclick=()=>setView('gestion');

// Review, persist a pending proposal, then explicitly confirm the physical move.
document.querySelector('#movVerificado').closest('label').hidden=true;
const pendientesPanel=document.createElement('section');pendientesPanel.className='pendientes-panel';
pendientesPanel.innerHTML='<h3>Traslados pendientes</h3><p class="upload-note">Guardados para revisar. Todavía no modifican saldos ni reservan posiciones.</p><div id="pendientesLista"></div>';
document.querySelector('.gestion-grid').after(pendientesPanel);
const revisarDialog=document.createElement('dialog');revisarDialog.id='revisarTraslado';
revisarDialog.innerHTML='<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><h4>REVISIÓN DEL TRASLADO</h4><h2 id="revisionTitulo"></h2><div id="revisionDetalle" class="detailGrid"></div><p id="revisionAyuda" class="upload-note"></p><label class="mov-check" id="revisionCheck"><input type="checkbox" id="revisionVerificado">Verifiqué físicamente el destino, su capacidad y sus condiciones de almacenamiento.</label><div class="upload-actions"><button type="button" id="revisionVolver">Volver</button><button type="button" id="revisionGuardar">Guardar pendiente</button><button type="button" id="revisionConfirmar">Confirmar traslado</button><button type="button" id="revisionCancelar">Cancelar pendiente</button></div><p id="revisionEstado" role="status" class="upload-note"></p>';
document.body.append(revisarDialog);
let propuestaActual=null,pendienteActual=null,revisionOcupada=false;
function revisarTraslado(proposal,pending=null){
 propuestaActual=structuredClone(proposal);pendienteActual=pending;
 const r=proposal.registro;
 document.querySelector('#revisionTitulo').textContent=pending?'Confirmar cambio de ubicación':'Revisar antes de guardar';
 const items=[['Producto',r.producto+' · '+r.descripcion],['Lote',r.lote||'Sin lote'],['Origen',r.ubicacion],['Destino',proposal.destino+(proposal.sub?' / '+proposal.sub:'')],['Cantidad',fmt(proposal.cantidad)+' '+r.unidad],['Saldo previsto en origen',fmt(num(r.stock)-num(proposal.cantidad))+' '+r.unidad],['Responsable',proposal.responsable],['Observación',proposal.observacion||'—']];
 document.querySelector('#revisionDetalle').innerHTML=items.map(([k,v])=>`<div class="detailCell"><span>${escapeHTML(k)}</span><strong>${escapeHTML(v)}</strong></div>`).join('');
 document.querySelector('#revisionAyuda').textContent=pending?'El traslado está guardado como pendiente. Al confirmar se vuelven a validar origen y destino y se actualizan los saldos. Si algo cambió, se rechaza y se conserva el pendiente.':'Guardar pendiente conserva esta propuesta para retomarla después. Los saldos no cambian hasta confirmar el traslado.';
 document.querySelector('#revisionGuardar').hidden=!!pending;document.querySelector('#revisionConfirmar').hidden=!pending;document.querySelector('#revisionCancelar').hidden=!pending;document.querySelector('#revisionCheck').hidden=!pending;document.querySelector('#revisionVerificado').checked=false;document.querySelector('#revisionEstado').textContent='';revisarDialog.showModal();
}
function renderPendientes(){
 const pending=(DB.meta?.traslados_pendientes||[]).filter(p=>p.estado==='Pendiente');
 document.querySelector('#pendientesLista').innerHTML=pending.map(p=>{const r=p.solicitud;return `<div class="pending-row"><div><strong>${escapeHTML(r.registro.producto)} · ${escapeHTML(r.registro.lote||'Sin lote')}</strong><p>${escapeHTML(r.registro.ubicacion)} → ${escapeHTML(r.destino)}${r.sub?' / '+escapeHTML(r.sub):''} · ${fmt(r.cantidad)} ${escapeHTML(r.registro.unidad)}</p><small>${escapeHTML(p.fecha.replace('T',' '))} · ${escapeHTML(r.responsable)}</small></div><button class="outline" data-pending="${escapeHTML(p.id)}">Revisar / confirmar</button></div>`}).join('')||'<p class="upload-note">No hay traslados pendientes.</p>';
 document.querySelectorAll('[data-pending]').forEach(button=>button.onclick=()=>{const p=pending.find(p=>p.id===button.dataset.pending);revisarTraslado(p.solicitud,p.id)});
}
const refreshGestionAnterior=refreshGestion;
refreshGestion=function(){refreshGestionAnterior();renderPendientes()};
document.querySelector('#revisionVolver').onclick=()=>revisarDialog.close();
revisarDialog.addEventListener('cancel',e=>{if(revisionOcupada)e.preventDefault()});
async function procesarRevision(action){
 const status=document.querySelector('#revisionEstado');
 if(action==='confirmar_pendiente'&&!document.querySelector('#revisionVerificado').checked){status.textContent='Confirmá la verificación del destino antes de registrar el traslado.';return}
 revisionOcupada=true;revisarDialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);status.textContent='Guardando…';
 try{
  const body=action==='guardar_pendiente'?{...propuestaActual,accion:action}:{accion:action,id:pendienteActual,verificado:document.querySelector('#revisionVerificado').checked};
  await postExcel('/api/operaciones',body);
  // Hide mutation actions once the server succeeds, even if the refresh fails.
  ['revisionGuardar','revisionConfirmar','revisionCancelar'].forEach(id=>document.querySelector('#'+id).hidden=true);
  const response=await PortalStore.request('/api/datos');if(!response.ok)throw Error('Se guardó la operación. Recargá la pantalla para ver el estado actualizado.');DB=await response.json();refreshGestion();renderKPIs();actualizarFechaCarga();
  status.textContent=action==='guardar_pendiente'?'Pendiente guardado. Podés cerrar esta ventana y retomarlo desde Traslados pendientes.':action==='confirmar_pendiente'?'Traslado confirmado. Los saldos de origen y destino fueron actualizados.':'Pendiente cancelado. Los saldos no cambiaron.';
  document.querySelector('#revisionCheck').hidden=true;
 }catch(e){status.textContent=e.message}finally{revisionOcupada=false;revisarDialog.querySelectorAll('button,input').forEach(el=>el.disabled=false)}
}
document.querySelector('#revisionGuardar').onclick=()=>procesarRevision('guardar_pendiente');
document.querySelector('#revisionConfirmar').onclick=()=>procesarRevision('confirmar_pendiente');
document.querySelector('#revisionCancelar').onclick=()=>procesarRevision('cancelar_pendiente');

function ubicarDesdeInventario(registro){
 const index=DB.inventario.indexOf(registro);
 if(index<0)return;
 if(document.querySelector('#detail').open)document.querySelector('#detail').close();
 setView('gestion');
 document.querySelector('#movBuscar').value=registro.producto;buscarOrigen();
 const select=document.querySelector('#movOrigen');
 if(![...select.options].some(o=>o.value===String(index))){const option=document.createElement('option');option.value=String(index);option.textContent=[registro.producto,registro.lote,registro.ubicacion].join(' · ');select.append(option)}
 select.value=String(index);actualizarSaldo();
 document.querySelector('#movCantidad').value=String(num(registro.stock)-Math.max(0,num(registro.asignado)));
 document.querySelector('#movDestino').value='';
 document.querySelector('#trasladarProducto [role=status]').textContent='Elegí una posición vacía de la lista y revisá el traslado. Se guardará como pendiente antes de confirmar.';
 document.querySelector('#trasladarProducto').scrollIntoView({block:'start',behavior:'smooth'});document.querySelector('#movDestino').focus({preventScroll:true});
}
function botonUbicar(registro){
 const button=document.createElement('button');button.type='button';button.className='outline inventory-move';button.textContent='Ubicar / trasladar';
 button.disabled=num(registro.stock)<=Math.max(0,num(registro.asignado));
 button.title=button.disabled?'Sin stock disponible para trasladar':'Elegir una ubicación vacía y preparar un traslado pendiente';
 button.onclick=event=>{event.stopPropagation();ubicarDesdeInventario(registro)};
 return button;
}
const dibujarAntesAcciones=draw;
draw=function(){
 dibujarAntesAcciones();if(view!=='inventario')return;
 const heading=document.createElement('th');heading.textContent='Acciones';heading.className='inventory-action';document.querySelector('#thead tr').append(heading);
 document.querySelectorAll('#tbody tr[data-i]').forEach(tr=>{const cell=document.createElement('td');cell.className='inventory-action';cell.append(botonUbicar(filtered[+tr.dataset.i]));tr.append(cell)});
};
const detalleAntesAcciones=detail;
detail=function(registro){detalleAntesAcciones(registro);if(view==='inventario'){const actions=document.createElement('div');actions.className='upload-actions';actions.append(botonUbicar(registro));document.querySelector('#detailContent').append(actions)}};
