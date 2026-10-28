'use strict';
function calcularOcupacion(rows){
 const positions=new Map(),key=v=>String(v??'').trim().toUpperCase();
 for(const r of rows){
  const location=key(r.ubicacion);if(!location)continue;
  if(!positions.has(location))positions.set(location,{ubicacion:location,subs:new Map(),sectores:new Set()});
  const p=positions.get(location),sub=key(r.sub);if(r.sector)p.sectores.add(r.sector);
  if(!p.subs.has(sub))p.subs.set(sub,{nombre:sub||'Sin subdivisión',ocupada:false});
  const occupied=!!key(r.producto)||num(r.stock)!==0||['OCUPADA','OCUPADO','PARCIAL'].includes(key(r.ocupacion));
  p.subs.get(sub).ocupada ||= occupied;
 }
 return [...positions.values()].map(p=>{const subs=[...p.subs.values()],used=subs.filter(s=>s.ocupada).length;return {ubicacion:p.ubicacion,sectores:[...p.sectores],subs,total:subs.length,ocupadas:used,porcion:100/subs.length,porcentaje:100*used/subs.length}}).sort((a,b)=>a.ubicacion.localeCompare(b.ubicacion));
}
const ocupacionPanel=document.createElement('section');ocupacionPanel.id='ocupacionPanel';
ocupacionPanel.innerHTML=`<div class="occupancy-heading"><div><h3>Ocupación por posición</h3><p>Cada posición vale 100%. Sus subdivisiones se reparten ese porcentaje en partes iguales.</p></div><span class="alarm-badge">POR SUBDIVISIONES</span></div><div id="ocupacionStats" class="alarm-stats"></div><p class="occupancy-note">Ejemplo: 4 subdivisiones = 25% cada una. Con 3 ocupadas, la posición está ocupada al 75%. Una subdivisión con producto, stock o estado ocupado/parcial cuenta como ocupada completa. Este indicador mide porciones utilizadas, no volumen físico ni capacidad disponible.</p><details id="ocupacionDetalle"><summary>Ver porcentaje y subdivisiones de cada posición</summary><div class="alarm-controls"><label>Buscar posición o sector<input id="ocupacionBuscar" placeholder="Ej.: 3CI01A01"></label><label>Mostrar<select id="ocupacionFiltro"><option value="">Todas las posiciones</option><option value="parcial">Parcialmente ocupadas</option><option value="libre">Vacías (0%)</option><option value="llena">Completas (100%)</option><option value="sub">Con varias subdivisiones</option></select></label></div><div class="tableScroll"><table><thead><tr><th>Posición</th><th>Sectores</th><th>Ocupación</th><th>Porción por subdivisión</th><th>Detalle de subdivisiones</th></tr></thead><tbody id="ocupacionRows"></tbody></table></div><div class="pager"><span id="ocupacionPages"></span><div><button id="ocupacionPrev">Anterior</button><button id="ocupacionNext">Siguiente</button></div></div></details>`;
document.querySelector('#dataArea').prepend(ocupacionPanel);
let ocupacionPage=0,ocupacionData=[];
function refreshOcupacion(){
 ocupacionData=calcularOcupacion(DB.ubicaciones);ocupacionPage=0;
 const total=ocupacionData.length,equivalent=ocupacionData.reduce((n,p)=>n+p.ocupadas/p.total,0),pct=total?100*equivalent/total:0;
 document.querySelector('#ocupacionStats').innerHTML=[['Ocupación total por posiciones',fmt(pct)+'%'],['Porción libre total',fmt(total?100-pct:0)+'%'],['Posiciones físicas',fmt(total)],['Posiciones con subdivisiones',fmt(ocupacionData.filter(p=>p.total>1).length)]].map(([label,value])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('');
 drawOcupacion();
}
function drawOcupacion(){
 const q=norm(document.querySelector('#ocupacionBuscar').value),filter=document.querySelector('#ocupacionFiltro').value;
 const rows=ocupacionData.filter(p=>norm(p.ubicacion+' '+p.sectores.join(' ')).includes(q)&&(!filter||(filter==='parcial'&&p.ocupadas>0&&p.ocupadas<p.total)||(filter==='libre'&&p.ocupadas===0)||(filter==='llena'&&p.ocupadas===p.total)||(filter==='sub'&&p.total>1)));
 document.querySelector('#ocupacionRows').innerHTML=rows.slice(ocupacionPage*50,(ocupacionPage+1)*50).map(p=>`<tr><td class="primary">${escapeHTML(p.ubicacion)}</td><td>${p.sectores.map(escapeHTML).join(', ')}</td><td><strong>${fmt(p.porcentaje)}%</strong><div class="occupancy-meter" role="meter" aria-label="Ocupación de ${escapeHTML(p.ubicacion)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.porcentaje}"><i style="width:${p.porcentaje}%"></i></div><small>${p.ocupadas} de ${p.total} porciones ocupadas</small></td><td>${fmt(p.porcion)}%<br><small>1 / ${p.total} de la posición</small></td><td class="occupancy-portions">${p.subs.map(s=>`<span class="portion ${s.ocupada?'used':'free'}">${escapeHTML(s.nombre)} · ${fmt(p.porcion)}% · ${s.ocupada?'Ocupada':'Libre'}</span>`).join('')}</td></tr>`).join('')||'<tr><td colspan="5">No hay posiciones con estos filtros.</td></tr>';
 document.querySelector('#ocupacionPages').textContent=`${fmt(rows.length)} posiciones · Página ${ocupacionPage+1} de ${Math.max(1,Math.ceil(rows.length/50))}`;document.querySelector('#ocupacionPrev').disabled=ocupacionPage===0;document.querySelector('#ocupacionNext').disabled=(ocupacionPage+1)*50>=rows.length;
}
for(const id of ['ocupacionBuscar','ocupacionFiltro'])document.querySelector('#'+id).addEventListener(id==='ocupacionBuscar'?'input':'change',()=>{ocupacionPage=0;drawOcupacion()});
document.querySelector('#ocupacionPrev').onclick=()=>{ocupacionPage--;drawOcupacion()};document.querySelector('#ocupacionNext').onclick=()=>{ocupacionPage++;drawOcupacion()};
const vistaAntesOcupacion=setView;
setView=function(v){vistaAntesOcupacion(v);ocupacionPanel.hidden=v!=='ubicaciones';if(v==='ubicaciones')refreshOcupacion()};

let kpisEnPorcentaje=false;
const renderKPIsCantidades=renderKPIs;
renderKPIs=function(){
 renderKPIsCantidades();
 const positions=calcularOcupacion(DB.ubicaciones),total=positions.length;
 const used=total?positions.reduce((sum,p)=>sum+p.porcentaje,0)/total:0;
 const cards=[...document.querySelectorAll('#kpis .kpi')];
 [2,3].forEach((index)=>{
  const original=cards[index],button=document.createElement('button');button.type='button';button.className='kpi kpi-toggle';button.innerHTML=original.innerHTML;
  button.setAttribute('aria-pressed',String(kpisEnPorcentaje));
  if(kpisEnPorcentaje){
   button.querySelector('.heading>span').textContent=index===2?'Porción libre':'Ocupación de posiciones';
   button.querySelector('strong').textContent=fmt(index===2?(total?100-used:0):used)+'%';
   button.querySelector('small').textContent='Cada subdivisión cuenta como una porción';
  }
  const hint=document.createElement('span');hint.className='kpi-switch-hint';hint.textContent=kpisEnPorcentaje?'↔ Ver cantidades':'↔ Ver porcentajes';button.append(hint);
  button.title=kpisEnPorcentaje?'Clic para volver a las cantidades':'Clic para ver ocupación y porción libre por posición';
  button.onclick=()=>{kpisEnPorcentaje=!kpisEnPorcentaje;renderKPIs()};original.replaceWith(button);
 });
};
if(DB.ubicaciones.length)renderKPIs();
