'use strict';
// Suggestions use observed product/state sectors, never infer storage compatibility.
function calcularAlarmas(db,scope='transito',prefixes=['3RI','%RI']){
 const key=v=>String(v??'').trim().toUpperCase(),code=v=>key(v).replace(/^0+/,''),rack=u=>prefixes.some(p=>key(u).startsWith(p));
 const slots=new Map(),occupiedInventory=new Set(),sectors=new Map();
 for(const r of db.inventario){if(num(r.stock)>0)occupiedInventory.add(key(r.ubicacion))}
 for(const r of db.ubicaciones){
  if(!rack(r.ubicacion))continue;
  const id=JSON.stringify([key(r.ubicacion),key(r.sub)]);
  if(!slots.has(id))slots.set(id,[]);slots.get(id).push(r);
  if(key(r.producto)&&num(r.stock)>0&&key(r.estado)&&key(r.sector)){
   const pk=JSON.stringify([code(r.producto),key(r.estado),key(r.unidad)]);
   if(!sectors.has(pk))sectors.set(pk,new Set());sectors.get(pk).add(key(r.sector));
  }
 }
 const free=[];
 for(const rows of slots.values()){
  const first=rows[0],sameSector=new Set(rows.map(r=>key(r.sector)));
  // Blank/zero is only a possible free slot; contradictions across sources exclude it.
  if(sameSector.size!==1||!key(first.sector)||occupiedInventory.has(key(first.ubicacion)))continue;
  if(rows.every(r=>!key(r.producto)&&!key(r.lote)&&num(r.stock)===0&&['','LIBRE','LIB'].includes(key(r.ocupacion))))free.push(first);
 }
 free.sort((a,b)=>key(a.ubicacion).localeCompare(key(b.ubicacion))||key(a.sub).localeCompare(key(b.sub)));
 const alerts=[];
 for(const r of db.inventario){
  if(num(r.stock)<=0)continue;
  const type=norm(r.tipo),inSource=scope==='transito'?/transito|recep/.test(type):type!=='rack';
  if(!inSource)continue;
  const known=sectors.get(JSON.stringify([code(r.producto),key(r.estado),key(r.unidad)]))||new Set();
  const candidates=free.filter(s=>known.has(key(s.sector)));
  const capacity=num(r.bultoUnidades)*num(r.palletBultos),pallets=key(r.unidad)==='UN'&&capacity>0?Math.ceil(num(r.stock)/capacity):null;
  alerts.push({...r,candidates,sectors:[...known],pallets});
 }
 return {alerts,free};
}
const alarmasPanel=document.createElement('section');alarmasPanel.id='alarmasPanel';alarmasPanel.hidden=true;
alarmasPanel.innerHTML=`<div class="alarm-intro"><div><h3>Mercadería pendiente de ubicar</h3><p>Detectá stock fuera de racks y consultá posiciones vacías según los archivos cargados.</p></div><span class="alarm-badge">REVISIÓN OPERATIVA</span></div><div class="alarm-controls"><label>Origen de la mercadería<select id="alarmScope"><option value="transito">Tránsito / Recepción</option><option value="fuera">Todas las ubicaciones fuera de racks</option></select></label><label>Prefijos de racks<input id="alarmPrefixes" value="3RI, %RI" aria-describedby="rackHelp"></label><label>Buscar producto o lote<input id="alarmSearch" placeholder="Código, descripción o lote"></label></div><p id="rackHelp" class="alarm-help">Prefijos encontrados en las ubicaciones de tipo Rack. Podés ajustarlos, separados por coma.</p><div id="alarmStats" class="alarm-stats"></div><p class="alarm-help">Las candidatas pertenecen a sectores donde ya figura el mismo producto, estado y unidad. No están reservadas: una posición puede aparecer para varios lotes. Verificá capacidad, condiciones de almacenamiento y disponibilidad física antes de mover mercadería.</p><div class="alarm-legend"><strong>Alertas de ubicación</strong><button id="exportAlarmas" class="outline">Exportar alertas CSV</button></div><div class="tableScroll"><table><thead><tr><th>Revisión</th><th>Producto / lote</th><th>Origen</th><th>Stock</th><th>Estado</th><th>Pallets estimados</th><th>Posiciones candidatas</th></tr></thead><tbody id="alarmRows"></tbody></table></div><div class="pager"><span id="alarmPages"></span><div><button id="alarmPrev">Anterior</button><button id="alarmNext">Siguiente</button></div></div><details class="alarm-free"><summary id="freeSummary">Posiciones vacías en racks</summary><p class="alarm-help">Sin producto, lote ni stock en ubicaciones, y sin stock en inventario para esa ubicación. Esto no confirma compatibilidad con un producto.</p><div id="freeList"></div></details>`;
document.querySelector('.workspace').append(alarmasPanel);
let alarmPage=0,alarmData={alerts:[],free:[]},alarmFiltered=[];
function refreshAlarmas(){
 const prefixes=document.querySelector('#alarmPrefixes').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
 alarmData=calcularAlarmas(DB,document.querySelector('#alarmScope').value,prefixes);
 const query=norm(document.querySelector('#alarmSearch').value);
 alarmFiltered=alarmData.alerts.filter(r=>[r.producto,r.descripcion,r.lote,r.ubicacion].some(v=>norm(v).includes(query)));
 alarmPage=0;
 const candidates=alarmData.alerts.filter(r=>r.candidates.length).length;
 document.querySelector('#alarmStats').innerHTML=[['Registros pendientes',alarmData.alerts.length],['Con posiciones para revisar',candidates],['Sin candidata identificada',alarmData.alerts.length-candidates],['Posiciones vacías en racks',alarmData.free.length]].map(([label,n])=>`<div><strong>${fmt(n)}</strong><span>${label}</span></div>`).join('');
 document.querySelector('#freeSummary').textContent=`Ver ${fmt(alarmData.free.length)} posiciones vacías en racks`;
 const sectorGroups=new Map();for(const r of alarmData.free){if(!sectorGroups.has(r.sector))sectorGroups.set(r.sector,[]);sectorGroups.get(r.sector).push(r.ubicacion+(r.sub?' / '+r.sub:''))}
 document.querySelector('#freeList').innerHTML=[...sectorGroups].map(([s,rows])=>`<p><strong>${escapeHTML(s)} (${fmt(rows.length)})</strong><br>${rows.map(escapeHTML).join(' · ')}</p>`).join('')||'<p>No se identificaron posiciones vacías con estos prefijos.</p>';
 drawAlarmas();
}
function drawAlarmas(){
 document.querySelector('#alarmRows').innerHTML=alarmFiltered.slice(alarmPage*50,(alarmPage+1)*50).map(r=>{
  const message=r.candidates.length?'Revisar ubicación':r.sectors.length?'Sin vacantes en sector observado':'Falta referencia de sector';
  const positions=r.candidates.slice(0,3).map(s=>escapeHTML(s.ubicacion+(s.sub?' / '+s.sub:'')+' · '+s.sector)).join('<br>');
  return `<tr><td><span class="pill ${r.candidates.length?'ok':'warn'}">${message}</span></td><td class="alarm-product"><strong>${escapeHTML(r.producto)}</strong><span>${escapeHTML(r.descripcion)}</span><small>Lote: ${escapeHTML(r.lote||'Sin lote')}</small></td><td>${escapeHTML(r.ubicacion)}</td><td>${fmt(r.stock)} ${escapeHTML(r.unidad)}</td><td>${escapeHTML(r.estado)}</td><td>${r.pallets===null?'Sin equivalencia en UN':fmt(r.pallets)}</td><td>${positions||'Revisar con depósito'}${r.candidates.length>3?`<details><summary>Ver las ${fmt(r.candidates.length)} candidatas</summary>${r.candidates.slice(3).map(s=>escapeHTML(s.ubicacion+(s.sub?' / '+s.sub:'')+' · '+s.sector)).join('<br>')}</details>`:''}</td></tr>`;
 }).join('')||'<tr><td colspan="7">No hay registros pendientes con estos criterios.</td></tr>';
 document.querySelector('#alarmPages').textContent=`${fmt(alarmFiltered.length)} registros · Página ${alarmPage+1} de ${Math.max(1,Math.ceil(alarmFiltered.length/50))}`;
 document.querySelector('#alarmPrev').disabled=alarmPage===0;document.querySelector('#alarmNext').disabled=(alarmPage+1)*50>=alarmFiltered.length;
}
document.querySelector('#alarmScope').onchange=refreshAlarmas;document.querySelector('#alarmPrefixes').onchange=refreshAlarmas;document.querySelector('#alarmSearch').oninput=refreshAlarmas;
document.querySelector('#alarmPrev').onclick=()=>{alarmPage--;drawAlarmas()};document.querySelector('#alarmNext').onclick=()=>{alarmPage++;drawAlarmas()};
document.querySelector('#exportAlarmas').onclick=()=>{
 const rows=[['Producto','Descripción','Lote','Origen','Stock','Unidad','Estado','Pallets estimados','Candidatas para revisar'],...alarmFiltered.map(r=>[r.producto,r.descripcion,r.lote,r.ubicacion,r.stock,r.unidad,r.estado,r.pallets??'',r.candidates.map(s=>s.ubicacion+(s.sub?'/'+s.sub:'')+' ('+s.sector+')').join(' | ')])];
 const csv=rows.map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='adium_alertas_ubicacion.csv';link.click();URL.revokeObjectURL(url);
};
const vistaOriginal=setView;
setView=function(v){
 alarmasPanel.hidden=v!=='alarmas';document.querySelector('#exportBtn').hidden=v==='alarmas';
 if(v!=='alarmas'){vistaOriginal(v);return}
 vistaOriginal('resumen');view='alarmas';document.querySelector('#overview').hidden=true;document.querySelector('#dataArea').hidden=true;
 document.querySelector('#crumb').textContent='Alertas de ubicación';document.querySelector('#pageTitle').textContent='Alertas de ubicación';document.querySelector('#subtitle').textContent='Stock pendiente de ubicar y posiciones en racks para revisar.';
 all('[data-view]').forEach(b=>{b.classList.toggle(b.closest('nav')?'active':'selected',b.dataset.view===v);if(b.closest('nav')){if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}});
 refreshAlarmas();
};
document.querySelector('nav [data-view="alarmas"]').onclick=()=>setView('alarmas');

function motivoAlarma(r,db,prefixes){
 const key=v=>String(v??'').trim().toUpperCase(),code=v=>key(v).replace(/^0+/,'');
 const productRows=db.ubicaciones.filter(s=>code(s.producto)===code(r.producto));
 const racks=productRows.filter(s=>prefixes.some(p=>key(s.ubicacion).startsWith(p))&&num(s.stock)>0);
 const states=racks.filter(s=>key(s.estado)===key(r.estado));
 const units=states.filter(s=>key(s.unidad)===key(r.unidad));
 let reason,action;
 if(r.candidates.length){reason=`Se encontraron ${r.candidates.length} posiciones vacías en sectores donde ya figura este producto con estado ${r.estado} y unidad ${r.unidad}.`;action='Verificá capacidad, condiciones de almacenamiento y disponibilidad física antes de preparar el traslado.'}
 else if(!productRows.length){reason=`El producto ${r.producto} no aparece en el archivo de ubicaciones cargado. Por eso no hay un sector de referencia para sugerirle un rack.`;action='Revisá si el archivo de ubicaciones está actualizado. Si el producto es nuevo, depósito debe indicar el sector que le corresponde.'}
 else if(!racks.length){reason='El producto figura en ubicaciones, pero no tiene stock en los racks incluidos por los prefijos seleccionados.';action='Revisá los prefijos de racks y confirmá con depósito el sector de destino.'}
 else if(!states.length){reason=`El producto tiene stock en racks, pero no se encontró una referencia con el mismo estado ${r.estado}.`;action='Confirmá el sector habilitado para ese estado. El sistema no utiliza automáticamente sectores de otros estados.'}
 else if(!units.length){reason=`Hay referencias del producto y estado ${r.estado}, pero ninguna con la unidad ${r.unidad}.`;action='Revisá la unidad en ambos archivos y confirmá el sector antes de trasladar.'}
 else if(!r.sectors.length){reason='Las referencias coinciden en producto, estado y unidad, pero no tienen sector informado.';action='Completá o actualizá el sector en el archivo de ubicaciones.'}
 else{reason=`Se identificaron los sectores ${r.sectors.join(', ')}, pero no se encontró allí una posición que pase las comprobaciones de vacío.`;action='Revisá la disponibilidad física y actualizá los archivos. Las posiciones con producto, lote, stock, ocupación contradictoria o stock en inventario quedan excluidas.'}
 const inventory=db.inventario.filter(s=>code(s.producto)===code(r.producto)&&norm(s.tipo)==='rack'&&num(s.stock)>0);
 return {reason,action,evidence:[['Registros del producto en ubicaciones',productRows.length],['Con stock en los racks seleccionados',racks.length],[`Además con estado ${r.estado}`,states.length],[`Además con unidad ${r.unidad}`,units.length],['Registros del producto en racks según inventario',inventory.length],['Posiciones candidatas',r.candidates.length]]};
}
const motivoDialog=document.createElement('dialog');motivoDialog.id='motivoAlarma';motivoDialog.innerHTML='<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><h4>MOTIVO DE LA ALERTA</h4><h2 id="motivoTitulo"></h2><p id="motivoRegistro" class="upload-note"></p><div class="motivo-box"><strong>Qué encontró el sistema</strong><p id="motivoTexto"></p></div><div class="motivo-box"><strong>Qué revisar</strong><p id="motivoAccion"></p></div><details><summary>Ver comprobaciones realizadas</summary><div id="motivoEvidencia" class="detailGrid"></div></details><p class="upload-note">La ausencia de candidatas no demuestra que el depósito esté lleno. Las sugerencias dependen de los archivos y filtros actuales; no reservan espacio.</p>';
document.body.append(motivoDialog);
function abrirMotivo(r){
 const prefixes=document.querySelector('#alarmPrefixes').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean),result=motivoAlarma(r,DB,prefixes);
 document.querySelector('#motivoTitulo').textContent=r.descripcion||r.producto;
 document.querySelector('#motivoRegistro').textContent=`${r.producto} · Lote ${r.lote||'sin lote'} · ${r.ubicacion} · ${fmt(r.stock)} ${r.unidad} · Estado ${r.estado}`;
 document.querySelector('#motivoTexto').textContent=result.reason;document.querySelector('#motivoAccion').textContent=result.action;
 document.querySelector('#motivoEvidencia').innerHTML=result.evidence.map(([label,n])=>`<div class="detailCell"><span>${escapeHTML(label)}</span><strong>${fmt(n)}</strong></div>`).join('');motivoDialog.showModal();
 let actions=document.querySelector('#motivoAcciones');if(!actions){actions=document.createElement('div');actions.id='motivoAcciones';actions.className='upload-actions';motivoDialog.append(actions)}actions.replaceChildren(botonMoverAlerta(r));
}
const drawAlarmasSinMotivo=drawAlarmas;
drawAlarmas=function(){drawAlarmasSinMotivo();document.querySelectorAll('#alarmRows tr').forEach((row,i)=>{const r=alarmFiltered[alarmPage*50+i];if(!r)return;row.title='Doble clic para ver el motivo de la alerta';row.ondblclick=()=>abrirMotivo(r);const button=document.createElement('button');button.type='button';button.className='outline motivo-button';button.textContent='Ver motivo';button.onclick=()=>abrirMotivo(r);button.ondblclick=e=>e.stopPropagation();row.lastElementChild.append(button)})};

function origenDeAlerta(alert){
 const matches=DB.inventario.filter(r=>Object.keys(r).every(k=>r[k]===alert[k]));
 return matches.length===1?matches[0]:null;
}
function botonMoverAlerta(alert){
 const button=document.createElement('button');button.type='button';button.className='outline alert-move';button.textContent='Mover inventario';
 const record=origenDeAlerta(alert);button.disabled=!record||num(record.stock)<=Math.max(0,num(record.asignado));
 button.title=button.disabled?'No hay un origen único con stock disponible sin asignar':'Elegir destino y guardar un traslado pendiente';
 button.onclick=e=>{e.stopPropagation();if(motivoDialog.open)motivoDialog.close();ubicarDesdeInventario(record)};button.ondblclick=e=>e.stopPropagation();return button;
}
const drawAlarmasAntesMover=drawAlarmas;
drawAlarmas=function(){drawAlarmasAntesMover();document.querySelectorAll('#alarmRows tr').forEach((row,i)=>{const r=alarmFiltered[alarmPage*50+i];if(r)row.lastElementChild.append(botonMoverAlerta(r))})};
