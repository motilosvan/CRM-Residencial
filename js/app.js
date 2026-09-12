const state = {
  view: "dashboard",
  emailFilter: "Todos",
  requestFilter: "Todos",
  search: "",
  emails: [
    {id:1,subject:"Solicitud de mantenimiento",from:"Carlos Ramírez",unit:"Apto 302",category:"Mantenimiento",priority:"Urgente",time:"Hace 15 min",status:"Pendiente"},
    {id:2,subject:"Reserva salón comunal",from:"Laura Gómez",unit:"Apto 508",category:"Reserva",priority:"Normal",time:"Hace 1 h",status:"En proceso"},
    {id:3,subject:"Consulta sobre administración",from:"Andrés Torres",unit:"Apto 104",category:"Consulta",priority:"Normal",time:"Hace 2 h",status:"Respondido"},
    {id:4,subject:"Reporte de fuga de agua",from:"María López",unit:"Apto 701",category:"Mantenimiento",priority:"Urgente",time:"Hace 3 h",status:"Pendiente"},
    {id:5,subject:"Actualización de datos",from:"Sofía Pérez",unit:"Apto 210",category:"Administrativo",priority:"Normal",time:"Ayer",status:"Respondido"},
    {id:6,subject:"Solicitud de certificado",from:"Diego Martínez",unit:"Apto 415",category:"Administrativo",priority:"Normal",time:"Ayer",status:"En proceso"}
  ],
  residents: [
    {id:1,name:"Carlos Ramírez",unit:"302",tower:"Torre A",email:"carlos.r@email.com",phone:"300 555 0182",status:"Activo"},
    {id:2,name:"Laura Gómez",unit:"508",tower:"Torre B",email:"laura.g@email.com",phone:"301 555 0224",status:"Activo"},
    {id:3,name:"Andrés Torres",unit:"104",tower:"Torre A",email:"andres.t@email.com",phone:"310 555 0147",status:"Activo"},
    {id:4,name:"María López",unit:"701",tower:"Torre C",email:"maria.l@email.com",phone:"315 555 0301",status:"Activo"},
    {id:5,name:"Sofía Pérez",unit:"210",tower:"Torre A",email:"sofia.p@email.com",phone:"320 555 0176",status:"Activo"},
    {id:6,name:"Diego Martínez",unit:"415",tower:"Torre B",email:"diego.m@email.com",phone:"316 555 0258",status:"Activo"}
  ],
  requests: [
    {id:"SOL-0012",title:"Fuga de agua en baño",resident:"María López",unit:"701",type:"Mantenimiento",priority:"Alta",status:"En proceso",date:"12/09/2026"},
    {id:"SOL-0011",title:"Reserva salón comunal",resident:"Laura Gómez",unit:"508",type:"Reserva",priority:"Media",status:"Pendiente",date:"12/09/2026"},
    {id:"SOL-0010",title:"Certificado de residencia",resident:"Diego Martínez",unit:"415",type:"Administrativo",priority:"Baja",status:"Completada",date:"11/09/2026"},
    {id:"SOL-0009",title:"Revisión de ascensor",resident:"Carlos Ramírez",unit:"302",type:"Mantenimiento",priority:"Alta",status:"Pendiente",date:"11/09/2026"},
    {id:"SOL-0008",title:"Actualización de información",resident:"Sofía Pérez",unit:"210",type:"Administrativo",priority:"Baja",status:"Completada",date:"10/09/2026"}
  ]
};

const views = {
  dashboard: ["Dashboard","Panel principal"],
  emails: ["Correos","Bandeja de correos"],
  residents: ["Residentes","Gestión de residentes"],
  requests: ["Solicitudes","Solicitudes y mantenimiento"],
  reports: ["Reportes","Reportes y analítica"],
  settings: ["Configuración","Configuración del sistema"]
};

const app = document.getElementById("appContent");
const pageTitle = document.getElementById("pageTitle");
const breadcrumb = document.getElementById("breadcrumbCurrent");
const toast = document.getElementById("toast");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalBody = document.getElementById("modalBody");

function esc(value){
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function initials(name){ return name.split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase(); }
function tagClass(value){
  const v=value.toLowerCase();
  if(v.includes("urgente")||v.includes("alta")) return "red";
  if(v.includes("complet")||v.includes("respond")) return "green";
  if(v.includes("reserva")||v.includes("media")) return "orange";
  return "blue";
}
function showToast(message){
  toast.textContent=message; toast.classList.remove("hidden");
  setTimeout(()=>toast.classList.add("hidden"),2400);
}
function openModal(html){ modalBody.innerHTML=html; modalBackdrop.classList.remove("hidden"); }
function closeModal(){ modalBackdrop.classList.add("hidden"); }
document.getElementById("modalClose").addEventListener("click",closeModal);
modalBackdrop.addEventListener("click",e=>{if(e.target===modalBackdrop)closeModal()});

function navigate(view){
  state.view=view; state.search="";
  document.getElementById("globalSearch").value="";
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  pageTitle.textContent=views[view][1]; breadcrumb.textContent=views[view][0];
  render();
  document.getElementById("sidebar").classList.remove("open");
}
document.querySelectorAll(".nav-link").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
document.getElementById("menuBtn").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
document.getElementById("globalSearch").addEventListener("input",e=>{state.search=e.target.value.toLowerCase();render()});

function render(){
  const pages={dashboard:renderDashboard,emails:renderEmails,residents:renderResidents,requests:renderRequests,reports:renderReports,settings:renderSettings};
  app.innerHTML=pages[state.view]();
  bindDynamic();
}
function renderDashboard(){
  const recent=state.emails.slice(0,4);
  return `
  <section class="hero">
    <div><p class="eyebrow">OPTIMIZACIÓN DE LA INFORMACIÓN</p>
    <h2>Organiza tus correos y gestiona residentes en un solo lugar.</h2>
    <p>Propuesta inicial del sistema para centralizar comunicaciones, solicitudes, reservas y seguimiento administrativo del conjunto residencial.</p></div>
    <div class="hero-art">✉️</div>
  </section>
  <div class="section-head"><div><h2>Resumen general</h2><p>Indicadores de la operación administrativa</p></div><button class="btn primary" data-action="new-email">＋ Nuevo correo</button></div>
  <div class="stats-grid">
    ${stat("✉","Correos pendientes","24","Requieren seguimiento","soft-blue")}
    ${stat("♙","Residentes registrados","186","Información activa","soft-green")}
    ${stat("▤","Solicitudes en proceso","12","Pendientes de atención","soft-orange")}
    ${stat("◫","Reportes generados","8","Durante este mes","soft-purple")}
  </div>
  <div class="two-col">
    <section class="panel"><div class="panel-head"><div><h3>Correos recientes</h3><p>Últimas comunicaciones recibidas</p></div><button class="btn ghost" data-view="emails">Ver todos</button></div>
      ${recent.map(emailRow).join("")}
    </section>
    <section class="panel"><div class="panel-head"><div><h3>Acciones rápidas</h3><p>Accesos principales del sistema</p></div></div>
      <div class="quick-grid">
        ${quick("✉","Gestionar correos","Centralizar comunicaciones","emails")}
        ${quick("♙","Consultar residentes","Perfiles y contactos","residents")}
        ${quick("▤","Revisar solicitudes","Tickets y reservas","requests")}
        ${quick("◫","Ver reportes","Indicadores administrativos","reports")}
      </div>
    </section>
  </div>
  <div class="two-col">
    <section class="panel"><div class="panel-head"><div><h3>Estado de solicitudes</h3><p>Distribución actual</p></div><button class="btn ghost" data-view="requests">Ver solicitudes</button></div>
      ${metric("Pendientes",5,42)}${metric("En proceso",4,34)}${metric("Completadas",3,24)}
    </section>
    <section class="panel"><div class="panel-head"><div><h3>Objetivo del proyecto</h3><p>Primera aproximación funcional</p></div></div>
      <p style="font-size:11px;line-height:1.6;color:#61777b">Implementar progresivamente un sistema estructurado para gestionar correos, facilitar respuestas rápidas, mantener registros claros y mejorar la comunicación con los residentes.</p>
      <div style="margin-top:15px"><span class="tag green">Interfaz inicial completada</span></div>
    </section>
  </div>`;
}
function stat(icon,label,value,small,cls){return `<article class="stat-card"><div class="stat-icon ${cls}">${icon}</div><div><span>${label}</span><strong>${value}</strong><small>${small}</small></div></article>`}
function quick(icon,title,desc,view){return `<button class="quick-card" data-view="${view}"><span class="qicon">${icon}</span><span><strong>${title}</strong><span>${desc}</span></span></button>`}
function metric(name,num,pct){return `<div class="metric"><span>${name}</span><strong>${num}</strong><small>${pct}% del total</small><div class="progress"><i style="width:${pct}%"></i></div></div>`}
function emailRow(e){return `<div class="email-row"><div class="mail-avatar">✉</div><div class="email-main"><strong>${esc(e.subject)}</strong><span>${esc(e.unit)} · ${esc(e.time)}</span></div><span class="tag ${tagClass(e.priority)}">${esc(e.priority)}</span></div>`}

function renderEmails(){
  const q=state.search;
  const list=state.emails.filter(e=>(state.emailFilter==="Todos"||e.category===state.emailFilter)&&(q===""||Object.values(e).join(" ").toLowerCase().includes(q)));
  return `<div class="page-intro"><h2>Bandeja de correos</h2><p>Recepción centralizada, categorización y seguimiento de comunicaciones.</p></div>
  <div class="toolbar"><div class="toolbar-left"><select class="filter" id="emailFilter"><option>Todos</option><option>Mantenimiento</option><option>Reserva</option><option>Consulta</option><option>Administrativo</option></select></div><div class="toolbar-right"><button class="btn" data-action="export">⇩ Exportar</button><button class="btn primary" data-action="new-email">＋ Nuevo correo</button></div></div>
  <div class="data-card"><table><thead><tr><th>ASUNTO</th><th>REMITENTE</th><th>CATEGORÍA</th><th>PRIORIDAD</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>
  ${list.length?list.map(e=>`<tr><td><strong>${esc(e.subject)}</strong><br><span style="font-size:8px;color:#8a999c">${esc(e.time)}</span></td><td>${esc(e.from)}<br><span style="font-size:8px;color:#8a999c">${esc(e.unit)}</span></td><td><span class="tag blue">${esc(e.category)}</span></td><td><span class="tag ${tagClass(e.priority)}">${esc(e.priority)}</span></td><td><span class="tag ${tagClass(e.status)}">${esc(e.status)}</span></td><td class="table-actions"><button data-email="${e.id}">Ver</button><button data-reply="${e.id}">Responder</button></td></tr>`).join(""):`<tr><td colspan="6"><div class="empty"><strong>No hay correos</strong>No se encontraron resultados para el filtro actual.</div></td></tr>`}
  </tbody></table></div>`;
}

function renderResidents(){
  const q=state.search;
  const list=state.residents.filter(r=>q===""||Object.values(r).join(" ").toLowerCase().includes(q));
  return `<div class="page-intro"><h2>Gestión de residentes</h2><p>Perfiles, unidades y datos de contacto del conjunto residencial.</p></div>
  <div class="toolbar"><div class="toolbar-left"><input class="input" id="residentSearch" placeholder="Buscar residente..." value="${esc(state.search)}"></div><div class="toolbar-right"><button class="btn" data-action="export">⇩ Exportar</button><button class="btn primary" data-action="new-resident">＋ Nuevo residente</button></div></div>
  <div class="data-card"><table><thead><tr><th>RESIDENTE</th><th>UNIDAD</th><th>CORREO</th><th>TELÉFONO</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>
  ${list.map(r=>`<tr><td><div class="person"><div class="avatar">${initials(r.name)}</div><div><strong>${esc(r.name)}</strong><span>${esc(r.tower)}</span></div></div></td><td>Apto ${esc(r.unit)}</td><td>${esc(r.email)}</td><td>${esc(r.phone)}</td><td><span class="tag green">${esc(r.status)}</span></td><td class="table-actions"><button data-resident="${r.id}">Ver perfil</button></td></tr>`).join("")}</tbody></table></div>`;
}

function renderRequests(){
  const q=state.search;
  const list=state.requests.filter(r=>(state.requestFilter==="Todos"||r.status===state.requestFilter)&&(q===""||Object.values(r).join(" ").toLowerCase().includes(q)));
  return `<div class="page-intro"><h2>Solicitudes y mantenimiento</h2><p>Tickets de residentes, mantenimiento, reservas y comunicaciones administrativas.</p></div>
  <div class="toolbar"><div class="toolbar-left"><select class="filter" id="requestFilter"><option>Todos</option><option>Pendiente</option><option>En proceso</option><option>Completada</option></select></div><div class="toolbar-right"><button class="btn primary" data-action="new-request">＋ Nueva solicitud</button></div></div>
  <div class="data-card"><table><thead><tr><th>ID</th><th>SOLICITUD</th><th>RESIDENTE</th><th>TIPO</th><th>PRIORIDAD</th><th>ESTADO</th><th>FECHA</th></tr></thead><tbody>
  ${list.map(r=>`<tr><td><strong>${esc(r.id)}</strong></td><td>${esc(r.title)}</td><td>${esc(r.resident)}<br><span style="font-size:8px;color:#8a999c">Apto ${esc(r.unit)}</span></td><td>${esc(r.type)}</td><td><span class="tag ${tagClass(r.priority)}">${esc(r.priority)}</span></td><td><span class="tag ${tagClass(r.status)}">${esc(r.status)}</span></td><td>${esc(r.date)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderReports(){
  return `<div class="page-intro"><h2>Reportes y analítica</h2><p>Indicadores para apoyar la toma de decisiones administrativas.</p></div>
  <div class="chart-grid">
    <section class="panel"><div class="panel-head"><div><h3>Correos recibidos</h3><p>Comportamiento durante la semana</p></div><button class="btn">Esta semana ▾</button></div>
      <div class="chart">${[48,68,55,82,73,91,60].map((n,i)=>`<div class="bar-wrap"><div class="bar" style="height:${n}%"></div><span>${["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"][i]}</span></div>`).join("")}</div>
    </section>
    <section class="panel"><div class="panel-head"><div><h3>Indicadores</h3><p>Resumen operativo</p></div></div>
      ${metric("Correos respondidos",82,82)}${metric("Solicitudes atendidas",74,74)}${metric("Tiempo de respuesta",68,68)}
    </section>
  </div>
  <div class="two-col"><section class="panel"><div class="panel-head"><div><h3>Distribución por categoría</h3><p>Comunicaciones recibidas</p></div></div>${metric("Mantenimiento",38,38)}${metric("Administrativo",29,29)}${metric("Reservas",18,18)}${metric("Consultas",15,15)}</section>
  <section class="panel"><div class="panel-head"><div><h3>Objetivo del módulo</h3><p>Reporting / Analytics</p></div></div><p style="font-size:11px;color:#61777b;line-height:1.6">El módulo permitirá consolidar información de correos, residentes y solicitudes para generar indicadores de atención y eficiencia administrativa.</p><button class="btn primary" style="margin-top:12px" data-action="export">Generar reporte</button></section></div>`;
}
function renderSettings(){
  return `<div class="page-intro"><h2>Configuración</h2><p>Preferencias generales de la propuesta de sistema.</p></div>
  <div class="settings-grid"><section class="panel"><div class="panel-head"><div><h3>Preferencias</h3><p>Comportamiento de la interfaz</p></div></div>
  ${setting("Notificaciones","Mostrar alertas de nuevos correos",true)}${setting("Seguimiento automático","Recordar comunicaciones pendientes",true)}${setting("Modo compacto","Reducir espacios en las tablas",false)}</section>
  <section class="panel"><div class="panel-head"><div><h3>Información del proyecto</h3><p>Primera etapa académica</p></div></div>
  <div class="detail-grid"><div class="detail"><span>Proyecto</span><strong>CRM Residencial</strong></div><div class="detail"><span>Versión</span><strong>1.0.0</strong></div><div class="detail"><span>Tecnologías</span><strong>HTML · CSS · JavaScript</strong></div><div class="detail"><span>Backend</span><strong>Próxima etapa</strong></div></div></section></div>`;
}
function setting(title,desc,on){return `<div class="setting-row"><div><strong>${title}</strong><p>${desc}</p></div><button class="toggle ${on?"on":""}" data-toggle></button></div>`}

function bindDynamic(){
  document.querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.view)));
  document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",()=>action(el.dataset.action)));
  const ef=document.getElementById("emailFilter"); if(ef){ef.value=state.emailFilter;ef.addEventListener("change",e=>{state.emailFilter=e.target.value;render()})}
  const rf=document.getElementById("requestFilter"); if(rf){rf.value=state.requestFilter;rf.addEventListener("change",e=>{state.requestFilter=e.target.value;render()})}
  const rs=document.getElementById("residentSearch"); if(rs)rs.addEventListener("input",e=>{state.search=e.target.value.toLowerCase();render()});
  document.querySelectorAll("[data-email]").forEach(b=>b.addEventListener("click",()=>showEmail(Number(b.dataset.email))));
  document.querySelectorAll("[data-reply]").forEach(b=>b.addEventListener("click",()=>replyEmail(Number(b.dataset.reply))));
  document.querySelectorAll("[data-resident]").forEach(b=>b.addEventListener("click",()=>showResident(Number(b.dataset.resident))));
  document.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",()=>{b.classList.toggle("on");showToast("Preferencia actualizada")}));
}
function action(type){
  if(type==="new-email")openModal(`<h2>Nuevo correo</h2><p>Formulario inicial para registrar una comunicación. En esta etapa los datos son demostrativos y no se guardan en una base de datos.</p><div class="detail-grid"><div class="detail"><span>Destinatario</span><strong>Seleccionar residente</strong></div><div class="detail"><span>Categoría</span><strong>Administrativo</strong></div><div class="detail" style="grid-column:1/-1"><span>Asunto</span><strong>Escriba el asunto de la comunicación</strong></div></div><button class="btn primary" style="margin-top:17px" id="demoSave">Guardar propuesta</button>`);
  if(type==="new-resident")openModal(`<h2>Registrar residente</h2><p>Esta pantalla representa el formulario que posteriormente se conectará al CRUD de residentes.</p><div class="detail-grid"><div class="detail"><span>Nombre completo</span><strong>Nuevo residente</strong></div><div class="detail"><span>Apartamento</span><strong>---</strong></div><div class="detail"><span>Correo</span><strong>correo@ejemplo.com</strong></div><div class="detail"><span>Teléfono</span><strong>300 000 0000</strong></div></div><button class="btn primary" style="margin-top:17px" id="demoSave">Guardar propuesta</button>`);
  if(type==="new-request")openModal(`<h2>Nueva solicitud</h2><p>Formulario inicial para registrar tickets de residentes, mantenimiento o reservas.</p><div class="detail-grid"><div class="detail"><span>Tipo</span><strong>Mantenimiento</strong></div><div class="detail"><span>Prioridad</span><strong>Media</strong></div><div class="detail" style="grid-column:1/-1"><span>Descripción</span><strong>Detalle de la solicitud...</strong></div></div><button class="btn primary" style="margin-top:17px" id="demoSave">Crear solicitud</button>`);
  if(type==="export"){showToast("Reporte preparado en modo demostración");}
  setTimeout(()=>{const s=document.getElementById("demoSave");if(s)s.onclick=()=>{closeModal();showToast("Acción registrada en modo demostración")}},0);
}
function showEmail(id){const e=state.emails.find(x=>x.id===id);openModal(`<h2>${esc(e.subject)}</h2><p>Detalle de comunicación recibida.</p><div class="detail-grid"><div class="detail"><span>Remitente</span><strong>${esc(e.from)}</strong></div><div class="detail"><span>Unidad</span><strong>${esc(e.unit)}</strong></div><div class="detail"><span>Categoría</span><strong>${esc(e.category)}</strong></div><div class="detail"><span>Estado</span><strong>${esc(e.status)}</strong></div></div>`)}
function replyEmail(id){const e=state.emails.find(x=>x.id===id);openModal(`<h2>Responder correo</h2><p>Preparando respuesta para <strong>${esc(e.from)}</strong>. Esta función se conectará al servicio de correo en una etapa posterior.</p><div class="detail" style="margin-top:16px"><span>Mensaje</span><strong>Escriba aquí la respuesta administrativa...</strong></div><button class="btn primary" style="margin-top:17px" id="demoSave">Enviar respuesta (demo)</button>`);setTimeout(()=>document.getElementById("demoSave").onclick=()=>{closeModal();showToast("Respuesta registrada en modo demostración")},0)}
function showResident(id){const r=state.residents.find(x=>x.id===id);openModal(`<h2>${esc(r.name)}</h2><p>Perfil del residente.</p><div class="detail-grid"><div class="detail"><span>Unidad</span><strong>Torre ${esc(r.tower.replace("Torre ",""))} · Apto ${esc(r.unit)}</strong></div><div class="detail"><span>Estado</span><strong>${esc(r.status)}</strong></div><div class="detail"><span>Correo</span><strong>${esc(r.email)}</strong></div><div class="detail"><span>Teléfono</span><strong>${esc(r.phone)}</strong></div></div>`)}
render();
