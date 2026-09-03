const state = {
  services: [],
  authorizations: [],
  providers: [],
  clients: [],
  vehicles: []
};

let firebaseReady = false;
let db = null;
let firestoreCollection = null;
let firestoreOnSnapshot = null;
let firestoreCollectionGroup = null;
let firestoreDoc = null;
let firestoreGetDoc = null;
let firestoreUpdateDoc = null;
let firestoreServerTimestamp = null;

let unsubscribeServices = null;
let unsubscribeProviders = null;
let unsubscribeClients = null;
let unsubscribeVehicles = null;

const kpiTopData = [
  ["Pendientes","0","◷","pending"],
  ["Asignados","0","▣","assigned"],
  ["En camino","0","▰","onway"],
  ["En sitio","0","⌖","onsite"],
  ["Finalizados hoy","0","✓","done"],
  ["Cancelados hoy","0","×","cancelled"]
];

const kpiBottomData = [
  ["Proveedores disponibles","0","♟",""],
  ["Proveedores ocupados","0","♟","cancelled"],
  ["Clientes registrados","0","♟",""],
  ["Membresías activas","0","▤","onway"],
  ["Autorizaciones pendientes","0","▣","assigned"],
  ["Ingresos del día","$0.00","$","onway"]
];

const statusClass = value =>
  "status-" +
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g,"-");

function escaparHtml(valor){
  return String(valor ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function texto(valor, alternativa = ""){
  const salida = String(valor ?? "").trim();
  return salida || alternativa;
}

function normalizarEstadoServicio(valor){
  const estado = String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g,"_");

  const equivalencias = {
    pendiente_cabina: "Pendiente",
    solicitado: "Pendiente",
    pendiente: "Pendiente",
    buscando_proveedor: "Pendiente",
    asignado: "Asignado",
    aceptado: "Asignado",
    en_camino: "En camino",
    en_ruta: "En camino",
    arribo: "En sitio",
    en_sitio: "En sitio",
    en_proceso: "En sitio",
    en_traslado: "En sitio",
    destino: "En sitio",
    finalizado: "Finalizado",
    terminado: "Finalizado",
    completado: "Finalizado",
    cancelado: "Cancelado",
    cancelada: "Cancelado"
  };

  return equivalencias[estado] || (valor ? String(valor) : "Pendiente");
}

function normalizarTipoServicio(valor){
  const tipo = String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/_/g," ");

  const equivalencias = {
    ajustador: "Ajustador",
    abogado: "Abogado",
    "auxilio vial": "Auxilio Vial",
    auxilio: "Auxilio Vial",
    grua: "Grúa"
  };

  return equivalencias[tipo] || (valor ? String(valor) : "Servicio");
}

function obtenerMilisegundos(valor){
  if (!valor) return 0;

  if (typeof valor?.toDate === "function") {
    return valor.toDate().getTime();
  }

  if (typeof valor?.seconds === "number") {
    return valor.seconds * 1000;
  }

  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
}

function esHoy(valor){
  const ms = obtenerMilisegundos(valor);
  if (!ms) return false;

  const fecha = new Date(ms);
  const hoy = new Date();

  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
}

function formatearHora(valor){
  const ms = obtenerMilisegundos(valor);
  if (!ms) return "Sin hora";

  return new Date(ms).toLocaleTimeString("es-MX",{
    hour:"2-digit",
    minute:"2-digit"
  });
}

function formatearDinero(valor){
  return new Intl.NumberFormat("es-MX",{
    style:"currency",
    currency:"MXN"
  }).format(Number(valor) || 0);
}

function convertirImporteANumero(valor){
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : 0;
  }

  if (valor == null) return 0;

  const limpio = String(valor)
    .replace(/[^0-9.-]/g,"")
    .trim();

  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : 0;
}

function obtenerNombreCliente(datos = {}){
  return texto(
    datos.cliente?.nombre ||
    datos.nombreCliente ||
    datos.nombre ||
    datos.clienteNombre,
    "Cliente"
  );
}

function obtenerNombreProveedor(datos = {}){
  return texto(
    datos.asignacion?.nombreProveedor ||
    datos.proveedor?.nombre ||
    datos.nombreProveedor,
    "Sin asignar"
  );
}

function convertirSolicitud(doc){
  const datos = doc.data();

  const fechaCreacion =
    datos.creadoEn ||
    datos.fechaCreacion ||
    datos.fechaSolicitud ||
    datos.fecha ||
    null;

  const estadoNormalizado = normalizarEstadoServicio(datos.estado);

  const fechaFinalizacion =
    datos.fechaFinalizacion ||
    datos.finalizadoEn ||
    datos.fechaTermino ||
    datos.fechaFinalizado ||
    (
      estadoNormalizado === "Finalizado"
        ? (
            datos.actualizadoEn ||
            datos.fechaActualizacion ||
            fechaCreacion
          )
        : null
    );

  const tipo =
    datos.servicio?.tipo ||
    datos.servicio?.nombre ||
    datos.tipoServicio ||
    datos.servicio ||
    "";

  const monto =
    convertirImporteANumero(
      datos.total ??
      datos.importeTotal ??
      datos.precioCliente ??
      datos.costoCliente ??
      datos.monto ??
      datos.costoServicio ??
      0
    );

  return {
    id: doc.id,
    raw: datos,
    folio: texto(datos.folio || datos.folioOficial, doc.id.slice(0,8).toUpperCase()),
    cliente: obtenerNombreCliente(datos),
    servicio: normalizarTipoServicio(tipo),
    proveedor: obtenerNombreProveedor(datos),
    uidProveedor: texto(
      datos.asignacion?.uidProveedor ||
      datos.uidProveedor ||
      datos.proveedorId,
      ""
    ),
    estado: estadoNormalizado,
    estadoRaw: datos.estado || "",
    hora: formatearHora(fechaCreacion),
    fecha: fechaCreacion,
    fechaCreacion,
    fechaFinalizacion,
    monto
  };
}

function obtenerEstadoProveedor(datos = {}){
  if (datos.ocupado === true) return "Ocupado";

  if (
    datos.disponible === true ||
    datos.estado === "disponible" ||
    datos.status === "disponible"
  ) {
    return "Disponible";
  }

  if (
    datos.activo === false ||
    datos.suspendido === true ||
    datos.estado === "suspendido"
  ) {
    return "Desconectado";
  }

  return datos.disponible === false ? "Desconectado" : "Disponible";
}

function convertirProveedor(doc){
  const datos = doc.data();

  return {
    id: doc.id,
    raw: datos,
    name: texto(
      datos.nombre ||
      datos.nombreCompleto ||
      datos.razonSocial ||
      datos.nombreProveedor,
      "Proveedor"
    ),
    type: normalizarTipoServicio(
      datos.tipoProveedor ||
      datos.tipo ||
      datos.servicio ||
      ""
    ),
    rating: Number(datos.calificacion || datos.rating || datos.promedioCalificacion || 0).toFixed(1),
    status: obtenerEstadoProveedor(datos),
    services: Number(datos.serviciosRealizados || datos.totalServicios || datos.servicios || 0),
    telefono: texto(datos.telefono || datos.celular, "No registrado")
  };
}

function clienteTieneMembresia(datos = {}){
  const estado = String(
    datos.estadoMembresia ||
    datos.membresia?.estado ||
    ""
  ).toLowerCase();

  return (
    datos.tieneMembresia === true ||
    Boolean(datos.numeroMiembro || datos.numeroMembresia || datos.numeroSocio) &&
    !["cancelada","cancelado","vencida","vencido","sin_membresia"].includes(estado)
  );
}

function contarVehiculosCliente(datos = {}){
  if (Array.isArray(datos.vehiculos)) return datos.vehiculos.length;
  if (datos.vehiculos && typeof datos.vehiculos === "object") {
    return Object.keys(datos.vehiculos).length;
  }
  if (
    datos.vehiculoPrincipal ||
    datos.marca ||
    datos.placas ||
    datos.serie
  ) {
    return 1;
  }
  return 0;
}

function convertirCliente(doc){
  const datos = doc.data();

  return {
    id: doc.id,
    raw: datos,
    name: texto(
      datos.nombre ||
      datos.nombreCompleto ||
      datos.displayName,
      "Cliente"
    ),
    phone: texto(datos.telefono || datos.celular, "No registrado"),
    membership:
      datos.numeroMiembro ||
      datos.numeroMembresia ||
      datos.numeroSocio ||
      (clienteTieneMembresia(datos) ? "Membresía activa" : "Sin membresía"),
    hasMembership: clienteTieneMembresia(datos),
    vehicles: contarVehiculosCliente(datos),
    services: Number(datos.totalServicios || datos.serviciosRealizados || 0),
    status:
      datos.suspendido === true ||
      datos.activo === false
        ? "Suspendido"
        : "Activo"
  };
}


function obtenerIniciales(nombre){
  const partes = String(nombre || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!partes.length) return "CL";

  return partes
    .slice(0,2)
    .map(p => p.charAt(0).toUpperCase())
    .join("");
}

function tiempoRelativo(valor){
  const ms = obtenerMilisegundos(valor);
  if (!ms) return "Sin fecha";

  const diferencia = Math.max(0,Date.now() - ms);
  const minutos = Math.floor(diferencia / 60000);

  if (minutos < 1) return "Ahora";
  if (minutos < 60) return `Hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} ${horas === 1 ? "hora" : "horas"}`;

  const dias = Math.floor(horas / 24);
  return `Hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

function reconstruirAutorizaciones(){
  state.authorizations = state.vehicles
    .filter(v =>
      v.estadoMembresiaVehiculo === "pendiente_autorizacion" ||
      v.requiereAutorizacion === true
    )
    .map(v => {
      const cliente = state.clients.find(c => c.id === v.uidCliente);
      const nombre = cliente?.name || "Cliente";
      const membresia =
        v.numeroMembresiaSolicitada ||
        cliente?.membership ||
        "Sin número";

      return {
        vehicleId: v.id,
        uidCliente: v.uidCliente,
        path: v.path,
        initials: obtenerIniciales(nombre),
        name: nombre,
        detail: `Vehículo: ${v.placas || "Sin placas"} | ${v.marca || ""} ${v.subMarca || ""}`.trim(),
        type: "Vehículo",
        time: tiempoRelativo(v.solicitudMembresiaEn || v.creadoEn),
        membership: membresia,
        raw: v.raw
      };
    })
    .sort((a,b) =>
      obtenerMilisegundos(b.raw?.solicitudMembresiaEn || b.raw?.creadoEn) -
      obtenerMilisegundos(a.raw?.solicitudMembresiaEn || a.raw?.creadoEn)
    );
}


function servicioMantieneProveedorOcupado(servicio){
  if (!servicio?.uidProveedor) return false;

  return [
    "Asignado",
    "En camino",
    "En sitio"
  ].includes(servicio.estado);
}

function obtenerUidsProveedoresOcupados(){
  return new Set(
    state.services
      .filter(servicioMantieneProveedorOcupado)
      .map(s => s.uidProveedor)
      .filter(Boolean)
  );
}

function estadoProveedorEnTiempoReal(proveedor){
  const ocupados = obtenerUidsProveedoresOcupados();

  if (ocupados.has(proveedor.id)) {
    return "Ocupado";
  }

  if (proveedor.status === "Ocupado") {
    return "Disponible";
  }

  return proveedor.status;
}

function recalcularKpis(){
  const contarEstado = estado =>
    state.services.filter(servicio => servicio.estado === estado).length;

  kpiTopData[0][1] = String(contarEstado("Pendiente"));
  kpiTopData[1][1] = String(contarEstado("Asignado"));
  kpiTopData[2][1] = String(contarEstado("En camino"));
  kpiTopData[3][1] = String(contarEstado("En sitio"));
  kpiTopData[4][1] = String(
    state.services.filter(
      s => s.estado === "Finalizado" && esHoy(s.fechaFinalizacion || s.fecha)
    ).length
  );
  kpiTopData[5][1] = String(
    state.services.filter(
      s => s.estado === "Cancelado" &&
      esHoy(
        s.raw?.fechaCancelacion ||
        s.raw?.canceladoEn ||
        s.raw?.actualizadoEn ||
        s.fecha
      )
    ).length
  );

  const uidsOcupados = obtenerUidsProveedoresOcupados();
  const ocupados = state.providers.filter(p => uidsOcupados.has(p.id)).length;
  const disponibles = state.providers.filter(
    p =>
      !uidsOcupados.has(p.id) &&
      (
        p.status === "Disponible" ||
        p.status === "Ocupado"
      )
  ).length;
  const conectados = disponibles + ocupados;
  const membresias = state.clients.filter(c => c.hasMembership).length;

  const ingresosHoy = state.services
    .filter(
      s =>
        s.estado === "Finalizado" &&
        esHoy(s.fechaFinalizacion || s.fecha)
    )
    .reduce(
      (total,s) => total + (Number(s.monto) || 0),
      0
    );

  kpiBottomData[0][1] = String(disponibles);
  kpiBottomData[1][1] = String(ocupados);
  kpiBottomData[2][1] = state.clients.length.toLocaleString("es-MX");
  kpiBottomData[3][1] = membresias.toLocaleString("es-MX");
  kpiBottomData[4][1] = String(state.authorizations.length);
  kpiBottomData[5][1] = formatearDinero(ingresosHoy);

  kpiBottomData[0].sub = `de ${conectados} conectados`;
  kpiBottomData[1].sub = `de ${conectados} conectados`;
  kpiBottomData[2].sub = "en total";
  kpiBottomData[3].sub = "membresías detectadas";
  kpiBottomData[4].sub = "se conectará después";
  kpiBottomData[5].sub = ingresosHoy > 0 ? "servicios finalizados hoy" : "sin ingresos finalizados hoy";

  const badge = document.getElementById("authBadge");
  if (badge) badge.textContent = String(state.authorizations.length);

  renderKpis();
}

function renderKpis(){
  const make = ([label,value,icon,cls],index,bottom=false) => `
    <article class="kpi ${cls}">
      <div class="label">${escaparHtml(label)}</div>
      <div class="value">${escaparHtml(value)}</div>
      <div class="sub">${
        escaparHtml(
          bottom
            ? (
                (bottom && (index >= 0) && kpiBottomData[index].sub) ||
                ""
              )
            : "Ver detalles →"
        )
      }</div>
      <div class="icon">${icon}</div>
      ${
        bottom
          ? ""
          : `<svg class="spark" viewBox="0 0 80 28"><polyline points="2,22 12,18 20,20 28,10 36,14 45,8 56,13 66,9 78,12" fill="none" stroke="currentColor" stroke-width="2"/></svg>`
      }
    </article>
  `;

  const top = document.getElementById("kpiTop");
  const bottom = document.getElementById("kpiBottom");

  if (top) {
    top.innerHTML = kpiTopData.map((d,i) => make(d,i)).join("");
  }

  if (bottom) {
    bottom.innerHTML = kpiBottomData.map((d,i) => make(d,i,true)).join("");
  }
}

function renderServices(){
  const cuerpo = document.getElementById("recentServicesBody");
  if (!cuerpo) return;

  const recientes = [...state.services]
    .sort((a,b) => obtenerMilisegundos(b.fecha) - obtenerMilisegundos(a.fecha))
    .slice(0,5);

  if (!recientes.length) {
    cuerpo.innerHTML = `
      <tr>
        <td colspan="5">No hay servicios registrados en Firebase.</td>
      </tr>
    `;
  } else {
    cuerpo.innerHTML = recientes.map(s => `
      <tr>
        <td><b>${escaparHtml(s.folio)}</b></td>
        <td>${escaparHtml(s.cliente)}</td>
        <td>${escaparHtml(s.servicio)}</td>
        <td><span class="statusBadge ${statusClass(s.estado)}">${escaparHtml(s.estado)}</span></td>
        <td>${escaparHtml(s.hora)}</td>
      </tr>
    `).join("");
  }

  renderAllServices();
}

function renderAllServices(){
  const cuerpo = document.getElementById("allServicesBody");
  if (!cuerpo) return;

  const q = (document.getElementById("serviceSearch")?.value || "").toLowerCase();
  const st = document.getElementById("serviceStatusFilter")?.value || "";
  const ty = document.getElementById("serviceTypeFilter")?.value || "";

  const list = [...state.services]
    .sort((a,b) => obtenerMilisegundos(b.fecha) - obtenerMilisegundos(a.fecha))
    .filter(s => {
      const txt = `${s.folio} ${s.cliente} ${s.servicio} ${s.proveedor}`.toLowerCase();

      return (
        (!q || txt.includes(q)) &&
        (!st || s.estado === st) &&
        (!ty || s.servicio === ty)
      );
    });

  if (!list.length) {
    cuerpo.innerHTML = `
      <tr>
        <td colspan="7">No hay servicios que coincidan con los filtros.</td>
      </tr>
    `;
    return;
  }

  cuerpo.innerHTML = list.map(s => `
    <tr>
      <td><b>${escaparHtml(s.folio)}</b></td>
      <td>${escaparHtml(s.cliente)}</td>
      <td>${escaparHtml(s.servicio)}</td>
      <td>${escaparHtml(s.proveedor)}</td>
      <td><span class="statusBadge ${statusClass(s.estado)}">${escaparHtml(s.estado)}</span></td>
      <td>${escaparHtml(s.hora)}</td>
      <td><button class="tableAction" onclick="openService('${escaparHtml(s.folio)}')">Ver</button></td>
    </tr>
  `).join("");
}

function renderAuthorizations(){
  const resumen = document.getElementById("pendingAuthorizations");
  const tarjetas = document.getElementById("authorizationCards");

  if (resumen) {
    resumen.innerHTML = state.authorizations.length
      ? state.authorizations.map(a => `
          <div class="authRow">
            <div class="miniAvatar">${escaparHtml(a.initials)}</div>
            <div class="rowMain"><b>${escaparHtml(a.name)}</b><span>${escaparHtml(a.detail)}</span></div>
            <div class="rowMain"><b>${escaparHtml(a.type)}</b><span>${escaparHtml(a.time)}</span></div>
            <span class="pill">Pendiente</span>
          </div>
        `).join("")
      : `
          <div class="authRow">
            <div class="miniAvatar">✓</div>
            <div class="rowMain">
              <b>Sin autorizaciones pendientes</b>
              <span>No hay vehículos esperando revisión.</span>
            </div>
            <div></div>
            <span class="statusBadge status-finalizado">0</span>
          </div>
        `;
  }

  if (tarjetas) {
    tarjetas.innerHTML = state.authorizations.length
      ? state.authorizations.map((a,i) => `
          <article class="authCard" data-auth="${i}">
            <div class="miniAvatar">${escaparHtml(a.initials)}</div>
            <h3>${escaparHtml(a.name)}</h3>
            <p>${escaparHtml(a.detail)}</p>
            <p><b>Membresía:</b> ${escaparHtml(a.membership || "Sin número")}<br><b>Tipo:</b> ${escaparHtml(a.type)}<br><b>Solicitud:</b> ${escaparHtml(a.time)}</p>
            <div class="cardActions">
              <button class="approve" onclick="approveAuth(${i})">Aprobar</button>
              <button class="reject" onclick="rejectAuth(${i})">Rechazar</button>
              <button onclick="openAuth(${i})">Ver expediente</button>
            </div>
          </article>
        `).join("")
      : `
          <article class="authCard">
            <div class="miniAvatar">✓</div>
            <h3>Sin autorizaciones pendientes</h3>
            <p>No hay vehículos esperando revisión.</p>
          </article>
        `;
  }
}

function renderProviders(){
  const destacados = document.getElementById("featuredProviders");
  const grid = document.getElementById("providersGrid");

  const proveedoresTiempoReal = state.providers.map(p => ({
    ...p,
    status: estadoProveedorEnTiempoReal(p)
  }));

  const ordenados = [...proveedoresTiempoReal].sort((a,b) => {
    if (a.status === "Disponible" && b.status !== "Disponible") return -1;
    if (b.status === "Disponible" && a.status !== "Disponible") return 1;
    return Number(b.rating) - Number(a.rating);
  });

  if (destacados) {
    destacados.innerHTML = ordenados.length
      ? ordenados.slice(0,4).map((p,i) => `
          <div class="providerRow">
            <div class="miniAvatar">${p.type === "Grúa" ? "🚚" : p.type === "Abogado" ? "⚖" : "👤"}</div>
            <div class="rowMain"><b>${escaparHtml(p.name)}</b><span>${escaparHtml(p.type)}</span></div>
            <span class="rating">★ ${escaparHtml(p.rating)}</span>
            <span class="statusBadge ${statusClass(p.status)}">${escaparHtml(p.status)}</span>
            <span class="rowMain"><span>${escaparHtml(p.services)} servicios</span></span>
          </div>
        `).join("")
      : `
          <div class="providerRow">
            <div class="miniAvatar">!</div>
            <div class="rowMain"><b>Sin proveedores</b><span>No se encontraron documentos en Firebase.</span></div>
            <span></span><span></span><span></span>
          </div>
        `;
  }

  if (grid) {
    grid.innerHTML = ordenados.length
      ? ordenados.map((p,i) => `
          <article class="providerCard">
            <div class="miniAvatar">${p.type === "Grúa" ? "🚚" : p.type === "Abogado" ? "⚖" : "👤"}</div>
            <h3>${escaparHtml(p.name)}</h3>
            <p>
              ${escaparHtml(p.type)}<br>
              ★ ${escaparHtml(p.rating)}<br>
              ${escaparHtml(p.services)} servicios realizados<br>
              ${escaparHtml(p.telefono)}
            </p>
            <span class="statusBadge ${statusClass(p.status)}">${escaparHtml(p.status)}</span>
            <div class="cardActions"><button onclick="openProvider('${escaparHtml(p.id)}')">Ver ficha</button></div>
          </article>
        `).join("")
      : `
          <article class="providerCard">
            <div class="miniAvatar">!</div>
            <h3>Sin proveedores</h3>
            <p>No se encontraron proveedores en la colección.</p>
          </article>
        `;
  }
}

function renderClients(){
  const cuerpo = document.getElementById("clientsBody");
  if (!cuerpo) return;

  const ordenados = [...state.clients].sort((a,b) => a.name.localeCompare(b.name,"es"));

  if (!ordenados.length) {
    cuerpo.innerHTML = `
      <tr>
        <td colspan="6">No se encontraron clientes en Firebase.</td>
      </tr>
    `;
    return;
  }

  cuerpo.innerHTML = ordenados.map(c => `
    <tr>
      <td><b>${escaparHtml(c.name)}</b></td>
      <td>${escaparHtml(c.phone)}</td>
      <td>${escaparHtml(c.membership)}</td>
      <td>${escaparHtml(c.vehicles)}</td>
      <td>${escaparHtml(c.services)}</td>
      <td><span class="statusBadge ${c.status === "Activo" ? "status-disponible" : "status-cancelado"}">${escaparHtml(c.status)}</span></td>
    </tr>
  `).join("");
}

function setToday(){
  const d = new Date();
  const etiqueta = document.getElementById("todayLabel");

  if (etiqueta) {
    etiqueta.textContent = d.toLocaleDateString("es-MX",{
      weekday:"short",
      day:"2-digit",
      month:"long",
      year:"numeric"
    });
  }
}

let liveMap, fullMap;

function makeDivIcon(symbol,bg){
  return L.divIcon({
    className:"",
    html:`<div style="width:26px;height:26px;border-radius:50%;background:${bg};color:#fff;border:2px solid white;display:grid;place-items:center;font-size:13px;box-shadow:0 3px 8px rgba(0,0,0,.35)">${symbol}</div>`,
    iconSize:[26,26],
    iconAnchor:[13,13]
  });
}

/*
  El mapa se conserva exactamente como estaba visualmente.
  La conexión de ubicaciones reales se hará en la siguiente etapa.
*/
function addMapMarkers(map){
  const markers = [
    [19.4326,-99.1332,"👤","#1579d0","Cliente"],
    [19.5007,-99.2653,"⚖","#8d42dc","Ajustador"],
    [19.4270,-99.1677,"⚖","#8d42dc","Ajustador"],
    [19.4550,-99.1250,"🚚","#f26a21","Grúa"],
    [19.4100,-99.0900,"🚚","#f26a21","Grúa"],
    [19.4780,-99.1150,"🚗","#278b43","Auxilio"],
    [19.3920,-99.1700,"🚗","#278b43","Auxilio"],
    [19.4440,-99.2100,"⚖","#8d42dc","Abogado"]
  ];

  markers.forEach(m =>
    L.marker(
      [m[0],m[1]],
      { icon:makeDivIcon(m[2],m[3]) }
    )
      .addTo(map)
      .bindPopup(`<b>${m[4]}</b><br>Proveedor AS CLICK`)
  );

  L.circle(
    [19.405,-99.115],
    {
      radius:2500,
      color:"#ff493e",
      weight:2,
      fillOpacity:.08
    }
  )
    .addTo(map)
    .bindPopup("Servicio activo");
}

function initMaps(){
  if (typeof L === "undefined") return;

  liveMap = L.map(
    "liveMap",
    {
      zoomControl:true,
      attributionControl:false
    }
  ).setView([19.43,-99.16],11);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom:19 }
  ).addTo(liveMap);

  addMapMarkers(liveMap);
}

function initFullMap(){
  if (fullMap || typeof L === "undefined") return;

  fullMap = L.map(
    "fullMap",
    { attributionControl:false }
  ).setView([19.43,-99.16],11);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom:19 }
  ).addTo(fullMap);

  addMapMarkers(fullMap);
}

function obtenerIngresosUltimos7Dias(){
  const dias = [];

  for (let i = 6; i >= 0; i--) {
    const fecha = new Date();
    fecha.setHours(0,0,0,0);
    fecha.setDate(fecha.getDate() - i);

    dias.push({
      fecha,
      valor:0
    });
  }

  state.services.forEach(servicio => {
    if (servicio.estado !== "Finalizado") return;

    const ms = obtenerMilisegundos(
      servicio.fechaFinalizacion ||
      servicio.fecha
    );
    if (!ms) return;

    const fechaServicio = new Date(ms);
    fechaServicio.setHours(0,0,0,0);

    const dia = dias.find(item =>
      item.fecha.getTime() === fechaServicio.getTime()
    );

    if (dia) {
      dia.valor += Number(servicio.monto) || 0;
    }
  });

  return dias;
}

function drawIncomeChart(){
  const c = document.getElementById("incomeChart");
  if (!c) return;

  const ctx = c.getContext("2d");
  const w = c.width;
  const h = c.height;
  const pad = 42;

  const dias = obtenerIngresosUltimos7Dias();
  const vals = dias.map(d => d.valor);
  const labels = dias.map(d =>
    d.fecha.toLocaleDateString("es-MX",{
      day:"2-digit",
      month:"short"
    })
  );

  const maxValor = Math.max(...vals,1000);
  const max = Math.ceil(maxValor / 1000) * 1000;

  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = "#29435c";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#9db1c5";
  ctx.font = "12px Segoe UI";

  for (let i = 0; i < 5; i++) {
    const y = pad + i * ((h - pad * 2) / 4);
    const etiqueta = max - (max / 4) * i;

    ctx.beginPath();
    ctx.moveTo(pad,y);
    ctx.lineTo(w-pad,y);
    ctx.stroke();

    ctx.fillText(
      `$${Math.round(etiqueta).toLocaleString("es-MX")}`,
      4,
      y + 4
    );
  }

  const pts = vals.map((v,i) => [
    pad + i * ((w-pad*2) / Math.max(vals.length-1,1)),
    h-pad-(v/max)*(h-pad*2)
  ]);

  ctx.strokeStyle = "#2f8fff";
  ctx.lineWidth = 4;
  ctx.beginPath();

  pts.forEach((p,i) =>
    i
      ? ctx.lineTo(...p)
      : ctx.moveTo(...p)
  );

  ctx.stroke();

  pts.forEach((p,i) => {
    ctx.fillStyle = "#d7ecff";
    ctx.beginPath();
    ctx.arc(p[0],p[1],4,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "#9db1c5";
    ctx.fillText(
      labels[i],
      p[0]-17,
      h-14
    );
  });

  const total = vals.reduce((suma,valor) => suma + valor,0);
  const totalElemento = document.querySelector(".chartPanel .panelHeader strong");

  if (totalElemento) {
    totalElemento.textContent = `Total: ${formatearDinero(total)}`;
  }
}

const titles = {
  inicio:["Dashboard","Bienvenido, Administrador"],
  servicios:["Servicios","Control y seguimiento operativo"],
  mapa:["Mapa en vivo","Proveedores y servicios activos"],
  autorizaciones:["Autorizaciones","Solicitudes pendientes de revisión"],
  clientes:["Clientes","Administración de clientes"],
  vehiculos:["Vehículos","Control de vehículos"],
  membresias:["Membresías","Administración de membresías"],
  proveedores:["Proveedores","Control de proveedores"],
  gremios:["MONTEC / ACME","Afiliaciones gremiales"],
  pagos:["Pagos","Ingresos y liquidaciones"],
  incidencias:["Incidencias","Casos y soporte"],
  reportes:["Reportes","Indicadores y estadísticas"],
  auditoria:["Auditoría","Registro de movimientos"],
  administradores:["Administradores","Roles y permisos"],
  configuracion:["Configuración","Parámetros del sistema"],
  ayuda:["Ayuda","Soporte y documentación"]
};

function changeSection(section){
  document
    .querySelectorAll(".pageSection")
    .forEach(s => s.classList.remove("active"));

  document
    .getElementById(`section-${section}`)
    ?.classList.add("active");

  document
    .querySelectorAll(".navItem")
    .forEach(n =>
      n.classList.toggle(
        "active",
        n.dataset.section === section
      )
    );

  const [t,sub] = titles[section] || [section,""];

  document.getElementById("pageTitle").textContent = t;
  document.getElementById("pageSubtitle").textContent = sub;

  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("mobileOverlay").classList.remove("active");

  if (section === "mapa") {
    setTimeout(() => {
      initFullMap();
      fullMap?.invalidateSize();
    },80);
  }

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });
}

document
  .querySelectorAll(".navItem")
  .forEach(b =>
    b.addEventListener(
      "click",
      () => changeSection(b.dataset.section)
    )
  );

document
  .querySelectorAll("[data-section-link]")
  .forEach(b =>
    b.addEventListener(
      "click",
      () => changeSection(b.dataset.sectionLink)
    )
  );

function openModal(title,html){
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalContent").innerHTML = html;
  document.getElementById("modalOverlay").hidden = false;
}

function closeModal(){
  document.getElementById("modalOverlay").hidden = true;
}

document
  .getElementById("modalClose")
  .addEventListener("click",closeModal);

document
  .getElementById("modalOverlay")
  .addEventListener("click",e => {
    if (e.target.id === "modalOverlay") {
      closeModal();
    }
  });

window.openService = folio => {
  const s = state.services.find(x => x.folio === folio);
  if (!s) return;

  const datos = s.raw || {};
  const ubicacion =
    datos.ubicacion?.enlaceGoogleMaps ||
    datos.ubicacionDatos?.enlaceGoogleMaps ||
    datos.ubicacion ||
    "";

  openModal(
    `Servicio ${s.folio}`,
    `
      <p><b>Cliente:</b> ${escaparHtml(s.cliente)}</p>
      <p><b>Servicio:</b> ${escaparHtml(s.servicio)}</p>
      <p><b>Proveedor:</b> ${escaparHtml(s.proveedor)}</p>
      <p><b>Estado:</b> ${escaparHtml(s.estado)}</p>
      <p><b>Hora:</b> ${escaparHtml(s.hora)}</p>
      ${
        ubicacion
          ? `<p><b>Ubicación:</b> ${escaparHtml(String(ubicacion))}</p>`
          : ""
      }
      <div class="cardActions">
        <button>Reasignar proveedor</button>
        <button>Ver ubicación</button>
      </div>
    `
  );
};

window.openProvider = id => {
  const p = state.providers.find(item => item.id === id);
  if (!p) return;

  openModal(
    p.name,
    `
      <p><b>Tipo:</b> ${escaparHtml(p.type)}</p>
      <p><b>Calificación:</b> ★ ${escaparHtml(p.rating)}</p>
      <p><b>Servicios:</b> ${escaparHtml(p.services)}</p>
      <p><b>Estado:</b> ${escaparHtml(p.status)}</p>
      <p><b>Teléfono:</b> ${escaparHtml(p.telefono)}</p>
    `
  );
};

window.openAuth = i => {
  const a = state.authorizations[i];
  if (!a) return;

  const v = a.raw || {};

  openModal(
    "Expediente de autorización",
    `
      <p><b>${escaparHtml(a.name)}</b></p>
      <p><b>Vehículo:</b> ${escaparHtml(v.marca || "")} ${escaparHtml(v.subMarca || "")}</p>
      <p><b>Placas:</b> ${escaparHtml(v.placas || "Sin placas")}</p>
      <p><b>Serie:</b> ${escaparHtml(v.serie || "Sin serie")}</p>
      <p><b>Color:</b> ${escaparHtml(v.color || "Sin color")}</p>
      <p><b>Membresía solicitada:</b> ${escaparHtml(a.membership || "Sin número")}</p>
      <p><b>Solicitud:</b> ${escaparHtml(a.time)}</p>
      <div class="cardActions">
        <button class="approve" onclick="approveAuth(${i})">Aprobar</button>
        <button class="reject" onclick="rejectAuth(${i})">Rechazar</button>
      </div>
    `
  );
};

async function actualizarVehiculoPrincipalSiCoincide(a,cambios){
  if (!a?.uidCliente || !a?.vehicleId) return;

  const usuarioRef = firestoreDoc(db,"usuarios",a.uidCliente);
  const usuarioSnap = await firestoreGetDoc(usuarioRef);

  if (!usuarioSnap.exists()) return;

  const usuario = usuarioSnap.data();
  const principalId = usuario.vehiculoPrincipal?.id || "";

  if (principalId !== a.vehicleId) return;

  await firestoreUpdateDoc(usuarioRef,{
    "vehiculoPrincipal.membresiaAplicada": cambios.membresiaAplicada,
    "vehiculoPrincipal.estadoMembresiaVehiculo": cambios.estadoMembresiaVehiculo,
    "vehiculoPrincipal.requiereAutorizacion": cambios.requiereAutorizacion,
    actualizadoEn: firestoreServerTimestamp()
  });
}

window.approveAuth = async i => {
  const a = state.authorizations[i];
  if (!a || !firestoreUpdateDoc || !firestoreDoc) return;

  try {
    const vehiculoRef = firestoreDoc(
      db,
      "usuarios",
      a.uidCliente,
      "vehiculos",
      a.vehicleId
    );

    const cambios = {
      membresiaAplicada: true,
      estadoMembresiaVehiculo: "activo",
      requiereAutorizacion: false,
      autorizacionEstado: "aprobada",
      autorizacionAprobadaEn: firestoreServerTimestamp(),
      actualizadoEn: firestoreServerTimestamp()
    };

    await firestoreUpdateDoc(vehiculoRef,cambios);
    await actualizarVehiculoPrincipalSiCoincide(a,cambios);

    closeModal();
  } catch (error) {
    console.error("Error aprobando autorización:",error);

    openModal(
      "No fue posible aprobar",
      `<p>Firebase rechazó la actualización.</p><p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

window.rejectAuth = async i => {
  const a = state.authorizations[i];
  if (!a || !firestoreUpdateDoc || !firestoreDoc) return;

  try {
    const vehiculoRef = firestoreDoc(
      db,
      "usuarios",
      a.uidCliente,
      "vehiculos",
      a.vehicleId
    );

    const cambios = {
      membresiaAplicada: false,
      estadoMembresiaVehiculo: "sin_membresia",
      requiereAutorizacion: false,
      autorizacionEstado: "rechazada",
      autorizacionRechazadaEn: firestoreServerTimestamp(),
      actualizadoEn: firestoreServerTimestamp()
    };

    await firestoreUpdateDoc(vehiculoRef,cambios);
    await actualizarVehiculoPrincipalSiCoincide(a,cambios);

    closeModal();
  } catch (error) {
    console.error("Error rechazando autorización:",error);

    openModal(
      "No fue posible rechazar",
      `<p>Firebase rechazó la actualización.</p><p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

document
  .getElementById("menuBtn")
  .addEventListener("click",() => {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("mobileOverlay").classList.toggle("active");
  });

document
  .getElementById("mobileOverlay")
  .addEventListener("click",() => {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("mobileOverlay").classList.remove("active");
  });

document
  .getElementById("refreshBtn")
  .addEventListener("click",() => {
    renderKpis();
    renderServices();
    renderAuthorizations();
    renderProviders();
    renderClients();
    drawIncomeChart();
  });

[
  "serviceSearch",
  "serviceStatusFilter",
  "serviceTypeFilter"
].forEach(id =>
  document
    .getElementById(id)
    ?.addEventListener("input",renderAllServices)
);

document
  .getElementById("globalSearch")
  .addEventListener("keydown",e => {
    if (e.key === "Enter") {
      changeSection("servicios");
      document.getElementById("serviceSearch").value = e.target.value;
      renderAllServices();
    }
  });

document
  .getElementById("newServiceBtn")
  .addEventListener("click",() =>
    openModal(
      "Crear servicio manual",
      "<p>La creación manual se conectará después de terminar la lectura y control de los servicios reales.</p>"
    )
  );

function actualizarInterfazFirebase(){
  recalcularKpis();
  renderServices();
  renderProviders();
  renderClients();
  renderAuthorizations();
  drawIncomeChart();
}

async function iniciarFirebaseAdmin(){
  try {
    const firebaseConfigModule = await import("./firebase-config.js");

    const firestoreModule = await import(
      "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"
    );

    db = firebaseConfigModule.db;
    firestoreCollection = firestoreModule.collection;
    firestoreOnSnapshot = firestoreModule.onSnapshot;
    firestoreCollectionGroup = firestoreModule.collectionGroup;
    firestoreDoc = firestoreModule.doc;
    firestoreGetDoc = firestoreModule.getDoc;
    firestoreUpdateDoc = firestoreModule.updateDoc;
    firestoreServerTimestamp = firestoreModule.serverTimestamp;

    if (!db) {
      throw new Error("firebase-config.js no exporta db.");
    }

    firebaseReady = true;

    escucharClientes();
    escucharProveedores();
    escucharServicios();
    escucharVehiculos();
  } catch (error) {
    console.error("No fue posible iniciar Firebase en Admin:",error);

    openModal(
      "Firebase no conectado",
      `
        <p>No fue posible conectar el Panel Administrativo con Firebase.</p>
        <p>Confirma que <b>firebase-config.js</b> esté en la misma carpeta que <b>app.js</b> e <b>index.html</b>.</p>
        <p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>
      `
    );
  }
}

function escucharClientes(){
  if (!firebaseReady) return;

  unsubscribeClients?.();

  unsubscribeClients = firestoreOnSnapshot(
    firestoreCollection(db,"usuarios"),
    snapshot => {
      state.clients = snapshot.docs.map(convertirCliente);
      reconstruirAutorizaciones();
      actualizarInterfazFirebase();
    },
    error => {
      console.error("Error leyendo usuarios:",error);
    }
  );
}

function escucharProveedores(){
  if (!firebaseReady) return;

  unsubscribeProviders?.();

  unsubscribeProviders = firestoreOnSnapshot(
    firestoreCollection(db,"proveedores"),
    snapshot => {
      state.providers = snapshot.docs.map(convertirProveedor);
      actualizarInterfazFirebase();
    },
    error => {
      console.error("Error leyendo proveedores:",error);
    }
  );
}


function escucharVehiculos(){
  if (!firebaseReady || !firestoreCollectionGroup) return;

  unsubscribeVehicles?.();

  unsubscribeVehicles = firestoreOnSnapshot(
    firestoreCollectionGroup(db,"vehiculos"),
    snapshot => {
      state.vehicles = snapshot.docs.map(documento => {
        const datos = documento.data();
        const uidCliente = documento.ref.parent.parent?.id || "";

        return {
          id: documento.id,
          uidCliente,
          path: documento.ref.path,
          marca: datos.marca || "",
          subMarca: datos.subMarca || "",
          color: datos.color || "",
          placas: datos.placas || "",
          serie: datos.serie || "",
          membresiaAplicada: datos.membresiaAplicada === true,
          estadoMembresiaVehiculo: datos.estadoMembresiaVehiculo || "",
          requiereAutorizacion: datos.requiereAutorizacion === true,
          numeroMembresiaSolicitada: datos.numeroMembresiaSolicitada || "",
          solicitudMembresiaEn: datos.solicitudMembresiaEn || null,
          creadoEn: datos.creadoEn || null,
          raw: datos
        };
      });

      reconstruirAutorizaciones();
      actualizarInterfazFirebase();
    },
    error => {
      console.error("Error leyendo vehículos:",error);
    }
  );
}

function escucharServicios(){
  if (!firebaseReady) return;

  unsubscribeServices?.();

  unsubscribeServices = firestoreOnSnapshot(
    firestoreCollection(db,"solicitudes"),
    snapshot => {
      state.services = snapshot.docs.map(convertirSolicitud);
      actualizarInterfazFirebase();
    },
    error => {
      console.error("Error leyendo solicitudes:",error);
    }
  );
}

window.addEventListener("beforeunload",() => {
  unsubscribeServices?.();
  unsubscribeProviders?.();
  unsubscribeClients?.();
  unsubscribeVehicles?.();
});

renderKpis();
renderServices();
renderAuthorizations();
renderProviders();
renderClients();
setToday();
initMaps();
drawIncomeChart();
iniciarFirebaseAdmin();
