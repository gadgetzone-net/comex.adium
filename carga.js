'use strict';
let cargaToken=null;
const cargaDialog=document.querySelector('#cargaDialog'),cargaEstado=document.querySelector('#cargaEstado');
const cargaInfo={inventario:'Formato original de inventario. Se busca la hoja Datos con producto, stock, ubicación, lote y unidad.',ubicaciones:'Formato original de ubicaciones. Se utiliza la hoja TOTAL; no se suman hojas duplicadas.',equivalencias:'Formato original de unidades equivalentes, hoja Fusion de datos. Actualiza las capacidades por bulto y pallet.'};
window.actualizarFechaCarga=()=>{document.querySelector('#fechaCarga').textContent=DB.meta?.actualizado?'Última carga · '+DB.meta.actualizado:'Cargá tus Excel para comenzar'};
function resetCarga(){cargaToken=null;document.querySelector('#confirmarExcel').hidden=true;document.querySelector('#cargaPreview').replaceChildren();cargaEstado.textContent='';document.querySelector('#cargaAyuda').textContent=cargaInfo[document.querySelector('#cargaTipo').value]}
document.querySelector('#abrirCarga').onclick=()=>{resetCarga();cargaDialog.showModal()};
document.querySelector('#cargaTipo').onchange=resetCarga;
document.querySelector('#cargaArchivo').onchange=resetCarga;
function busyCarga(busy){cargaDialog.querySelectorAll('button,select,input').forEach(el=>el.disabled=busy);cargaDialog.dataset.busy=String(busy)}
cargaDialog.addEventListener('cancel',e=>{if(cargaDialog.dataset.busy==='true')e.preventDefault()});
async function postExcel(path,body){const response=await PortalStore.request(path,{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Local':'1'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo procesar el archivo');return result}
document.querySelector('#validarExcel').onclick=async()=>{
 resetCarga();const file=document.querySelector('#cargaArchivo').files[0];
 if(!file){cargaEstado.textContent='Seleccioná un archivo Excel.';return}
 if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>25*1024*1024){cargaEstado.textContent='Usá un archivo .xlsx de hasta 25 MB.';return}
 busyCarga(true);cargaEstado.textContent='Leyendo y validando el Excel…';
 try{
  const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('No se pudo leer el archivo.'));reader.readAsDataURL(file)});
  const result=await postExcel('/api/excel/validar',{tipo:document.querySelector('#cargaTipo').value,nombre:file.name,archivo:encoded});cargaToken=result.token;
  cargaEstado.textContent=`Archivo válido: ${fmt(result.registros)} registros · Hoja: ${result.hoja}` + (DB.meta?.movimientos?.length ? " . Hay movimientos locales: verificá que este Excel los incluya antes de reemplazar los datos." : "");
  const keys=Object.keys(result.muestra[0]||{}).slice(0,6);
  document.querySelector('#cargaPreview').innerHTML='<div class="tableScroll"><table><thead><tr>'+keys.map(k=>'<th>'+escapeHTML(k)+'</th>').join('')+'</tr></thead><tbody>'+result.muestra.map(row=>'<tr>'+keys.map(k=>'<td>'+escapeHTML(row[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  document.querySelector('#confirmarExcel').hidden=false;
 }catch(error){cargaEstado.textContent=error.message}finally{busyCarga(false)}
};
document.querySelector('#confirmarExcel').onclick=async()=>{
 if(!cargaToken)return;busyCarga(true);cargaEstado.textContent='Guardando respaldo y actualizando datos…';
 try{
  const result=await postExcel('/api/excel/confirmar',{token:cargaToken});cargaToken=null;document.querySelector('#confirmarExcel').hidden=true;
  cargaEstado.textContent=`Carga completada: ${fmt(result.registros)} registros. Respaldo: ${result.respaldo}`;
  const response=await PortalStore.request('/api/datos');if(!response.ok)throw Error('La carga se guardó, pero no se pudo refrescar la pantalla. Recargá el portal.');DB=await response.json();renderKPIs();setView(view);actualizarFechaCarga();
 }catch(error){cargaEstado.textContent=error.message}finally{busyCarga(false)}
};
resetCarga();actualizarFechaCarga();
