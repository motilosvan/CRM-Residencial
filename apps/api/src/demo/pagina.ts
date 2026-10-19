/** Página del visor de demostración. Todo el contenido dinámico se inserta con textContent (sin innerHTML). */
export const PAGINA = String.raw`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOC-CRM · Visor de demostración</title>
<style>
:root{--bg:#f4f6f8;--card:#fff;--tx:#1d2b36;--mut:#6b7c88;--bd:#dde3e8;--pri:#123e46;--acc:#4e9292;--ok:#2e7d4f;--warn:#c77700;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#10171b;--card:#18222a;--tx:#e6edf1;--mut:#8da0ac;--bd:#2a3944;--pri:#7ec4c4;--acc:#4e9292}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.45 system-ui,Segoe UI,sans-serif}
header{padding:14px 20px;background:var(--pri);color:#fff;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header h1{font-size:17px;margin:0}header span{opacity:.8;font-size:12px}
main{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;padding:16px 20px}
@media(max-width:1000px){main{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:14px}
.kpi b{display:block;font-size:22px}.kpi span{color:var(--mut);font-size:12px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--bd);vertical-align:top}
th{font-size:12px;color:var(--mut);font-weight:600}tbody tr{cursor:pointer}tbody tr:hover,tr.sel{background:color-mix(in srgb,var(--acc) 14%,transparent)}
.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:600;border:1px solid var(--bd)}
.ALTA{color:var(--bad);border-color:var(--bad)}.MEDIA{color:var(--warn);border-color:var(--warn)}.BAJA{color:var(--ok);border-color:var(--ok)}
button,select,input,textarea{font:inherit;color:inherit;background:var(--card);border:1px solid var(--bd);border-radius:7px;padding:6px 10px}
button{cursor:pointer;background:var(--pri);color:#fff;border-color:var(--pri)}button.sec{background:var(--card);color:var(--tx);border-color:var(--bd)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.msg{padding:8px 10px;border-radius:7px;margin:8px 0;font-size:13px}.err{background:color-mix(in srgb,var(--bad) 15%,transparent);border:1px solid var(--bad)}
.good{background:color-mix(in srgb,var(--ok) 15%,transparent);border:1px solid var(--ok)}
.tl{border-left:2px solid var(--acc);margin:8px 0 0 6px;padding-left:12px}.tl div{margin-bottom:9px}.tl small{color:var(--mut)}
h2{font-size:15px;margin:0 0 8px}details summary{cursor:pointer;font-weight:600}
input,textarea{width:100%}label{font-size:12px;color:var(--mut)}
</style></head><body>
<header><h1>SOC-CRM · Visor de demostración</h1><span>Datos reales en SQL Server · acciones = transacciones reales (T1–T4) · sin login (solo local) · <a href="/docs" style="color:#fff">Endpoints de la API</a></span></header>
<main>
<section>
  <div class="cards" id="kpis"></div>
  <div class="card"><h2>Bandeja de solicitudes <small style="font-weight:400;color:var(--mut)">(ordenada por prioridad)</small></h2>
    <div style="overflow-x:auto"><table><thead><tr><th>Código</th><th>Asunto</th><th>Categoría</th><th>Prior.</th><th>Estado</th><th>Responsable</th></tr></thead><tbody id="lista"></tbody></table></div>
  </div>
  <div class="card" style="margin-top:14px"><h2>Indicadores</h2><div id="ind"></div></div>
</section>
<aside>
  <div class="card" id="detalle"><h2>Detalle</h2><p style="color:var(--mut)">Elija una solicitud de la bandeja.</p></div>
  <div class="card" style="margin-top:14px"><details><summary>✉ Simular un correo entrante (T1)</summary>
    <div class="row"><div style="width:100%"><label>Remitente</label><input id="f-rem" value="ana.torres@mail.com"></div>
    <div style="width:100%"><label>Asunto</label><input id="f-asu" value="Fuga de agua en el parqueadero"></div>
    <div style="width:100%"><label>Cuerpo</label><textarea id="f-cue" rows="3">Hay agua saliendo de una tubería, es urgente.</textarea></div>
    <button id="enviar">Recibir correo</button></div><div id="ing"></div></details></div>
</aside>
</main>
<script>
const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{}))k==='class'?e.className=v:e.setAttribute(k,v);for(const c of kids.flat())e.append(c instanceof Node?c:document.createTextNode(c??''));return e}
const api = async (url, body) => { const r = await fetch(url, body ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)} : undefined);
  const j = await r.json().catch(()=>({})); if(!r.ok){const e=new Error(j.error||('Error '+r.status));e.status=r.status;throw e} return j };
const fmt = (d) => d ? new Date(d).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}) : '—';
let sel = null, resp = [];

async function cargar(){
  const [lista, res] = await Promise.all([api('/api/solicitudes'), api('/api/resumen')]);
  resp = res.responsables;
  $('kpis').replaceChildren(h('div',{class:'card kpi'},h('b',{},String(lista.length)),h('span',{},'Solicitudes')),
    ...res.porEstado.map(e=>h('div',{class:'card kpi'},h('b',{},String(e.n)),h('span',{},e.estado))));
  $('lista').replaceChildren(...lista.map(s=>{const tr=h('tr',{class:s.id===sel?'sel':''},
    h('td',{},s.codigo),h('td',{},s.asunto||'(sin asunto)'),h('td',{},s.categoria),h('td',{},h('span',{class:'tag '+s.prioridad},s.prioridad)),
    h('td',{},s.estado),h('td',{},s.responsable||'—'));tr.onclick=()=>abrir(s.id);return tr}));
  $('ind').replaceChildren(
    h('p',{},h('b',{},'Carga por responsable (abiertas): '),res.carga.map(c=>c.nombre+': '+c.abiertas).join(' · ')||'—'),
    h('p',{},h('b',{},'Tiempo medio hasta la primera respuesta: '),res.respuesta.map(r=>r.categoria+' '+r.minutosPromedio+' min, '+Math.round(100*r.dentroSla/r.total)+' % en SLA ('+r.total+')').join(' · ')||'—'));
}

async function abrir(id){
  sel = id; const d = $('detalle'); let s;
  try { s = await api('/api/solicitudes/'+id) } catch(e){ d.replaceChildren(h('div',{class:'msg err'},e.message)); return }
  const aviso = h('div',{id:'aviso'});
  const accion = async (fn) => { try { await fn(); aviso.replaceChildren(h('div',{class:'msg good'},'Operación realizada.')); await cargar(); await abrir(id); }
    catch(e){ aviso.replaceChildren(h('div',{class:'msg err'},(e.status===409?'⚠ Conflicto de concurrencia (409): ':e.status===422?'⛔ Regla de negocio (422): ':'Error: ')+e.message)) } };
  const botones = s.destinos.map(est=>{const b=h('button',{},'→ '+est);b.onclick=()=>accion(()=>api('/api/solicitudes/'+id+'/estado',{nuevoEstado:est,version:s.version}));return b});
  const selR = h('select',{}, h('option',{value:''},'Asignar a…'), resp.map(r=>h('option',{value:r.id},r.nombre)));
  selR.onchange=()=>{ if(selR.value) accion(()=>api('/api/solicitudes/'+id+'/asignar',{idResponsable:selR.value,version:s.version})) };
  const selP = h('select',{}, h('option',{value:''},'Cambiar prioridad…'), ['ALTA','MEDIA','BAJA'].map(p=>h('option',{value:p},p)));
  selP.onchange=()=>{ if(selP.value) accion(()=>api('/api/solicitudes/'+id+'/reclasificar',{prioridad:selP.value,version:s.version})) };
  const stale = h('button',{class:'sec',title:'Simula que otra persona modificó la solicitud antes que usted'},'Probar conflicto (versión vieja)');
  stale.onclick=()=>accion(()=>api('/api/solicitudes/'+id+'/estado',{nuevoEstado:s.destinos[0]||'CERRADA',version:s.version>1?s.version-1:s.version+1}));
  const bad = h('button',{class:'sec',title:'Intenta saltar a CERRADA'},'Probar salto inválido → CERRADA');
  bad.onclick=()=>accion(()=>api('/api/solicitudes/'+id+'/estado',{nuevoEstado:'CERRADA',version:s.version}));
  d.replaceChildren(
    h('h2',{},s.codigo+' · '+(s.asunto||'(sin asunto)')),
    h('p',{},h('span',{class:'tag '+s.prioridad},s.prioridad),' ',h('span',{class:'tag'},s.categoria),' ',h('span',{class:'tag'},s.estado),' ',h('small',{},'versión '+s.version)),
    h('p',{},h('b',{},'De: '),s.remitente,h('br'),h('b',{},'Responsable: '),s.responsable||'sin asignar',h('br'),h('b',{},'Creada: '),fmt(s.fechaCreacion),' · ',h('b',{},'1ª respuesta: '),fmt(s.primeraRespuesta)),
    h('p',{style:'white-space:pre-wrap;color:var(--mut)'},s.cuerpo||''),
    h('div',{class:'row'},botones.length?botones:h('small',{},s.estado==='NUEVA'?'Asigne un responsable para que avance a ASIGNADA.':'Estado final: sin más transiciones.')),
    h('div',{class:'row'},selR,selP),
    h('div',{class:'row'},stale,bad), aviso,
    h('h2',{style:'margin-top:12px'},'Historial (inmutable)'),
    h('div',{class:'tl'},s.historial.map(x=>h('div',{},h('b',{},(x.anterior?x.anterior+' → ':'')+x.nuevo),h('br'),h('small',{},fmt(x.fecha)+' · '+(x.usuario||'sistema')),x.comentario?h('div',{},x.comentario):''))),
    h('h2',{},'Asignaciones'),
    h('div',{class:'tl'},s.asignaciones.length?s.asignaciones.map(a=>h('div',{},h('b',{},a.nombre),h('br'),h('small',{},fmt(a.fechaAsignacion)+(a.liberadaEn?' → liberada '+fmt(a.liberadaEn):' · vigente')))):h('small',{},'Ninguna')));
  document.querySelectorAll('#lista tr').forEach(tr=>tr.classList.toggle('sel', tr.firstChild.textContent===s.codigo));
}

$('enviar').onclick = async () => {
  try { const r = await api('/api/ingesta',{remitente:$('f-rem').value,asunto:$('f-asu').value,cuerpo:$('f-cue').value});
    $('ing').replaceChildren(h('div',{class:'msg good'},'Solicitud creada: clasificada como '+r.categoria+', prioridad '+r.prioridad+'.'));
    await cargar(); abrir(r.idSolicitud);
  } catch(e){ $('ing').replaceChildren(h('div',{class:'msg err'},e.message)) } };
cargar();
</script></body></html>`;
