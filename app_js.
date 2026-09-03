const state = {
  services: [
    {folio:"AS-240925-0012",cliente:"Juan Pérez",servicio:"Ajustador",proveedor:"Federico",estado:"Pendiente",hora:"10:24 a.m."},
    {folio:"AS-240925-0011",cliente:"María García",servicio:"Grúa",proveedor:"Grúas Premier",estado:"En camino",hora:"10:18 a.m."},
    {folio:"AS-240925-0010",cliente:"Carlos López",servicio:"Abogado",proveedor:"Abogados Torres",estado:"En sitio",hora:"10:15 a.m."},
    {folio:"AS-240925-0009",cliente:"Ana Martínez",servicio:"Auxilio Vial",proveedor:"Auxilio Vial Rápido",estado:"Asignado",hora:"10:10 a.m."},
    {folio:"AS-240925-0008",cliente:"Roberto Sánchez",servicio:"Grúa",proveedor:"Grúas HR2",estado:"Finalizado",hora:"09:58 a.m."},
    {folio:"AS-240925-0007",cliente:"Daniel Ortega",servicio:"Ajustador",proveedor:"Luis Fernando",estado:"Cancelado",hora:"09:42 a.m."}
  ],
  authorizations: [
    {initials:"MG",name:"María González",detail:"Vehículo: JKH-4567 | Membresía",type:"Vehículo",time:"Hace 25 min"},
    {initials:"RP",name:"Roberto Pérez",detail:"Vehículo: XYZ-7890 | Membresía",type:"Vehículo",time:"Hace 1 hora"},
    {initials:"TA",name:"Transportes ACME",detail:"Estampa: ACME-12345 | ACME",type:"ACME",time:"Hace 2 horas"}
  ],
  providers: [
    {name:"Luis Fernando",type:"Ajustador",rating:"4.9",status:"Disponible",services:128},
    {name:"Abogados Torres",type:"Abogado",rating:"4.8",status:"Disponible",services:96},
    {name:"Auxilio Vial Rápido",type:"Auxilio Vial",rating:"4.7",status:"Disponible",services:74},
    {name:"Grúas Premier",type:"Grúa",rating:"4.6",status:"Ocupado",services:156}
  ],
  clients: [
    {name:"Juan Pérez",phone:"55 1234 5678",membership:"ASC-000123",vehicles:2,services:14,status:"Activo"},
    {name:"María García",phone:"55 2222 1199",membership:"Sin membresía",vehicles:1,services:3,status:"Activo"},
    {name:"Carlos López",phone:"55 6741 2839",membership:"ASC-000481",vehicles:3,services:22,status:"Activo"},
    {name:"Transportes ACME",phone:"55 7788 1220",membership:"ASC-001044",vehicles:8,services:61,status:"Activo"}
  ]
};

const kpiTopData = [
  ["Pendientes","18","◷","pending"],
  ["Asignados","12","▣","assigned"],
  ["En camino","8","▰","onway"],
  ["En sitio","5","⌖","onsite"],
  ["Finalizados hoy","32","✓","done"],
  ["Cancelados hoy","4","×","cancelled"]
];
const kpiBottomData = [
  ["Proveedores disponibles","24","♟",""],
  ["Proveedores ocupados","39","♟","cancelled"],
  ["Clientes registrados","2,842","♟",""],
  ["Membresías activas","1,756","▤","onway"],
  ["Autorizaciones pendientes","7","▣","assigned"],
  ["Ingresos del día","$24,850.00","$","onway"]
];

const statusClass = value => "status-" + value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"-");

function renderKpis(){
  const make = ([label,value,icon,cls],index,bottom=false)=>`
    <article class="kpi ${cls}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="sub">${bottom ? (index===0?"de 68 conectados":index===1?"de 68 conectados":index===2?"en total":index===3?"+12 hoy":index===4?"ver bandeja →":"+18% vs ayer") : "Ver detalles →"}</div>
      <div class="icon">${icon}</div>
      ${bottom?"":`<svg class="spark" viewBox="0 0 80 28"><polyline points="2,22 12,18 20,20 28,10 36,14 45,8 56,13 66,9 78,12" fill="none" stroke="currentColor" stroke-width="2"/></svg>`}
    </article>`;
  document.getElementById("kpiTop").innerHTML = kpiTopData.map((d,i)=>make(d,i)).join("");
  document.getElementById("kpiBottom").innerHTML = kpiBottomData.map((d,i)=>make(d,i,true)).join("");
}

function renderServices(){
  const rows = state.services.map(s=>`
    <tr>
      <td><b>${s.folio}</b></td>
      <td>${s.cliente}</td>
      <td>${s.servicio}</td>
      <td><span class="statusBadge ${statusClass(s.estado)}">${s.estado}</span></td>
      <td>${s.hora}</td>
    </tr>`).join("");
  document.getElementById("recentServicesBody").innerHTML = rows.slice(0);
  renderAllServices();
}
function renderAllServices(){
  const q=(document.getElementById("serviceSearch")?.value||"").toLowerCase();
  const st=document.getElementById("serviceStatusFilter")?.value||"";
  const ty=document.getElementById("serviceTypeFilter")?.value||"";
  const list=state.services.filter(s=>{
    const txt=`${s.folio} ${s.cliente} ${s.servicio} ${s.proveedor}`.toLowerCase();
    return (!q||txt.includes(q))&&(!st||s.estado===st)&&(!ty||s.servicio===ty);
  });
  document.getElementById("allServicesBody").innerHTML=list.map(s=>`
    <tr>
      <td><b>${s.folio}</b></td><td>${s.cliente}</td><td>${s.servicio}</td><td>${s.proveedor}</td>
      <td><span class="statusBadge ${statusClass(s.estado)}">${s.estado}</span></td><td>${s.hora}</td>
      <td><button class="tableAction" onclick="openService('${s.folio}')">Ver</button></td>
    </tr>`).join("");
}

function renderAuthorizations(){
  document.getElementById("pendingAuthorizations").innerHTML=state.authorizations.map(a=>`
    <div class="authRow">
      <div class="miniAvatar">${a.initials}</div>
      <div class="rowMain"><b>${a.name}</b><span>${a.detail}</span></div>
      <div class="rowMain"><b>${a.type}</b><span>${a.time}</span></div>
      <span class="pill">Pendiente</span>
    </div>`).join("");

  document.getElementById("authorizationCards").innerHTML=state.authorizations.map((a,i)=>`
    <article class="authCard" data-auth="${i}">
      <div class="miniAvatar">${a.initials}</div>
      <h3>${a.name}</h3>
      <p>${a.detail}</p>
      <p><b>Tipo:</b> ${a.type}<br><b>Solicitud:</b> ${a.time}</p>
      <div class="cardActions">
        <button class="approve" onclick="approveAuth(${i})">Aprobar</button>
        <button class="reject" onclick="rejectAuth(${i})">Rechazar</button>
        <button onclick="openAuth(${i})">Ver expediente</button>
      </div>
    </article>`).join("");
}
function renderProviders(){
  document.getElementById("featuredProviders").innerHTML=state.providers.map((p,i)=>`
    <div class="providerRow">
      <div class="miniAvatar">${p.type==="Grúa"?"🚚":p.type==="Abogado"?"⚖":"👤"}</div>
      <div class="rowMain"><b>${p.name}</b><span>${p.type}</span></div>
      <span class="rating">★ ${p.rating}</span>
      <span class="statusBadge ${statusClass(p.status)}">${p.status}</span>
      <span class="rowMain"><span>${p.services} servicios</span></span>
    </div>`).join("");

  document.getElementById("providersGrid").innerHTML=state.providers.map((p,i)=>`
    <article class="providerCard">
      <div class="miniAvatar">${p.type==="Grúa"?"🚚":p.type==="Abogado"?"⚖":"👤"}</div>
      <h3>${p.name}</h3>
      <p>${p.type}<br>★ ${p.rating}<br>${p.services} servicios realizados</p>
      <span class="statusBadge ${statusClass(p.status)}">${p.status}</span>
      <div class="cardActions"><button onclick="openProvider(${i})">Ver ficha</button></div>
    </article>`).join("");
}
function renderClients(){
  document.getElementById("clientsBody").innerHTML=state.clients.map(c=>`
    <tr><td><b>${c.name}</b></td><td>${c.phone}</td><td>${c.membership}</td><td>${c.vehicles}</td><td>${c.services}</td><td><span class="statusBadge status-disponible">${c.status}</span></td></tr>`).join("");
}

function setToday(){
  const d=new Date();
  document.getElementById("todayLabel").textContent=d.toLocaleDateString("es-MX",{weekday:"short",day:"2-digit",month:"long",year:"numeric"});
}

let liveMap, fullMap;
function makeDivIcon(symbol, bg){
  return L.divIcon({
    className:"",
    html:`<div style="width:26px;height:26px;border-radius:50%;background:${bg};color:#fff;border:2px solid white;display:grid;place-items:center;font-size:13px;box-shadow:0 3px 8px rgba(0,0,0,.35)">${symbol}</div>`,
    iconSize:[26,26],iconAnchor:[13,13]
  });
}
function addMapMarkers(map){
  const markers=[
    [19.4326,-99.1332,"👤","#1579d0","Cliente"],
    [19.5007,-99.2653,"⚖","#8d42dc","Ajustador"],
    [19.4270,-99.1677,"⚖","#8d42dc","Ajustador"],
    [19.4550,-99.1250,"🚚","#f26a21","Grúa"],
    [19.4100,-99.0900,"🚚","#f26a21","Grúa"],
    [19.4780,-99.1150,"🚗","#278b43","Auxilio"],
    [19.3920,-99.1700,"🚗","#278b43","Auxilio"],
    [19.4440,-99.2100,"⚖","#8d42dc","Abogado"]
  ];
  markers.forEach(m=>L.marker([m[0],m[1]],{icon:makeDivIcon(m[2],m[3])}).addTo(map).bindPopup(`<b>${m[4]}</b><br>Proveedor AS CLICK`));
  L.circle([19.405,-99.115],{radius:2500,color:"#ff493e",weight:2,fillOpacity:.08}).addTo(map).bindPopup("Servicio activo");
}
function initMaps(){
  if(typeof L==="undefined") return;
  liveMap=L.map("liveMap",{zoomControl:true,attributionControl:false}).setView([19.43,-99.16],11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(liveMap);
  addMapMarkers(liveMap);
}
function initFullMap(){
  if(fullMap||typeof L==="undefined") return;
  fullMap=L.map("fullMap",{attributionControl:false}).setView([19.43,-99.16],11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(fullMap);
  addMapMarkers(fullMap);
}

function drawIncomeChart(){
  const c=document.getElementById("incomeChart");
  if(!c) return;
  const ctx=c.getContext("2d");
  const w=c.width,h=c.height,pad=42;
  const vals=[15000,22000,18000,32000,16000,21000,39750];
  const labels=["18 May","19 May","20 May","21 May","22 May","23 May","24 May"];
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle="#29435c";ctx.lineWidth=1;ctx.fillStyle="#9db1c5";ctx.font="12px Segoe UI";
  for(let i=0;i<5;i++){
    const y=pad+i*((h-pad*2)/4);ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();
    ctx.fillText(`$${40000-i*10000}`,4,y+4);
  }
  const max=40000;
  const pts=vals.map((v,i)=>[pad+i*((w-pad*2)/(vals.length-1)),h-pad-(v/max)*(h-pad*2)]);
  ctx.strokeStyle="#2f8fff";ctx.lineWidth=4;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();
  pts.forEach((p,i)=>{ctx.fillStyle="#d7ecff";ctx.beginPath();ctx.arc(p[0],p[1],4,0,Math.PI*2);ctx.fill();ctx.fillStyle="#9db1c5";ctx.fillText(labels[i],p[0]-17,h-14);});
}

const titles={
  inicio:["Dashboard","Bienvenido, Administrador"],servicios:["Servicios","Control y seguimiento operativo"],mapa:["Mapa en vivo","Proveedores y servicios activos"],autorizaciones:["Autorizaciones","Solicitudes pendientes de revisión"],
  clientes:["Clientes","Administración de clientes"],vehiculos:["Vehículos","Control de vehículos"],membresias:["Membresías","Administración de membresías"],proveedores:["Proveedores","Control de proveedores"],gremios:["MONTEC / ACME","Afiliaciones gremiales"],
  pagos:["Pagos","Ingresos y liquidaciones"],incidencias:["Incidencias","Casos y soporte"],reportes:["Reportes","Indicadores y estadísticas"],auditoria:["Auditoría","Registro de movimientos"],administradores:["Administradores","Roles y permisos"],configuracion:["Configuración","Parámetros del sistema"],ayuda:["Ayuda","Soporte y documentación"]
};
function changeSection(section){
  document.querySelectorAll(".pageSection").forEach(s=>s.classList.remove("active"));
  document.getElementById(`section-${section}`)?.classList.add("active");
  document.querySelectorAll(".navItem").forEach(n=>n.classList.toggle("active",n.dataset.section===section));
  const [t,sub]=titles[section]||[section,""];document.getElementById("pageTitle").textContent=t;document.getElementById("pageSubtitle").textContent=sub;
  document.getElementById("sidebar").classList.remove("open");document.getElementById("mobileOverlay").classList.remove("active");
  if(section==="mapa"){setTimeout(()=>{initFullMap();fullMap?.invalidateSize()},80)}
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".navItem").forEach(b=>b.addEventListener("click",()=>changeSection(b.dataset.section)));
document.querySelectorAll("[data-section-link]").forEach(b=>b.addEventListener("click",()=>changeSection(b.dataset.sectionLink)));

function openModal(title,html){
  document.getElementById("modalTitle").textContent=title;
  document.getElementById("modalContent").innerHTML=html;
  document.getElementById("modalOverlay").hidden=false;
}
function closeModal(){document.getElementById("modalOverlay").hidden=true}
document.getElementById("modalClose").addEventListener("click",closeModal);
document.getElementById("modalOverlay").addEventListener("click",e=>{if(e.target.id==="modalOverlay")closeModal()});

window.openService=folio=>{
  const s=state.services.find(x=>x.folio===folio); if(!s)return;
  openModal(`Servicio ${folio}`,`<p><b>Cliente:</b> ${s.cliente}</p><p><b>Servicio:</b> ${s.servicio}</p><p><b>Proveedor:</b> ${s.proveedor}</p><p><b>Estado:</b> ${s.estado}</p><p><b>Hora:</b> ${s.hora}</p><div class="cardActions"><button>Reasignar proveedor</button><button>Ver ubicación</button></div>`);
};
window.openProvider=i=>{const p=state.providers[i];openModal(p.name,`<p><b>Tipo:</b> ${p.type}</p><p><b>Calificación:</b> ★ ${p.rating}</p><p><b>Servicios:</b> ${p.services}</p><p><b>Estado:</b> ${p.status}</p>`)};
window.openAuth=i=>{const a=state.authorizations[i];openModal("Expediente de autorización",`<p><b>${a.name}</b></p><p>${a.detail}</p><p>${a.type} · ${a.time}</p>`)};
window.approveAuth=i=>{state.authorizations.splice(i,1);document.getElementById("authBadge").textContent=state.authorizations.length;renderAuthorizations()};
window.rejectAuth=i=>{state.authorizations.splice(i,1);document.getElementById("authBadge").textContent=state.authorizations.length;renderAuthorizations()};

document.getElementById("menuBtn").addEventListener("click",()=>{document.getElementById("sidebar").classList.toggle("open");document.getElementById("mobileOverlay").classList.toggle("active")});
document.getElementById("mobileOverlay").addEventListener("click",()=>{document.getElementById("sidebar").classList.remove("open");document.getElementById("mobileOverlay").classList.remove("active")});
document.getElementById("refreshBtn").addEventListener("click",()=>{renderKpis();renderServices();renderAuthorizations();renderProviders();drawIncomeChart()});
["serviceSearch","serviceStatusFilter","serviceTypeFilter"].forEach(id=>document.getElementById(id)?.addEventListener("input",renderAllServices));
document.getElementById("globalSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){changeSection("servicios");document.getElementById("serviceSearch").value=e.target.value;renderAllServices();}});
document.getElementById("newServiceBtn").addEventListener("click",()=>openModal("Crear servicio manual","<p>Esta ventana se conectará después con Firebase para crear solicitudes manuales desde cabina.</p>"));

renderKpis();renderServices();renderAuthorizations();renderProviders();renderClients();setToday();initMaps();drawIncomeChart();
