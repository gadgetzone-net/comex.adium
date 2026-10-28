'use strict';
const infoDatos = document.createElement('section');
infoDatos.className = 'local-data-banner';
infoDatos.innerHTML = '<div><strong>Tus datos quedan en este navegador</strong><p>Cargá tus Excel o un respaldo JSON. No se suben a GitHub ni se comparten entre computadoras. Descargá respaldos: al borrar los datos del navegador podés perderlos.</p></div><div class="local-data-actions"><button type="button" id="respaldoDescargar" class="outline">Descargar respaldo</button><button type="button" id="respaldoAnterior" class="outline">Respaldo anterior</button><button type="button" id="respaldoCargar" class="outline">Importar JSON</button><input id="respaldoArchivo" type="file" accept=".json,application/json" hidden></div><p id="respaldoEstado" role="status" aria-live="polite"></p>';
document.querySelector('.hero').after(infoDatos);
const backupStatus = document.querySelector('#respaldoEstado');
function guardarJSON(data, suffix) {
  const blob = new Blob([JSON.stringify({formato:'adium-logistica-v1', exportado:new Date().toISOString(), datos:data})], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'ADIUM_respaldo_'+suffix+'_'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
document.querySelector('#respaldoDescargar').onclick = async () => {
  try {guardarJSON(await PortalStore.read(), 'actual'); backupStatus.textContent='Respaldo preparado para descargar.';} catch(e) {backupStatus.textContent=e.message;}
};
document.querySelector('#respaldoAnterior').onclick = async () => {
  try {const data=await PortalStore.previous(); if(!data) throw Error('Todavía no hay un estado anterior.'); guardarJSON(data,'anterior'); backupStatus.textContent='Estado anterior preparado para descargar.';} catch(e) {backupStatus.textContent=e.message;}
};
document.querySelector('#respaldoCargar').onclick = () => document.querySelector('#respaldoArchivo').click();
document.querySelector('#respaldoArchivo').onchange = async event => {
  const file=event.target.files[0]; if(!file)return;
  try {
    if(file.size>30*1024*1024)throw Error('El JSON supera los 30 MB.');
    const data=PortalStore.validateBackup(JSON.parse(await file.text()));
    if(!confirm('Reemplazar los datos de este navegador por '+data.inventario.length+' registros de inventario y '+data.ubicaciones.length+' ubicaciones. El estado actual quedará como respaldo anterior.'))return;
    await PortalStore.restore(data);
    DB=await PortalStore.read();renderKPIs();setView('resumen');actualizarFechaCarga();
    backupStatus.textContent='Datos importados en este navegador.';
  }catch(e){backupStatus.textContent=e.message;}finally{event.target.value='';}
};
window.addEventListener('portal-cambio-externo', () => {backupStatus.textContent='Otra pestaña modificó los datos. Recargá esta página antes de seguir trabajando.';});
