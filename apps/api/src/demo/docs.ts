/**
 * Página de documentación de la API (http://127.0.0.1:3100/docs). Se arma en el navegador a partir de
 * /api/openapi.json, así que nunca se desincroniza de la especificación. Cada endpoint tiene un panel
 * "Probar" que llama a la API real (mismo origen). Todo el contenido dinámico va con textContent.
 */
export const DOCS = String.raw`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOC-CRM · Endpoints de la API</title>
<style>
:root{--bg:#f4f6f8;--card:#fff;--tx:#1d2b36;--mut:#5f7180;--bd:#dde3e8;--pri:#123e46;--acc:#4e9292;--get:#1f6feb;--post:#2e7d4f;--patch:#8250df;--bad:#b3261e;--warn:#9a6700;--code:#eef2f5}
@media (prefers-color-scheme:dark){:root{--bg:#10171b;--card:#18222a;--tx:#e6edf1;--mut:#93a5b1;--bd:#2a3944;--pri:#0f3138;--acc:#6fb3b3;--get:#58a6ff;--post:#3fb950;--patch:#bc8cff;--bad:#ff7b72;--warn:#d29922;--code:#0f171c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 system-ui,Segoe UI,sans-serif}
header{padding:16px 20px;background:var(--pri);color:#fff}header h1{margin:0;font-size:18px}header p{margin:4px 0 0;opacity:.85;font-size:13px}
header a{color:#fff}
.wrap{max-width:1100px;margin:0 auto;padding:16px}
nav.indice{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}nav.indice a{font:12px ui-monospace,Consolas,monospace;padding:4px 8px;border:1px solid var(--bd);border-radius:6px;color:var(--tx);text-decoration:none;background:var(--card)}
.card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:14px 16px;margin:12px 0}
h2{font-size:16px;margin:22px 0 6px}h3{font-size:13px;margin:12px 0 4px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.ep-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.m{font:700 12px ui-monospace,Consolas,monospace;padding:3px 8px;border-radius:6px;color:#fff;min-width:56px;text-align:center}
.GET{background:var(--get)}.POST{background:var(--post)}.PATCH{background:var(--patch)}
.ruta{font:600 14px ui-monospace,Consolas,monospace;word-break:break-all}.resumen{color:var(--mut)}
code,pre{font:12.5px ui-monospace,Consolas,monospace;background:var(--code);border-radius:6px}code{padding:1px 5px}
pre{padding:10px;overflow:auto;margin:6px 0;white-space:pre-wrap;word-break:break-word}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd);vertical-align:top}th{color:var(--mut);font-weight:600}
.st{font:600 12px ui-monospace,Consolas,monospace}.st.ok{color:var(--post)}.st.err{color:var(--bad)}.st.warn{color:var(--warn)}
details.probar{margin-top:10px;border-top:1px dashed var(--bd);padding-top:8px}details.probar summary{cursor:pointer;font-weight:600;color:var(--acc)}
.fila{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:8px 0}.fila label{display:flex;flex-direction:column;font-size:12px;color:var(--mut);gap:3px}
input,select,textarea{font:13px ui-monospace,Consolas,monospace;color:var(--tx);background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:6px 8px}
textarea{width:100%;min-height:90px}button{font:inherit;cursor:pointer;background:var(--pri);color:#fff;border:1px solid var(--pri);border-radius:7px;padding:6px 14px}
.nota{border-left:3px solid var(--acc);padding:8px 12px;background:var(--card);border-radius:0 8px 8px 0;margin:10px 0}
.plan td:first-child{white-space:nowrap}.badge{font-size:11px;padding:1px 7px;border-radius:99px;border:1px solid var(--warn);color:var(--warn)}
</style></head><body>
<header><h1 id="titulo">SOC-CRM · Endpoints de la API</h1>
<p><span id="desc"></span> · <a href="/">Abrir el visor</a> · <a href="/api/openapi.json">OpenAPI JSON</a></p></header>
<div class="wrap">
  <div class="nota" id="intro"></div>
  <nav class="indice" id="indice" aria-label="Índice de endpoints"></nav>
  <div id="contenido"></div>
  <h2>Códigos de respuesta comunes</h2>
  <div class="card" style="overflow-x:auto"><table id="codigos"><thead><tr><th>Código</th><th>Significado</th></tr></thead><tbody></tbody></table></div>
  <h2>Planificados para la API definitiva (semana 4) <span class="badge">no implementados</span></h2>
  <div class="card plan" style="overflow-x:auto"><table><thead><tr><th>Método</th><th>Ruta</th><th>Rol</th><th>Descripción</th></tr></thead><tbody id="plan"></tbody></table></div>
</div>
<script>
const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{}))k==='class'?e.className=v:e.setAttribute(k,v);for(const c of kids.flat())e.append(c instanceof Node?c:document.createTextNode(c??''));return e}
const resolver = (spec, ref) => ref.replace(/^#\//,'').split('/').reduce((o,k)=>o[k], spec);
const tipo = (s) => !s ? '' : s.enum ? s.enum.join(' | ') : Array.isArray(s.type) ? s.type.join(' | ') : (s.type||'') + (s.minimum!==undefined?' ≥ '+s.minimum:'') + (s.maxLength?' (máx. '+s.maxLength+')':'');

function tarjeta(spec, ruta, metodo, op){
  const M = metodo.toUpperCase();
  const params = op.parameters || [];
  const body = op.requestBody && op.requestBody.content['application/json'];
  const id = op.operationId;
  const card = h('div',{class:'card',id});
  card.append(h('div',{class:'ep-head'}, h('span',{class:'m '+M},M), h('span',{class:'ruta'},ruta), h('span',{class:'resumen'},op.summary||'')));
  if (op.description) card.append(h('p',{},op.description));

  if (params.length){
    card.append(h('h3',{},'Parámetros'));
    card.append(h('table',{},h('thead',{},h('tr',{},h('th',{},'Nombre'),h('th',{},'En'),h('th',{},'Tipo'),h('th',{},'Descripción'))),
      h('tbody',{},params.map(p=>h('tr',{},h('td',{},h('code',{},p.name+(p.required?' *':''))),h('td',{},p.in),h('td',{},tipo(p.schema)),h('td',{},p.description||(p.schema&&p.schema.default!==undefined?'por defecto '+p.schema.default:'')))))));
  }
  if (body){
    const props = body.schema.properties || {};
    card.append(h('h3',{},'Cuerpo (JSON)'));
    card.append(h('table',{},h('thead',{},h('tr',{},h('th',{},'Campo'),h('th',{},'Tipo'),h('th',{},'Obligatorio'))),
      h('tbody',{},Object.entries(props).map(([k,s])=>h('tr',{},h('td',{},h('code',{},k)),h('td',{},tipo(s)),h('td',{},(body.schema.required||[]).includes(k)?'sí':'no'))))));
    if (body.example) card.append(h('pre',{},JSON.stringify(body.example,null,2)));
  }
  card.append(h('h3',{},'Respuestas'));
  card.append(h('table',{},h('tbody',{},Object.entries(op.responses).map(([cod,r])=>{
    const resp = r.$ref ? resolver(spec, r.$ref) : r;
    return h('tr',{},h('td',{},h('span',{class:'st '+(cod<300?'ok':cod<500?'warn':'err')},cod)),h('td',{},resp.description||''));
  }))));

  // Panel "Probar"
  const panel = h('details',{class:'probar'},h('summary',{},'Probar este endpoint'));
  const campos = {};
  const fila = h('div',{class:'fila'});
  for (const p of params){
    const s = p.schema||{};
    const input = s.enum ? h('select',{},h('option',{value:''},'(sin filtro)'),s.enum.map(v=>h('option',{value:v},v))) : h('input',{type:s.type==='integer'?'number':'text',placeholder:p.example!==undefined?String(p.example):(s.default!==undefined?String(s.default):'')});
    if (p.in==='path') input.value = p.example!==undefined ? p.example : '';
    campos[p.name] = {p, input};
    fila.append(h('label',{},p.name+(p.required?' *':''),input));
  }
  if (params.length) panel.append(fila);
  let area = null;
  if (body){ area = h('textarea',{spellcheck:'false','aria-label':'Cuerpo JSON'}); area.value = JSON.stringify(body.example||{},null,2); panel.append(area); }
  const salida = h('pre',{},'—');
  const estado = h('span',{class:'st'},'');
  const enviar = h('button',{},'Enviar');
  enviar.onclick = async () => {
    let url = ruta; const q = new URLSearchParams();
    for (const {p,input} of Object.values(campos)){
      if (p.in==='path') url = url.replace('{'+p.name+'}', encodeURIComponent(input.value));
      else if (input.value!=='') q.set(p.name, input.value);
    }
    if ([...q].length) url += '?' + q;
    estado.textContent = '…'; estado.className = 'st';
    try {
      const opts = M==='GET' ? {} : {method:M,headers:{'content-type':'application/json'},body:area?area.value:'{}'};
      const t0 = performance.now(); const r = await fetch(url, opts); const ms = Math.round(performance.now()-t0);
      const texto = await r.text(); let bonito = texto; try { bonito = JSON.stringify(JSON.parse(texto),null,2) } catch {}
      estado.textContent = r.status + ' · ' + ms + ' ms · ' + M + ' ' + url; estado.className = 'st ' + (r.ok?'ok':r.status<500?'warn':'err');
      salida.textContent = bonito.length > 20000 ? bonito.slice(0,20000) + '\n… (recortado)' : bonito;
    } catch (e) { estado.textContent = 'Error de red'; estado.className='st err'; salida.textContent = String(e) }
  };
  panel.append(h('div',{class:'fila'},enviar,estado), salida);
  card.append(panel);
  return card;
}

(async () => {
  const spec = await (await fetch('/api/openapi.json')).json();
  $('titulo').textContent = spec.info.title;
  $('desc').textContent = 'Versión ' + spec.info.version + ' · servidor ' + spec.servers[0].url;
  $('intro').textContent = spec.info.description;
  const cont = $('contenido');
  for (const tag of spec.tags){
    const ops = Object.entries(spec.paths).flatMap(([ruta,ms])=>Object.entries(ms).filter(([,op])=>op.tags.includes(tag.name)).map(([m,op])=>[ruta,m,op]));
    if (!ops.length) continue;
    cont.append(h('h2',{},tag.name), h('p',{class:'resumen'},tag.description||''));
    for (const [ruta,m,op] of ops){
      cont.append(tarjeta(spec, ruta, m, op));
      const a = h('a',{href:'#'+op.operationId},m.toUpperCase()+' '+ruta); $('indice').append(a);
    }
  }
  const codigos = [['200','Correcto'],['400','JSON inválido'],['403','Origen no permitido (protección CSRF)'],['404','La solicitud no existe'],
    ['409','Conflicto: otra persona cambió la solicitud; recargue y reintente con la nueva versión'],['413','Cuerpo mayor de 64 KB'],
    ['415','Falta Content-Type: application/json'],['421','Host no permitido (protección DNS rebinding)'],
    ['422','Datos inválidos o regla de negocio (transición no permitida, responsable inactivo, solicitud cerrada…)'],['500','Error interno (sin detalles)']];
  $('codigos').querySelector('tbody').replaceChildren(...codigos.map(([c,t])=>h('tr',{},h('td',{},h('span',{class:'st '+(c<300?'ok':c<500?'warn':'err')},c)),h('td',{},t))));
  $('plan').replaceChildren(...spec['x-planificados'].map(p=>h('tr',{},h('td',{},h('span',{class:'m '+p.metodo},p.metodo)),h('td',{},h('code',{},p.ruta)),h('td',{},p.rol),h('td',{},p.descripcion))));
})();
</script></body></html>`;
