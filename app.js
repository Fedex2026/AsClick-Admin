const state = {
  services: [],
  authorizations: [],
  providers: [],
  clients: [],
  vehicles: [],
  memberships: [],
  towQuotes: new Map()
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
let firestoreSetDoc = null;
let firestoreWriteBatch = null;
let firestoreTimestamp = null;
let firestoreGetDocs = null;
let firestoreRunTransaction = null;

let unsubscribeServices = null;
let unsubscribeProviders = null;
let unsubscribeClients = null;
let unsubscribeVehicles = [];
let unsubscribeMemberships = null;
let towQuoteUnsubscribers = new Map();
const vehicleSnapshotsByUser = new Map();

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
    pendiente_cotizacion: "Pendiente cotización",
    esperando_autorizacion_cliente: "Esperando autorización cliente",
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


function calcularCostoServicioFallback(datos = {}, tipoVisible = ""){
  const tipo = String(
    datos.servicio?.nombre ||
    datos.servicio?.tipo ||
    datos.tipoServicio ||
    tipoVisible ||
    ""
  )
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/_/g," ");

  if (tipo === "grua") {
    return 0;
  }

  const cliente = datos.cliente || {};
  const tieneMembresia =
    cliente.tieneMembresia === true &&
    String(cliente.estadoMembresia || "").toLowerCase() === "activa";

  if (!tieneMembresia) {
    const sinMembresia = {
      ajustador: 1800,
      abogado: 2400,
      "auxilio vial": 380
    };
    return sinMembresia[tipo] || 0;
  }

  if (String(cliente.tipoCliente || "").toLowerCase() === "servicio_publico") {
    const servicioPublico = {
      ajustador: 500,
      abogado: 850,
      "auxilio vial": 120
    };
    return servicioPublico[tipo] || 0;
  }

  const particular = {
    ajustador: 750,
    abogado: 900,
    "auxilio vial": 190
  };

  return particular[tipo] || 0;
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

  const montoGuardado =
    convertirImporteANumero(
      datos.total ??
      datos.importeTotal ??
      datos.precioCliente ??
      datos.costoCliente ??
      datos.monto ??
      datos.costoServicio ??
      0
    );

  const monto =
    montoGuardado > 0
      ? montoGuardado
      : calcularCostoServicioFallback(
          datos,
          normalizarTipoServicio(tipo)
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
  const estadoConexion = String(
    datos.estadoConexion ||
    datos.estado ||
    datos.status ||
    ""
  ).trim().toLowerCase();

  if (
    datos.bajaAdmin === true ||
    datos.suspendido === true ||
    datos.activo === false ||
    estadoConexion === "suspendido" ||
    estadoConexion === "baja"
  ) {
    return "Baja";
  }

  if (
    datos.ocupado === true ||
    estadoConexion === "ocupado" ||
    Boolean(datos.servicioActualId)
  ) {
    return "Ocupado";
  }

  if (
    datos.disponible === true ||
    estadoConexion === "disponible" ||
    estadoConexion === "conectado" ||
    estadoConexion === "en_linea"
  ) {
    return "Disponible";
  }

  if (
    estadoConexion === "desconectado" ||
    datos.disponible === false
  ) {
    return "Desconectado";
  }

  return "Disponible";
}

function convertirProveedor(doc){
  const datos = doc.data();

  return {
    id: doc.id,
    uid: texto(
      datos.uid ||
      datos.usuarioId ||
      datos.uidProveedor ||
      doc.id,
      doc.id
    ),
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
      .map(s => String(s.uidProveedor || "").trim())
      .filter(Boolean)
  );
}

function proveedorCoincideConUid(proveedor, uid){
  const objetivo = String(uid || "").trim();
  if (!objetivo) return false;

  const candidatos = [
    proveedor?.id,
    proveedor?.uid,
    proveedor?.raw?.uid,
    proveedor?.raw?.usuarioId,
    proveedor?.raw?.uidProveedor
  ]
    .map(v => String(v || "").trim())
    .filter(Boolean);

  return candidatos.includes(objetivo);
}

function proveedorEstaDeBaja(proveedor){
  return (
    proveedor?.status === "Baja" ||
    proveedor?.raw?.bajaAdmin === true ||
    proveedor?.raw?.suspendido === true ||
    proveedor?.raw?.activo === false ||
    String(proveedor?.raw?.estadoConexion || "").toLowerCase() === "suspendido"
  );
}

function proveedorTieneServicioActivo(proveedor){
  if (proveedorEstaDeBaja(proveedor)) return false;

  const uidsOcupados = obtenerUidsProveedoresOcupados();

  if (
    proveedor?.status === "Ocupado" ||
    proveedor?.raw?.estadoConexion === "ocupado" ||
    Boolean(proveedor?.raw?.servicioActualId)
  ) {
    return true;
  }

  return [...uidsOcupados].some(uid =>
    proveedorCoincideConUid(proveedor,uid)
  );
}

function estadoProveedorEnTiempoReal(proveedor){
  if (proveedorEstaDeBaja(proveedor)) {
    return "Baja";
  }

  if (proveedorTieneServicioActivo(proveedor)) {
    return "Ocupado";
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

  const proveedoresOcupados = state.providers.filter(
    proveedorTieneServicioActivo
  );

  const uidsServiciosActivos = obtenerUidsProveedoresOcupados();

  const ocupadosSinFicha = [...uidsServiciosActivos].filter(uid =>
    !state.providers.some(p => proveedorCoincideConUid(p,uid))
  ).length;

  const ocupados =
    proveedoresOcupados.length +
    ocupadosSinFicha;

  const disponibles = state.providers.filter(
    p =>
      !proveedorTieneServicioActivo(p) &&
      p.status === "Disponible"
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
  const proveedoresPendientesAutorizacion =
    obtenerProveedoresPendientesAutorizacion().length;

  const totalAutorizacionesPendientes =
    state.authorizations.length +
    proveedoresPendientesAutorizacion;

  kpiBottomData[4][1] = String(totalAutorizacionesPendientes);
  kpiBottomData[5][1] = formatearDinero(ingresosHoy);

  kpiBottomData[0].sub = `de ${conectados} conectados`;
  kpiBottomData[1].sub = `de ${conectados} conectados`;
  kpiBottomData[2].sub = "en total";
  kpiBottomData[3].sub = "membresías detectadas";
  kpiBottomData[4].sub =
    totalAutorizacionesPendientes > 0
      ? "pendientes de revisión"
      : "sin pendientes";
  kpiBottomData[5].sub = ingresosHoy > 0 ? "servicios finalizados hoy" : "sin importes registrados";

  const badge = document.getElementById("authBadge");
  if (badge) {
    badge.textContent = String(totalAutorizacionesPendientes);
  }

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


function proveedorPendienteAutorizacion(proveedor){
  const datos = proveedor?.raw || {};

  const estado = String(
    datos.estado || ""
  ).trim().toLowerCase();

  const estadoSolicitud = String(
    datos.estadoSolicitud || ""
  ).trim().toLowerCase();

  return (
    estado === "pendiente" ||
    estadoSolicitud === "pendiente"
  );
}

function obtenerProveedoresPendientesAutorizacion(){
  return state.providers.filter(
    proveedor => proveedorPendienteAutorizacion(proveedor)
  );
}

function fechaSolicitudProveedor(proveedor){
  const datos = proveedor?.raw || {};

  return formatearFecha(
    datos.fechaSolicitud ||
    datos.fechaRegistro ||
    datos.creadoEn ||
    datos.createdAt ||
    datos.altaEn ||
    null
  );
}

function detalleProveedorPendiente(proveedor){
  const datos = proveedor?.raw || {};

  return {
    id: proveedor.id,
    name: proveedor.name || "Proveedor",
    type: normalizarTipoServicio(
      datos.tipoProveedor ||
      datos.tipo ||
      datos.tipoServicio ||
      proveedor?.type ||
      "Proveedor"
    ),
    telefono:
      proveedor.telefono ||
      datos.telefono ||
      datos.celular ||
      "No registrado",
    correo:
      datos.correo ||
      datos.email ||
      "No registrado",
    unidad:
      datos.unidad?.tipoUnidad ||
      datos.unidad?.tipo ||
      datos.tipoUnidad ||
      datos.vehiculo?.tipo ||
      "No registrada",
    time:
      fechaSolicitudProveedor(proveedor)
  };
}

function renderAuthorizations(){
  const resumen = document.getElementById("pendingAuthorizations");
  const tarjetas = document.getElementById("authorizationCards");

  const vehiculosPendientes = state.authorizations || [];
  const proveedoresPendientes =
    obtenerProveedoresPendientesAutorizacion();

  const totalPendientes =
    vehiculosPendientes.length +
    proveedoresPendientes.length;

  if (resumen) {
    const filas = [];

    proveedoresPendientes.forEach(proveedor => {
      const p = detalleProveedorPendiente(proveedor);

      filas.push(`
        <div class="authRow">
          <div class="miniAvatar">P</div>
          <div class="rowMain">
            <b>${escaparHtml(p.name)}</b>
            <span>Proveedor nuevo · ${escaparHtml(p.telefono)}</span>
          </div>
          <div class="rowMain">
            <b>${escaparHtml(p.type)}</b>
            <span>${escaparHtml(p.time)}</span>
          </div>
          <span class="pill">Pendiente</span>
        </div>
      `);
    });

    vehiculosPendientes.forEach(a => {
      filas.push(`
        <div class="authRow">
          <div class="miniAvatar">${escaparHtml(a.initials)}</div>
          <div class="rowMain">
            <b>${escaparHtml(a.name)}</b>
            <span>${escaparHtml(a.detail)}</span>
          </div>
          <div class="rowMain">
            <b>${escaparHtml(a.type)}</b>
            <span>${escaparHtml(a.time)}</span>
          </div>
          <span class="pill">Pendiente</span>
        </div>
      `);
    });

    resumen.innerHTML = totalPendientes
      ? filas.join("")
      : `
        <div class="authRow">
          <div class="miniAvatar">✓</div>
          <div class="rowMain">
            <b>Sin autorizaciones pendientes</b>
            <span>No hay proveedores ni vehículos esperando revisión.</span>
          </div>
          <div></div>
          <span class="statusBadge status-finalizado">0</span>
        </div>
      `;
  }

  if (tarjetas) {
    const cards = [];

    proveedoresPendientes.forEach(proveedor => {
      const p = detalleProveedorPendiente(proveedor);

      cards.push(`
        <article class="authCard">
          <div class="miniAvatar">P</div>
          <h3>${escaparHtml(p.name)}</h3>
          <p><b>Proveedor pendiente de autorización</b></p>
          <p>
            <b>Servicio:</b> ${escaparHtml(p.type)}<br>
            <b>Teléfono:</b> ${escaparHtml(p.telefono)}<br>
            <b>Correo:</b> ${escaparHtml(p.correo)}<br>
            <b>Unidad:</b> ${escaparHtml(p.unidad)}<br>
            <b>Solicitud:</b> ${escaparHtml(p.time)}
          </p>

          <div class="cardActions">
            <button
              class="approve"
              onclick="aprobarProveedorPendiente('${escaparHtml(p.id)}')"
            >
              Autorizar proveedor
            </button>

            <button
              class="reject"
              onclick="rechazarProveedorPendiente('${escaparHtml(p.id)}')"
            >
              Rechazar
            </button>

            <button
              onclick="verProveedorPendiente('${escaparHtml(p.id)}')"
            >
              Ver expediente
            </button>
          </div>
        </article>
      `);
    });

    vehiculosPendientes.forEach((a,i) => {
      cards.push(`
        <article class="authCard" data-auth="${i}">
          <div class="miniAvatar">${escaparHtml(a.initials)}</div>
          <h3>${escaparHtml(a.name)}</h3>
          <p>${escaparHtml(a.detail)}</p>
          <p>
            <b>Membresía:</b> ${escaparHtml(a.membership || "Sin número")}<br>
            <b>Tipo:</b> ${escaparHtml(a.type)}<br>
            <b>Solicitud:</b> ${escaparHtml(a.time)}
          </p>

          <div class="cardActions">
            <button class="approve" onclick="approveAuth(${i})">
              Aprobar
            </button>
            <button class="reject" onclick="rejectAuth(${i})">
              Rechazar
            </button>
            <button onclick="openAuth(${i})">
              Ver expediente
            </button>
          </div>
        </article>
      `);
    });

    tarjetas.innerHTML = totalPendientes
      ? cards.join("")
      : `
        <article class="authCard">
          <div class="miniAvatar">✓</div>
          <h3>Sin autorizaciones pendientes</h3>
          <p>No hay proveedores ni vehículos esperando revisión.</p>
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
            <div class="cardActions">
              <button onclick="openProvider('${escaparHtml(p.id)}')">Ver ficha</button>
              ${
                p.status === "Baja"
                  ? `<button class="approve" onclick="darAltaProveedor('${escaparHtml(p.id)}')">Dar de alta</button>`
                  : `<button class="reject" onclick="darBajaProveedor('${escaparHtml(p.id)}')">Dar de baja</button>`
              }
            </div>
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


function normalizarEstadoVehiculo(valor){
  const estado = String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g,"_");

  if (estado === "activo") return "activo";
  if (estado === "pendiente_autorizacion") return "pendiente_autorizacion";
  if (estado === "rechazado" || estado === "rechazada") return "rechazado";
  return "sin_membresia";
}

function textoEstadoVehiculo(estado){
  const textos = {
    activo: "Activo",
    pendiente_autorizacion: "Pendiente",
    sin_membresia: "Sin membresía",
    rechazado: "Rechazado"
  };

  return textos[normalizarEstadoVehiculo(estado)] || "Sin membresía";
}

function claseEstadoVehiculo(estado){
  const normalizado = normalizarEstadoVehiculo(estado);

  if (normalizado === "activo") return "status-disponible";
  if (normalizado === "pendiente_autorizacion") return "status-pendiente";
  if (normalizado === "rechazado") return "status-cancelado";

  return "status-finalizado";
}

function obtenerClienteVehiculo(vehiculo){
  return state.clients.find(c => c.id === vehiculo.uidCliente) || null;
}

function obtenerNumeroMembresiaVehiculo(vehiculo,cliente){
  return (
    vehiculo.numeroMembresiaSolicitada ||
    vehiculo.raw?.numeroMembresia ||
    vehiculo.raw?.numeroMiembro ||
    (
      vehiculo.membresiaAplicada === true ||
      normalizarEstadoVehiculo(vehiculo.estadoMembresiaVehiculo) === "activo"
        ? cliente?.membership
        : ""
    ) ||
    "Sin membresía"
  );
}

function renderVehicles(){
  const cuerpo = document.getElementById("vehiclesBody");
  if (!cuerpo) return;

  const busqueda = String(
    document.getElementById("vehicleSearch")?.value || ""
  ).trim().toLowerCase();

  const filtroEstado =
    document.getElementById("vehicleStatusFilter")?.value || "";

  const filas = state.vehicles
    .map(v => {
      const cliente = obtenerClienteVehiculo(v);
      const estado = normalizarEstadoVehiculo(v.estadoMembresiaVehiculo);
      const membresia = obtenerNumeroMembresiaVehiculo(v,cliente);
      const vehiculoTexto = [
        v.marca,
        v.subMarca,
        v.raw?.modelo || v.raw?.anio || v.raw?.año || ""
      ].filter(Boolean).join(" ");

      return {
        ...v,
        cliente,
        clienteNombre: cliente?.name || "Cliente",
        estado,
        membresia,
        vehiculoTexto: vehiculoTexto || "Vehículo"
      };
    })
    .filter(v => {
      const textoBusqueda = [
        v.clienteNombre,
        v.vehiculoTexto,
        v.placas,
        v.serie,
        v.membresia
      ].join(" ").toLowerCase();

      return (
        (!busqueda || textoBusqueda.includes(busqueda)) &&
        (!filtroEstado || v.estado === filtroEstado)
      );
    })
    .sort((a,b) =>
      a.clienteNombre.localeCompare(b.clienteNombre,"es")
    );

  if (!filas.length) {
    cuerpo.innerHTML = `
      <tr>
        <td colspan="7">No hay vehículos que coincidan con los filtros.</td>
      </tr>
    `;
    return;
  }

  cuerpo.innerHTML = filas.map(v => {
    const puedeAplicar =
      v.estado !== "activo" &&
      v.estado !== "pendiente_autorizacion" &&
      v.cliente?.hasMembership === true;

    return `
      <tr>
        <td><b>${escaparHtml(v.clienteNombre)}</b></td>
        <td>${escaparHtml(v.vehiculoTexto)}</td>
        <td>${escaparHtml(v.placas || "Sin placas")}</td>
        <td>${escaparHtml(v.serie || "Sin serie")}</td>
        <td>${escaparHtml(v.membresia)}</td>
        <td>
          <span class="statusBadge ${claseEstadoVehiculo(v.estado)}">
            ${escaparHtml(textoEstadoVehiculo(v.estado))}
          </span>
        </td>
        <td>
          <div class="cardActions" style="margin-top:0">
            <button onclick="openVehicle('${escaparHtml(v.uidCliente)}','${escaparHtml(v.id)}')">Ver ficha</button>
            ${
              v.estado === "pendiente_autorizacion"
                ? `<button class="approve" onclick="aprobarVehiculoDesdeLista('${escaparHtml(v.uidCliente)}','${escaparHtml(v.id)}')">Aprobar</button>`
                : ""
            }
            ${
              v.estado === "activo"
                ? `<button class="reject" onclick="quitarMembresiaVehiculo('${escaparHtml(v.uidCliente)}','${escaparHtml(v.id)}')">Quitar membresía</button>`
                : ""
            }
            ${
              puedeAplicar
                ? `<button class="approve" onclick="aplicarMembresiaVehiculo('${escaparHtml(v.uidCliente)}','${escaparHtml(v.id)}')">Aplicar membresía</button>`
                : ""
            }
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function buscarVehiculo(uidCliente,vehiculoId){
  return state.vehicles.find(
    v => v.uidCliente === uidCliente && v.id === vehiculoId
  ) || null;
}

async function sincronizarVehiculoPrincipal(uidCliente,vehiculoId,cambios){
  const usuarioRef = firestoreDoc(db,"usuarios",uidCliente);
  const usuarioSnap = await firestoreGetDoc(usuarioRef);

  if (!usuarioSnap.exists()) return;

  const usuario = usuarioSnap.data();
  const principalId = usuario.vehiculoPrincipal?.id || "";

  if (principalId !== vehiculoId) return;

  const actualizacion = {
    actualizadoEn: firestoreServerTimestamp()
  };

  if ("membresiaAplicada" in cambios) {
    actualizacion["vehiculoPrincipal.membresiaAplicada"] =
      cambios.membresiaAplicada;
  }

  if ("estadoMembresiaVehiculo" in cambios) {
    actualizacion["vehiculoPrincipal.estadoMembresiaVehiculo"] =
      cambios.estadoMembresiaVehiculo;
  }

  if ("requiereAutorizacion" in cambios) {
    actualizacion["vehiculoPrincipal.requiereAutorizacion"] =
      cambios.requiereAutorizacion;
  }

  await firestoreUpdateDoc(usuarioRef,actualizacion);
}

window.openVehicle = (uidCliente,vehiculoId) => {
  const vehiculo = buscarVehiculo(uidCliente,vehiculoId);
  if (!vehiculo) return;

  const cliente = obtenerClienteVehiculo(vehiculo);
  const estado = normalizarEstadoVehiculo(
    vehiculo.estadoMembresiaVehiculo
  );
  const membresia = obtenerNumeroMembresiaVehiculo(
    vehiculo,
    cliente
  );

  openModal(
    "Ficha del vehículo",
    `
      <p><b>Cliente:</b> ${escaparHtml(cliente?.name || "Cliente")}</p>
      <p><b>Teléfono:</b> ${escaparHtml(cliente?.phone || "No registrado")}</p>
      <p><b>Marca:</b> ${escaparHtml(vehiculo.marca || "No registrada")}</p>
      <p><b>Submarca:</b> ${escaparHtml(vehiculo.subMarca || "No registrada")}</p>
      <p><b>Modelo:</b> ${escaparHtml(vehiculo.raw?.modelo || vehiculo.raw?.anio || vehiculo.raw?.año || "No registrado")}</p>
      <p><b>Color:</b> ${escaparHtml(vehiculo.color || "No registrado")}</p>
      <p><b>Placas:</b> ${escaparHtml(vehiculo.placas || "Sin placas")}</p>
      <p><b>VIN / Serie:</b> ${escaparHtml(vehiculo.serie || "Sin serie")}</p>
      <p><b>Membresía:</b> ${escaparHtml(membresia)}</p>
      <p><b>Estado:</b> ${escaparHtml(textoEstadoVehiculo(estado))}</p>
      <div class="cardActions">
        ${
          estado === "pendiente_autorizacion"
            ? `<button class="approve" onclick="closeModal();aprobarVehiculoDesdeLista('${escaparHtml(uidCliente)}','${escaparHtml(vehiculoId)}')">Aprobar membresía</button>`
            : ""
        }
        ${
          estado === "activo"
            ? `<button class="reject" onclick="closeModal();quitarMembresiaVehiculo('${escaparHtml(uidCliente)}','${escaparHtml(vehiculoId)}')">Quitar membresía</button>`
            : ""
        }
        ${
          estado !== "activo" &&
          estado !== "pendiente_autorizacion" &&
          cliente?.hasMembership === true
            ? `<button class="approve" onclick="closeModal();aplicarMembresiaVehiculo('${escaparHtml(uidCliente)}','${escaparHtml(vehiculoId)}')">Aplicar membresía</button>`
            : ""
        }
      </div>
    `
  );
};

window.aprobarVehiculoDesdeLista = async (uidCliente,vehiculoId) => {
  const vehiculo = buscarVehiculo(uidCliente,vehiculoId);
  if (!vehiculo) return;

  const confirmar = window.confirm(
    `¿Aprobar la membresía para el vehículo ${vehiculo.placas || vehiculoId}?`
  );

  if (!confirmar) return;

  const cambios = {
    membresiaAplicada: true,
    estadoMembresiaVehiculo: "activo",
    requiereAutorizacion: false,
    autorizacionEstado: "aprobada",
    autorizacionAprobadaEn: firestoreServerTimestamp(),
    actualizadoEn: firestoreServerTimestamp()
  };

  try {
    await firestoreUpdateDoc(
      firestoreDoc(
        db,
        "usuarios",
        uidCliente,
        "vehiculos",
        vehiculoId
      ),
      cambios
    );

    await sincronizarVehiculoPrincipal(
      uidCliente,
      vehiculoId,
      cambios
    );
  } catch (error) {
    console.error("Error aprobando vehículo:",error);

    openModal(
      "No fue posible aprobar",
      `<p>Firebase rechazó la actualización.</p><p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

window.quitarMembresiaVehiculo = async (uidCliente,vehiculoId) => {
  const vehiculo = buscarVehiculo(uidCliente,vehiculoId);
  if (!vehiculo) return;

  const confirmar = window.confirm(
    `¿Quitar la membresía del vehículo ${vehiculo.placas || vehiculoId}?`
  );

  if (!confirmar) return;

  const cambios = {
    membresiaAplicada: false,
    estadoMembresiaVehiculo: "sin_membresia",
    requiereAutorizacion: false,
    autorizacionEstado: "retirada_admin",
    membresiaRetiradaEn: firestoreServerTimestamp(),
    actualizadoEn: firestoreServerTimestamp()
  };

  try {
    await firestoreUpdateDoc(
      firestoreDoc(
        db,
        "usuarios",
        uidCliente,
        "vehiculos",
        vehiculoId
      ),
      cambios
    );

    await sincronizarVehiculoPrincipal(
      uidCliente,
      vehiculoId,
      cambios
    );
  } catch (error) {
    console.error("Error quitando membresía:",error);

    openModal(
      "No fue posible quitar la membresía",
      `<p>Firebase rechazó la actualización.</p><p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

window.aplicarMembresiaVehiculo = async (uidCliente,vehiculoId) => {
  const vehiculo = buscarVehiculo(uidCliente,vehiculoId);
  const cliente = state.clients.find(c => c.id === uidCliente);

  if (!vehiculo || !cliente?.hasMembership) {
    window.alert("El cliente no tiene una membresía activa.");
    return;
  }

  const confirmar = window.confirm(
    `¿Aplicar la membresía de ${cliente.name} a este vehículo?`
  );

  if (!confirmar) return;

  const cambios = {
    membresiaAplicada: true,
    estadoMembresiaVehiculo: "activo",
    requiereAutorizacion: false,
    numeroMembresiaSolicitada:
      cliente.membership === "Membresía activa"
        ? ""
        : cliente.membership,
    autorizacionEstado: "aplicada_admin",
    autorizacionAprobadaEn: firestoreServerTimestamp(),
    actualizadoEn: firestoreServerTimestamp()
  };

  try {
    await firestoreUpdateDoc(
      firestoreDoc(
        db,
        "usuarios",
        uidCliente,
        "vehiculos",
        vehiculoId
      ),
      cambios
    );

    await sincronizarVehiculoPrincipal(
      uidCliente,
      vehiculoId,
      cambios
    );
  } catch (error) {
    console.error("Error aplicando membresía:",error);

    openModal(
      "No fue posible aplicar la membresía",
      `<p>Firebase rechazó la actualización.</p><p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

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

window.closeModal = closeModal;

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
      ${datos.grua ? `<p><b>Categoría grúa:</b> ${escaparHtml(datos.grua.categoria || "-")}</p><p><b>Condición:</b> ${escaparHtml(datos.grua.condicion || "-")}</p><p><b>Carga:</b> ${datos.grua.esVehiculoCarga ? escaparHtml(`${datos.grua.estadoCarga || ""} ${datos.grua.tipoCarga || ""} ${datos.grua.pesoCargaAproximado || ""}`.trim()) : "No"}</p>` : ""}
      ${
        ubicacion
          ? `<p><b>Ubicación:</b> ${escaparHtml(String(ubicacion))}</p>`
          : ""
      }
      <div class="cardActions">
        <button onclick="abrirReasignacionServicio('${escaparHtml(s.id)}')">Reasignar proveedor</button>
        <button onclick="abrirUbicacionServicio('${escaparHtml(s.id)}')">Ver ubicación</button>
      </div>
    `
  );
};


function obtenerProveedorPorUid(uid){
  const objetivo = String(uid || "").trim();
  if (!objetivo) return null;

  return state.providers.find(p =>
    proveedorCoincideConUid(p,objetivo)
  ) || null;
}

function proveedorDisponibleParaServicio(proveedor, servicio){
  if (!proveedor || !servicio) return false;
  if (proveedorEstaDeBaja(proveedor)) return false;

  const estadoActual = estadoProveedorEnTiempoReal(proveedor);
  if (estadoActual !== "Disponible") return false;

  const tipoProveedor = normalizarTipoServicio(
    proveedor.raw?.tipoProveedor ||
    proveedor.raw?.tipo ||
    proveedor.type ||
    ""
  );

  return tipoProveedor === servicio.servicio;
}

window.abrirUbicacionServicio = id => {
  const servicio = state.services.find(s => s.id === id);
  if (!servicio) return;

  const datos = servicio.raw || {};

  const url =
    datos.ubicacion?.enlaceGoogleMaps ||
    datos.ubicacionDatos?.enlaceGoogleMaps ||
    (
      datos.ubicacion?.latitud != null &&
      datos.ubicacion?.longitud != null
        ? `https://maps.google.com/?q=${datos.ubicacion.latitud},${datos.ubicacion.longitud}`
        : ""
    ) ||
    (
      datos.ubicacionDatos?.latitud != null &&
      datos.ubicacionDatos?.longitud != null
        ? `https://maps.google.com/?q=${datos.ubicacionDatos.latitud},${datos.ubicacionDatos.longitud}`
        : ""
    ) ||
    (typeof datos.ubicacion === "string" ? datos.ubicacion : "");

  if (!url) {
    openModal(
      "Ubicación no disponible",
      "<p>Este servicio no tiene una ubicación válida registrada.</p>"
    );
    return;
  }

  window.open(
    String(url),
    "_blank",
    "noopener,noreferrer"
  );
};

window.abrirReasignacionServicio = id => {
  const servicio = state.services.find(s => s.id === id);
  if (!servicio) return;

  const proveedoresDisponibles = state.providers
    .filter(p => proveedorDisponibleParaServicio(p,servicio))
    .sort((a,b) => a.name.localeCompare(b.name,"es"));

  const proveedorActual = servicio.uidProveedor
    ? obtenerProveedorPorUid(servicio.uidProveedor)
    : null;

  const proveedorActualTexto = proveedorActual?.name || servicio.proveedor || "Sin asignar";

  const opciones = proveedoresDisponibles.length
    ? proveedoresDisponibles.map(p => `
        <label style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #29435c;border-radius:10px;margin-bottom:8px;cursor:pointer;">
          <input
            type="radio"
            name="proveedorReasignacion"
            value="${escaparHtml(p.id)}"
          >
          <span>
            <b>${escaparHtml(p.name)}</b><br>
            <small>${escaparHtml(p.type)} · ${escaparHtml(p.telefono)}</small>
          </span>
        </label>
      `).join("")
    : `<p>No hay proveedores <b>${escaparHtml(servicio.servicio)}</b> disponibles en este momento.</p>`;

  openModal(
    `Reasignar ${servicio.folio}`,
    `
      <p><b>Servicio:</b> ${escaparHtml(servicio.servicio)}</p>
      <p><b>Cliente:</b> ${escaparHtml(servicio.cliente)}</p>
      <p><b>Proveedor actual:</b> ${escaparHtml(proveedorActualTexto)}</p>
      <hr style="border:0;border-top:1px solid #29435c;margin:14px 0;">
      ${opciones}
      ${
        proveedoresDisponibles.length
          ? `
            <div class="cardActions" style="margin-top:14px;">
              <button
                class="approve"
                onclick="confirmarReasignacionServicio('${escaparHtml(servicio.id)}')"
              >
                Asignar proveedor
              </button>
            </div>
          `
          : ""
      }
    `
  );
};

async function liberarProveedorAnterior(servicio,nuevoProveedorId){
  const uidAnterior = String(servicio?.uidProveedor || "").trim();
  if (!uidAnterior) return;

  const proveedorAnterior = obtenerProveedorPorUid(uidAnterior);
  if (!proveedorAnterior) return;

  if (proveedorAnterior.id === nuevoProveedorId) return;

  await firestoreUpdateDoc(
    firestoreDoc(db,"proveedores",proveedorAnterior.id),
    {
      disponible: true,
      estadoConexion: "disponible",
      servicioActualId: null,
      ultimaActualizacion: firestoreServerTimestamp()
    }
  );
}

window.confirmarReasignacionServicio = async id => {
  const servicio = state.services.find(s => s.id === id);
  if (!servicio || !firestoreUpdateDoc || !firestoreDoc) return;

  const seleccionado = document.querySelector(
    'input[name="proveedorReasignacion"]:checked'
  );

  if (!seleccionado) {
    window.alert("Selecciona un proveedor.");
    return;
  }

  const proveedor = state.providers.find(
    p => p.id === seleccionado.value
  );

  if (!proveedor) {
    window.alert("El proveedor seleccionado ya no está disponible.");
    return;
  }

  if (!proveedorDisponibleParaServicio(proveedor,servicio)) {
    window.alert("Ese proveedor ya no está disponible. Actualiza y selecciona otro.");
    return;
  }

  const confirmar = window.confirm(
    `¿Asignar el servicio ${servicio.folio} a ${proveedor.name}?`
  );

  if (!confirmar) return;

  try {
    const solicitudRef = firestoreDoc(
      db,
      "solicitudes",
      servicio.id
    );

    await liberarProveedorAnterior(
      servicio,
      proveedor.id
    );

    await firestoreUpdateDoc(
      solicitudRef,
      {
        estado: "asignado",
        "asignacion.uidProveedor": proveedor.uid || proveedor.id,
        "asignacion.nombreProveedor": proveedor.name,
        "asignacion.telefonoProveedor":
          proveedor.raw?.telefono ||
          proveedor.raw?.celular ||
          "",
        "asignacion.fotoProveedor":
          proveedor.raw?.foto ||
          proveedor.raw?.fotoURL ||
          "",
        "asignacion.tipoProveedor":
          proveedor.raw?.tipoProveedor ||
          proveedor.raw?.tipo ||
          String(proveedor.type || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g,"")
            .replace(/\s+/g,"_"),
        fechaAsignacion: firestoreServerTimestamp(),
        actualizadoEn: firestoreServerTimestamp()
      }
    );

    await firestoreUpdateDoc(
      firestoreDoc(
        db,
        "proveedores",
        proveedor.id
      ),
      {
        disponible: false,
        estadoConexion: "ocupado",
        servicioActualId: servicio.id,
        ultimaActualizacion: firestoreServerTimestamp()
      }
    );

    closeModal();
  } catch (error) {
    console.error("Error reasignando proveedor:",error);

    openModal(
      "No fue posible reasignar",
      `
        <p>Firebase rechazó la actualización.</p>
        <p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>
      `
    );
  }
};

window.openProvider = id => {
  const p = state.providers.find(item => item.id === id);
  if (!p) return;

  const estadoActual = estadoProveedorEnTiempoReal(p);

  openModal(
    p.name,
    `
      <p><b>Tipo:</b> ${escaparHtml(p.type)}</p>
      <p><b>Calificación:</b> ★ ${escaparHtml(p.rating)}</p>
      <p><b>Servicios:</b> ${escaparHtml(p.services)}</p>
      <p><b>Estado:</b> ${escaparHtml(estadoActual)}</p>
      <p><b>Teléfono:</b> ${escaparHtml(p.telefono)}</p>
      <div class="cardActions">
        ${
          estadoActual === "Baja"
            ? `<button class="approve" onclick="closeModal();darAltaProveedor('${escaparHtml(p.id)}')">Dar de alta</button>`
            : `<button class="reject" onclick="closeModal();darBajaProveedor('${escaparHtml(p.id)}')">Dar de baja</button>`
        }
      </div>
    `
  );
};


window.darBajaProveedor = async id => {
  const proveedor = state.providers.find(p => p.id === id);
  if (!proveedor || !firestoreUpdateDoc || !firestoreDoc) return;

  if (proveedorTieneServicioActivo(proveedor)) {
    openModal(
      "Proveedor ocupado",
      "<p>No se puede dar de baja a este proveedor mientras tenga un servicio activo. Finaliza o reasigna primero el servicio.</p>"
    );
    return;
  }

  const confirmar = window.confirm(
    `¿Dar de baja a ${proveedor.name}? Dejará de aparecer como disponible.`
  );

  if (!confirmar) return;

  try {
    await firestoreUpdateDoc(
      firestoreDoc(db,"proveedores",id),
      {
        bajaAdmin: true,
        suspendido: true,
        activo: false,
        disponible: false,
        estadoConexion: "suspendido",
        servicioActualId: null,
        bajaAdminEn: firestoreServerTimestamp(),
        ultimaActualizacion: firestoreServerTimestamp()
      }
    );
  } catch (error) {
    console.error("Error dando de baja proveedor:",error);

    openModal(
      "No fue posible dar de baja",
      `<p>Firebase rechazó la actualización.</p><p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

window.darAltaProveedor = async id => {
  const proveedor = state.providers.find(p => p.id === id);
  if (!proveedor || !firestoreUpdateDoc || !firestoreDoc) return;

  const confirmar = window.confirm(
    `¿Dar de alta nuevamente a ${proveedor.name}?`
  );

  if (!confirmar) return;

  try {
    await firestoreUpdateDoc(
      firestoreDoc(db,"proveedores",id),
      {
        bajaAdmin: false,
        suspendido: false,
        activo: true,
        disponible: true,
        estadoConexion: "disponible",
        altaAdminEn: firestoreServerTimestamp(),
        ultimaActualizacion: firestoreServerTimestamp()
      }
    );
  } catch (error) {
    console.error("Error dando de alta proveedor:",error);

    openModal(
      "No fue posible dar de alta",
      `<p>Firebase rechazó la actualización.</p><p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
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


window.verProveedorPendiente = id => {
  const proveedor = state.providers.find(
    p => p.id === id
  );

  if (!proveedor) return;

  const p = detalleProveedorPendiente(proveedor);
  const datos = proveedor.raw || {};

  openModal(
    "Expediente de proveedor",
    `
      <p><b>Nombre:</b> ${escaparHtml(p.name)}</p>
      <p><b>Tipo de proveedor:</b> ${escaparHtml(p.type)}</p>
      <p><b>Teléfono:</b> ${escaparHtml(p.telefono)}</p>
      <p><b>Correo:</b> ${escaparHtml(p.correo)}</p>
      <p><b>Unidad:</b> ${escaparHtml(p.unidad)}</p>
      <p><b>Estado:</b> Pendiente de autorización</p>
      <p><b>Solicitud:</b> ${escaparHtml(p.time)}</p>

      ${
        datos.placas
          ? `<p><b>Placas:</b> ${escaparHtml(datos.placas)}</p>`
          : ""
      }

      ${
        datos.marcaUnidad || datos.marca
          ? `<p><b>Marca:</b> ${escaparHtml(datos.marcaUnidad || datos.marca)}</p>`
          : ""
      }

      <div class="cardActions">
        <button
          class="approve"
          onclick="closeModal();aprobarProveedorPendiente('${escaparHtml(id)}')"
        >
          Autorizar proveedor
        </button>

        <button
          class="reject"
          onclick="closeModal();rechazarProveedorPendiente('${escaparHtml(id)}')"
        >
          Rechazar
        </button>
      </div>
    `
  );
};

window.aprobarProveedorPendiente = async id => {
  const proveedor = state.providers.find(
    p => p.id === id
  );

  if (!proveedor || !firestoreUpdateDoc || !firestoreDoc) {
    return;
  }

  if (
    !window.confirm(
      `¿Autorizar a ${proveedor.name} como ${proveedor.type}?`
    )
  ) {
    return;
  }

  try {
    await firestoreUpdateDoc(
      firestoreDoc(
        db,
        "proveedores",
        proveedor.id
      ),
      {
        activo: true,
        autorizado: true,
        estado: "autorizado",
        estadoSolicitud: "autorizado",
        bajaAdmin: false,
        suspendido: false,
        fechaAutorizacion:
          firestoreServerTimestamp(),
        ultimaActualizacion:
          firestoreServerTimestamp()
      }
    );

    closeModal();
  } catch (error) {
    console.error(
      "Error autorizando proveedor:",
      error
    );

    openModal(
      "No fue posible autorizar",
      `
        <p>Firebase rechazó la autorización del proveedor.</p>
        <p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>
      `
    );
  }
};

window.rechazarProveedorPendiente = async id => {
  const proveedor = state.providers.find(
    p => p.id === id
  );

  if (!proveedor || !firestoreUpdateDoc || !firestoreDoc) {
    return;
  }

  const motivo = window.prompt(
    `Motivo para rechazar a ${proveedor.name}:`,
    ""
  );

  if (motivo === null) return;

  try {
    await firestoreUpdateDoc(
      firestoreDoc(
        db,
        "proveedores",
        proveedor.id
      ),
      {
        activo: false,
        autorizado: false,
        estado: "rechazado",
        estadoSolicitud: "rechazado",
        motivoRechazo:
          String(motivo || "No especificado").trim(),
        fechaRechazo:
          firestoreServerTimestamp(),
        ultimaActualizacion:
          firestoreServerTimestamp()
      }
    );

    closeModal();
  } catch (error) {
    console.error(
      "Error rechazando proveedor:",
      error
    );

    openModal(
      "No fue posible rechazar",
      `
        <p>Firebase rechazó la actualización.</p>
        <p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>
      `
    );
  }
};

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
    renderVehicles();
    renderMemberships();
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

[
  "vehicleSearch",
  "vehicleStatusFilter"
].forEach(id =>
  document
    .getElementById(id)
    ?.addEventListener("input",renderVehicles)
);

[
  "membershipSearch",
  "membershipStatusFilter"
].forEach(id =>
  document
    .getElementById(id)
    ?.addEventListener("input",renderMemberships)
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
  .getElementById("generateMembershipBtn")
  ?.addEventListener("click",() => {
    window.abrirGeneradorMembresias();
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
  renderVehicles();
  renderMemberships();
  renderMembershipKpis();
  renderAuthorizations();
  renderTowQuotes();
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
    firestoreSetDoc = firestoreModule.setDoc;
    firestoreWriteBatch = firestoreModule.writeBatch;
    firestoreTimestamp = firestoreModule.Timestamp;
    firestoreGetDocs = firestoreModule.getDocs;
    firestoreRunTransaction = firestoreModule.runTransaction;

    if (!db) {
      throw new Error("firebase-config.js no exporta db.");
    }

    firebaseReady = true;

    escucharClientes();
    escucharProveedores();
    escucharServicios();
    escucharMembresias();
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
      escucharVehiculosPorUsuarios();

      state.vehicles = combinarVehiculosRaizYSubcolecciones(
        [...vehicleSnapshotsByUser.values()].flat()
      );

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



function usuarioTieneVehiculoRaiz(datos = {}){
  return Boolean(
    datos.vehiculoPrincipal?.id ||
    datos.vehiculoPrincipal?.marca ||
    datos.vehiculoPrincipal?.placas ||
    datos.marca ||
    datos.placas ||
    datos.serie
  );
}

function convertirVehiculoRaizDesdeUsuario(cliente){
  const datos = cliente?.raw || {};
  const principal = datos.vehiculoPrincipal || {};

  return {
    id: principal.id || `principal_${cliente.id}`,
    uidCliente: cliente.id,
    path: `usuarios/${cliente.id}`,
    marca: principal.marca || datos.marca || "",
    subMarca: principal.subMarca || datos.subMarca || "",
    color: principal.color || datos.color || "",
    placas: principal.placas || datos.placas || "",
    serie: principal.serie || datos.serie || "",
    membresiaAplicada:
      principal.membresiaAplicada === true ||
      datos.membresiaAplicada === true,
    estadoMembresiaVehiculo:
      principal.estadoMembresiaVehiculo ||
      datos.estadoMembresiaVehiculo ||
      (
        principal.membresiaAplicada === true ||
        datos.membresiaAplicada === true
          ? "activo"
          : "sin_membresia"
      ),
    requiereAutorizacion:
      principal.requiereAutorizacion === true ||
      datos.requiereAutorizacion === true,
    numeroMembresiaSolicitada:
      principal.numeroMembresiaSolicitada ||
      datos.numeroMembresiaSolicitada ||
      datos.numeroMiembro ||
      datos.numeroMembresia ||
      "",
    solicitudMembresiaEn:
      principal.solicitudMembresiaEn ||
      datos.solicitudMembresiaEn ||
      null,
    creadoEn:
      principal.creadoEn ||
      datos.creadoEn ||
      null,
    raw: {
      ...datos,
      ...principal,
      origenVehiculoAdmin: "usuario_raiz"
    },
    fromUserRoot: true
  };
}

function combinarVehiculosRaizYSubcolecciones(vehiculosSubcoleccion){
  const resultado = [...vehiculosSubcoleccion];

  state.clients.forEach(cliente => {
    if (!usuarioTieneVehiculoRaiz(cliente.raw)) return;

    const raiz = convertirVehiculoRaizDesdeUsuario(cliente);

    const yaExiste = resultado.some(v => {
      if (v.uidCliente !== cliente.id) return false;

      if (raiz.id && v.id === raiz.id) return true;

      const placasA = String(v.placas || "").trim().toUpperCase();
      const placasB = String(raiz.placas || "").trim().toUpperCase();
      const serieA = String(v.serie || "").trim().toUpperCase();
      const serieB = String(raiz.serie || "").trim().toUpperCase();

      return (
        (placasA && placasB && placasA === placasB) ||
        (serieA && serieB && serieA === serieB)
      );
    });

    if (!yaExiste) {
      resultado.push(raiz);
    }
  });

  return resultado;
}

function fechaDesdeFirestore(valor){
  if (!valor) return null;

  if (typeof valor?.toDate === "function") {
    return valor.toDate();
  }

  if (typeof valor?.seconds === "number") {
    return new Date(valor.seconds * 1000);
  }

  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function formatearFechaMembresia(valor){
  const fecha = fechaDesdeFirestore(valor);
  if (!fecha) return "—";

  return fecha.toLocaleDateString("es-MX",{
    day:"2-digit",
    month:"2-digit",
    year:"numeric"
  });
}

function diasRestantesMembresia(valor){
  const fecha = fechaDesdeFirestore(valor);
  if (!fecha) return null;

  const hoy = new Date();
  hoy.setHours(0,0,0,0);

  const fin = new Date(fecha);
  fin.setHours(0,0,0,0);

  return Math.ceil((fin.getTime() - hoy.getTime()) / 86400000);
}

function normalizarEstadoMembresiaAdmin(membresia = {}){
  const raw = String(
    membresia.estadoMembresia ||
    membresia.estado ||
    ""
  )
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g,"_");

  const uid = String(membresia.uidUsuario || "").trim();

  if (
    ["cancelada","cancelado"].includes(raw)
  ) return "cancelada";

  if (
    ["suspendida","suspendido"].includes(raw)
  ) return "suspendida";

  const fin =
    membresia.fechaFin ||
    membresia.finVigencia ||
    membresia.fin ||
    membresia.fechaVencimiento ||
    membresia.vencimiento ||
    membresia.vigencia ||
    null;

  const dias = diasRestantesMembresia(fin);

  if (uid && dias != null && dias < 0) {
    return "vencida";
  }

  if (uid && dias != null && dias <= 30) {
    return "vence_pronto";
  }

  if (
    !uid ||
    [
      "pendiente_activacion",
      "disponible",
      "pendiente",
      ""
    ].includes(raw)
  ) {
    return "pendiente_activacion";
  }

  if (
    [
      "activa",
      "activo",
      "asignada",
      "asignado",
      "vigente"
    ].includes(raw)
  ) {
    return "activa";
  }

  return uid ? "activa" : "pendiente_activacion";
}

function textoEstadoMembresiaAdmin(estado){
  const mapa = {
    pendiente_activacion: "Disponible",
    activa: "Activa",
    vence_pronto: "Vence pronto",
    vencida: "Vencida",
    suspendida: "Suspendida",
    cancelada: "Cancelada"
  };

  return mapa[estado] || estado;
}

function claseEstadoMembresiaAdmin(estado){
  if (estado === "activa") return "status-disponible";
  if (estado === "pendiente_activacion") return "status-asignado";
  if (estado === "vence_pronto") return "status-pendiente";
  if (["vencida","suspendida","cancelada"].includes(estado)) {
    return "status-cancelado";
  }
  return "status-finalizado";
}

function obtenerClienteDeMembresia(membresia){
  const uid = String(membresia.uidUsuario || "").trim();
  if (!uid) return null;

  return state.clients.find(c => c.id === uid) || null;
}

function renderMembershipKpis(){
  const contenedor = document.getElementById("membershipKpis");
  if (!contenedor) return;

  const estados = state.memberships.map(normalizarEstadoMembresiaAdmin);

  const disponibles = estados.filter(e => e === "pendiente_activacion").length;
  const activas = estados.filter(e => e === "activa").length;
  const vencen = estados.filter(e => e === "vence_pronto").length;
  const vencidas = estados.filter(e => e === "vencida").length;

  const datos = [
    ["Disponibles",String(disponibles),"▣","assigned"],
    ["Activas",String(activas),"✓","done"],
    ["Vencen ≤ 30 días",String(vencen),"◷","pending"],
    ["Vencidas",String(vencidas),"×","cancelled"]
  ];

  contenedor.innerHTML = datos.map(([label,value,icon,cls]) => `
    <article class="kpi ${cls}">
      <div class="label">${escaparHtml(label)}</div>
      <div class="value">${escaparHtml(value)}</div>
      <div class="sub">Membresías</div>
      <div class="icon">${icon}</div>
    </article>
  `).join("");
}

function renderMemberships(){
  const cuerpo = document.getElementById("membershipsBody");
  if (!cuerpo) return;

  const q = String(
    document.getElementById("membershipSearch")?.value || ""
  ).trim().toLowerCase();

  const filtro =
    document.getElementById("membershipStatusFilter")?.value || "";

  const filas = state.memberships
    .map(m => {
      const cliente = obtenerClienteDeMembresia(m);
      const estado = normalizarEstadoMembresiaAdmin(m);

      const inicio =
        m.fechaInicio ||
        m.inicioVigencia ||
        m.inicio ||
        m.fechaActivacion ||
        m.fechaVinculacion ||
        null;

      const fin =
        m.fechaFin ||
        m.finVigencia ||
        m.fin ||
        m.fechaVencimiento ||
        m.vencimiento ||
        m.vigencia ||
        null;

      const dias = diasRestantesMembresia(fin);

      return {
        ...m,
        cliente,
        estado,
        inicio,
        fin,
        dias,
        numero:
          m.numeroMembresia ||
          m.id ||
          "",
        nombre:
          m.nombreRegistro ||
          cliente?.name ||
          "Sin asignar",
        telefono:
          m.telefonoRegistro ||
          cliente?.phone ||
          "—",
        correo:
          m.correo ||
          cliente?.raw?.correo ||
          "",
        plan:
          m.plan ||
          m.tipoMembresia ||
          "anual",
        tipo:
          m.tipoCliente ||
          cliente?.raw?.tipoCliente ||
          "—"
      };
    })
    .filter(item => {
      const textoBusqueda = [
        item.numero,
        item.nombre,
        item.telefono,
        item.correo,
        item.plan,
        item.tipo
      ].join(" ").toLowerCase();

      return (
        (!q || textoBusqueda.includes(q)) &&
        (!filtro || item.estado === filtro)
      );
    })
    .sort((a,b) =>
      String(a.numero).localeCompare(String(b.numero),"es",{
        numeric:true
      })
    );

  if (!filas.length) {
    cuerpo.innerHTML = `
      <tr>
        <td colspan="10">No hay membresías que coincidan con los filtros.</td>
      </tr>
    `;
    renderMembershipKpis();
    return;
  }

  cuerpo.innerHTML = filas.map(item => {
    const diasTexto =
      item.estado === "pendiente_activacion"
        ? "Sin activar"
        : item.dias == null
          ? "—"
          : item.dias < 0
            ? `${Math.abs(item.dias)} días vencida`
            : item.dias === 0
              ? "Vence hoy"
              : `${item.dias} días`;

    return `
      <tr>
        <td><b>${escaparHtml(item.numero)}</b></td>
        <td>${escaparHtml(item.nombre)}</td>
        <td>${escaparHtml(item.telefono)}</td>
        <td>${escaparHtml(item.plan)}</td>
        <td>${escaparHtml(item.tipo)}</td>
        <td>
          <span class="statusBadge ${claseEstadoMembresiaAdmin(item.estado)}">
            ${escaparHtml(textoEstadoMembresiaAdmin(item.estado))}
          </span>
        </td>
        <td>${escaparHtml(formatearFechaMembresia(item.inicio))}</td>
        <td>${escaparHtml(formatearFechaMembresia(item.fin))}</td>
        <td>${escaparHtml(diasTexto)}</td>
        <td>
          <div class="cardActions" style="margin-top:0">
            ${
              item.estado === "pendiente_activacion"
                ? `<button onclick="copiarNumeroMembresia('${escaparHtml(item.numero)}')">Copiar</button>`
                : `<button class="approve" onclick="renovarMembresia('${escaparHtml(item.id)}')">Renovar</button>`
            }
            ${
              !["pendiente_activacion","cancelada"].includes(item.estado)
                ? `<button onclick="suspenderMembresia('${escaparHtml(item.id)}')">Suspender</button>`
                : ""
            }
            ${
              item.estado !== "cancelada"
                ? `<button class="reject" onclick="cancelarMembresia('${escaparHtml(item.id)}')">Cancelar</button>`
                : ""
            }
          </div>
        </td>
      </tr>
    `;
  }).join("");

  renderMembershipKpis();
}

function extraerConsecutivoMembresia(valor){
  const match = String(valor || "")
    .trim()
    .toUpperCase()
    .match(/^ASC-(\d{6})$/);

  return match ? Number(match[1]) : null;
}

async function obtenerMayorMembresiaExistente(){
  if (!firestoreGetDocs) {
    throw new Error("No se pudo leer la colección de membresías.");
  }

  const snapshot = await firestoreGetDocs(
    firestoreCollection(db,"membresias")
  );

  let maximo = 0;

  snapshot.docs.forEach(documento => {
    const datos = documento.data();

    [
      documento.id,
      datos.numeroMembresia
    ].forEach(valor => {
      const numero = extraerConsecutivoMembresia(valor);

      if (numero != null) {
        maximo = Math.max(maximo,numero);
      }
    });
  });

  return maximo;
}

async function reservarMembresiasNuevas(cantidad,plan){
  if (!firestoreRunTransaction) {
    throw new Error("Firebase no tiene disponible la transacción de seguridad.");
  }

  /*
    La pantalla se conserva exactamente igual.
    Solo cambiamos la forma de crear los folios.

    1. Buscamos el número más alto REAL en Firestore.
    2. Dentro de una transacción comprobamos cada documento candidato.
    3. Solo se crea si NO existe.
    4. Si existe, avanzamos al siguiente.
    5. Al ser una transacción, Firestore vuelve a intentar si otro Admin
       crea el mismo folio al mismo tiempo.
    6. Jamás se usa update/merge sobre una membresía existente.
  */
  const mayorExistente = await obtenerMayorMembresiaExistente();

  return await firestoreRunTransaction(
    db,
    async transaction => {
      const numeros = [];
      const referencias = [];

      let candidato = mayorExistente + 1;

      while (numeros.length < cantidad) {
        if (candidato > 999999) {
          throw new Error("Se agotó el rango de números de membresía.");
        }

        const numero =
          `ASC-${String(candidato).padStart(6,"0")}`;

        const ref = firestoreDoc(
          db,
          "membresias",
          numero
        );

        const snap = await transaction.get(ref);

        if (!snap.exists()) {
          numeros.push(numero);
          referencias.push(ref);
        }

        candidato += 1;
      }

      referencias.forEach((ref,index) => {
        const numero = numeros[index];

        transaction.set(
          ref,
          {
            numeroMembresia: numero,
            estado: "disponible",
            estadoMembresia: "pendiente_activacion",
            plan,
            duracionMeses: 12,

            uidUsuario: "",
            nombreRegistro: "",
            telefonoRegistro: "",
            correo: "",
            tipoCliente: "",

            /*
              Como antes: el folio se entrega primero.
              La vigencia comienza cuando el cliente lo usa al registrarse.
            */
            fechaInicio: null,
            fechaFin: null,
            inicioVigencia: null,
            finVigencia: null,

            creadoEn: firestoreServerTimestamp(),
            creadoPorAdmin: true
          }
        );
      });

      return numeros;
    }
  );
}

window.abrirGeneradorMembresias = () => {
  openModal(
    "Generar membresías",
    `
      <p>Se crearán folios nuevos listos para entregar al cliente.</p>

      <p>
        <b>Cantidad</b><br>
        <select id="membershipGenerateQuantity" style="width:100%;padding:10px;margin-top:6px;">
          <option value="1">1 membresía</option>
          <option value="10">10 membresías</option>
          <option value="50">50 membresías</option>
          <option value="100">100 membresías</option>
        </select>
      </p>

      <p>
        <b>Plan</b><br>
        <select id="membershipGeneratePlan" style="width:100%;padding:10px;margin-top:6px;">
          <option value="anual">Anual · 12 meses</option>
        </select>
      </p>

      <p>
        La vigencia comenzará cuando el cliente use el folio al registrarse.
      </p>

      <div class="cardActions">
        <button class="approve" onclick="generarMembresiasAdmin()">Generar</button>
      </div>
    `
  );
};

window.generarMembresiasAdmin = async () => {
  if (
    !firebaseReady ||
    !firestoreDoc ||
    !firestoreGetDocs ||
    !firestoreRunTransaction
  ) {
    openModal(
      "Firebase no está listo",
      "<p>No se pudo iniciar el generador de membresías. Actualiza la página e inténtalo nuevamente.</p>"
    );
    return;
  }

  const cantidad = Math.min(
    100,
    Math.max(
      1,
      Number(
        document.getElementById("membershipGenerateQuantity")?.value || 1
      )
    )
  );

  const plan =
    document.getElementById("membershipGeneratePlan")?.value ||
    "anual";

  const confirmar = window.confirm(
    `¿Generar ${cantidad} membresía${cantidad === 1 ? "" : "s"} nueva${cantidad === 1 ? "" : "s"}? Las ya existentes NO serán modificadas.`
  );

  if (!confirmar) return;

  try {
    const numeros = await reservarMembresiasNuevas(
      cantidad,
      plan
    );

    openModal(
      "Membresías generadas",
      `
        <p>Se generaron <b>${numeros.length}</b> membresías nuevas.</p>
        <p><b>Primera:</b> ${escaparHtml(numeros[0])}</p>
        <p><b>Última:</b> ${escaparHtml(numeros[numeros.length - 1])}</p>
        <p><b>Ninguna membresía existente fue modificada.</b></p>
      `
    );
  } catch (error) {
    console.error("Error generando membresías:",error);

    openModal(
      "No fue posible generar",
      `
        <p><b>No se modificó ninguna membresía existente.</b></p>
        <p>Detalle: ${escaparHtml(error?.message || String(error))}</p>
      `
    );
  }
};

window.copiarNumeroMembresia = async numero => {
  try {
    await navigator.clipboard.writeText(numero);
    window.alert(`Copiado: ${numero}`);
  } catch (_) {
    window.prompt("Copia el número de membresía:",numero);
  }
};

function fechaFinRenovada(membresia){
  const finActual = fechaDesdeFirestore(
    membresia.fechaFin ||
    membresia.finVigencia ||
    membresia.fin ||
    membresia.fechaVencimiento ||
    membresia.vencimiento ||
    membresia.vigencia
  );

  const base = finActual && finActual > new Date()
    ? new Date(finActual)
    : new Date();

  base.setFullYear(base.getFullYear() + 1);
  return base;
}

async function actualizarUsuarioPorMembresia(membresia,cambiosUsuario){
  const uid = String(membresia.uidUsuario || "").trim();
  if (!uid) return;

  await firestoreUpdateDoc(
    firestoreDoc(db,"usuarios",uid),
    {
      ...cambiosUsuario,
      actualizadoEn: firestoreServerTimestamp()
    }
  );
}

window.renovarMembresia = async id => {
  const membresia = state.memberships.find(m => m.id === id);
  if (!membresia) return;

  const confirmar = window.confirm(
    `¿Renovar ${membresia.numeroMembresia || id} por 12 meses?`
  );
  if (!confirmar) return;

  const nuevaFechaFin = fechaFinRenovada(membresia);

  try {
    await firestoreUpdateDoc(
      firestoreDoc(db,"membresias",id),
      {
        estado: "asignada",
        estadoMembresia: "activa",
        fechaFin: nuevaFechaFin,
        finVigencia: nuevaFechaFin,
        vigencia: nuevaFechaFin,
        ultimaRenovacionEn: firestoreServerTimestamp()
      }
    );

    await actualizarUsuarioPorMembresia(
      membresia,
      {
        estadoMembresia: "activa",
        tieneMembresia: true,
        vigencia: nuevaFechaFin,
        puedeUsarAlertas: true
      }
    );
  } catch (error) {
    console.error("Error renovando membresía:",error);
    openModal(
      "No fue posible renovar",
      `<p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

window.suspenderMembresia = async id => {
  const membresia = state.memberships.find(m => m.id === id);
  if (!membresia) return;

  if (!window.confirm(`¿Suspender ${membresia.numeroMembresia || id}?`)) return;

  try {
    await firestoreUpdateDoc(
      firestoreDoc(db,"membresias",id),
      {
        estadoMembresia: "suspendida",
        suspendidaEn: firestoreServerTimestamp()
      }
    );

    await actualizarUsuarioPorMembresia(
      membresia,
      {
        estadoMembresia: "suspendida",
        puedeUsarAlertas: false
      }
    );
  } catch (error) {
    console.error("Error suspendiendo membresía:",error);
    openModal(
      "No fue posible suspender",
      `<p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

window.cancelarMembresia = async id => {
  const membresia = state.memberships.find(m => m.id === id);
  if (!membresia) return;

  if (!window.confirm(`¿Cancelar definitivamente ${membresia.numeroMembresia || id}?`)) return;

  try {
    await firestoreUpdateDoc(
      firestoreDoc(db,"membresias",id),
      {
        estado: "cancelada",
        estadoMembresia: "cancelada",
        canceladaEn: firestoreServerTimestamp()
      }
    );

    await actualizarUsuarioPorMembresia(
      membresia,
      {
        estadoMembresia: "cancelada",
        tieneMembresia: false,
        puedeUsarAlertas: false
      }
    );
  } catch (error) {
    console.error("Error cancelando membresía:",error);
    openModal(
      "No fue posible cancelar",
      `<p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
    );
  }
};

function recombinarVehiculosDesdeUsuarios(){
  const vehiculosSubcoleccion = [...vehicleSnapshotsByUser.values()]
    .flat();

  state.vehicles = combinarVehiculosRaizYSubcolecciones(
    vehiculosSubcoleccion
  ).sort((a,b) =>
    obtenerMilisegundos(b.creadoEn) - obtenerMilisegundos(a.creadoEn)
  );

  reconstruirAutorizaciones();
  actualizarInterfazFirebase();
}

function detenerListenersVehiculos(){
  unsubscribeVehicles.forEach(unsub => {
    try {
      unsub?.();
    } catch (error) {
      console.warn("No fue posible cerrar un listener de vehículos:",error);
    }
  });

  unsubscribeVehicles = [];
  vehicleSnapshotsByUser.clear();
}

function escucharVehiculosPorUsuarios(){
  if (!firebaseReady || !state.clients.length) {
    state.vehicles = combinarVehiculosRaizYSubcolecciones([]);
    renderVehicles();
    renderMemberships();
    return;
  }

  detenerListenersVehiculos();

  state.clients.forEach(cliente => {
    const referenciaVehiculos = firestoreCollection(
      db,
      "usuarios",
      cliente.id,
      "vehiculos"
    );

    const unsubscribe = firestoreOnSnapshot(
      referenciaVehiculos,
      snapshot => {
        const vehiculosCliente = snapshot.docs.map(documento => {
          const datos = documento.data();

          return {
            id: documento.id,
            uidCliente: cliente.id,
            path: documento.ref.path,
            marca: datos.marca || "",
            subMarca: datos.subMarca || "",
            color: datos.color || "",
            placas: datos.placas || "",
            serie: datos.serie || "",
            membresiaAplicada: datos.membresiaAplicada === true,
            estadoMembresiaVehiculo:
              datos.estadoMembresiaVehiculo ||
              (datos.membresiaAplicada === true ? "activo" : "sin_membresia"),
            requiereAutorizacion: datos.requiereAutorizacion === true,
            numeroMembresiaSolicitada: datos.numeroMembresiaSolicitada || "",
            solicitudMembresiaEn: datos.solicitudMembresiaEn || null,
            creadoEn: datos.creadoEn || null,
            raw: datos
          };
        });

        vehicleSnapshotsByUser.set(
          cliente.id,
          vehiculosCliente
        );

        recombinarVehiculosDesdeUsuarios();
      },
      error => {
        console.error(
          `Error leyendo vehículos de ${cliente.id}:`,
          error
        );
      }
    );

    unsubscribeVehicles.push(unsubscribe);
  });
}

function escucharMembresias(){
  if (!firebaseReady) return;

  if (typeof unsubscribeMemberships === "function") {
    unsubscribeMemberships();
  }

  unsubscribeMemberships = firestoreOnSnapshot(
    firestoreCollection(db,"membresias"),
    snapshot => {
      state.memberships = snapshot.docs.map(documento => ({
        id: documento.id,
        ...documento.data()
      }));

      console.log(
        "Membresías cargadas desde Firebase:",
        state.memberships.length
      );

      renderMemberships();
      renderMembershipKpis();
    },
    error => {
      console.error("Error leyendo membresías:",error);

      openModal(
        "Error leyendo membresías",
        `<p>Firebase no permitió leer la colección membresias.</p><p><b>Detalle:</b> ${escaparHtml(error?.message || String(error))}</p>`
      );
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
      sincronizarListenersCotizacionesGrua();
      actualizarInterfazFirebase();
    },
    error => {
      console.error("Error leyendo solicitudes:",error);
    }
  );
}


function obtenerSolicitudesGruaCotizacion(){
  return state.services.filter(s => s.servicio === "Grúa" && ["pendiente_cotizacion","esperando_autorizacion_cliente","asignado"].includes(String(s.estadoRaw || "")) && (s.raw?.grua || s.raw?.cotizacionAutorizada));
}

function sincronizarListenersCotizacionesGrua(){
  if (!firebaseReady || !firestoreOnSnapshot || !firestoreCollection) return;
  const ids = new Set(obtenerSolicitudesGruaCotizacion().map(s => s.id));
  for (const [id, unsub] of towQuoteUnsubscribers.entries()) {
    if (!ids.has(id)) { unsub?.(); towQuoteUnsubscribers.delete(id); state.towQuotes.delete(id); }
  }
  ids.forEach(id => {
    if (towQuoteUnsubscribers.has(id)) return;
    const unsub = firestoreOnSnapshot(firestoreCollection(db,"solicitudes",id,"cotizaciones"), snapshot => {
      state.towQuotes.set(id, snapshot.docs.map(d => ({id:d.id,...d.data()})));
      renderTowQuotes();
    }, error => console.error("Error leyendo cotizaciones",id,error));
    towQuoteUnsubscribers.set(id,unsub);
  });
}

function renderTowQuotes(){
  const body=document.getElementById("towQuotesBody"); if(!body) return;
  const list=obtenerSolicitudesGruaCotizacion().sort((a,b)=>obtenerMilisegundos(b.fecha)-obtenerMilisegundos(a.fecha));
  if(!list.length){body.innerHTML='<tr><td colspan="8">No hay solicitudes de grúa en cotización.</td></tr>';return;}
  body.innerHTML=list.map(s=>{
    const g=s.raw?.grua||{}; const quotes=state.towQuotes.get(s.id)||[];
    const carga=g.esVehiculoCarga ? (g.estadoCarga==="con_carga" ? `Con carga · ${g.tipoCarga||""} ${g.pesoCargaAproximado||""}`.trim() : "Vacío") : "No es carga";
    return `<tr><td><b>${escaparHtml(s.folio)}</b></td><td>${escaparHtml(s.cliente)}</td><td>${escaparHtml(g.categoria||"-")}</td><td>${escaparHtml(g.condicion||"-")}</td><td>${escaparHtml(carga)}</td><td><span class="quoteCount">${quotes.length}</span></td><td><span class="statusBadge ${statusClass(s.estado)}">${escaparHtml(s.estado)}</span></td><td><button class="tableAction" onclick="verCotizacionesGruaAdmin('${escaparHtml(s.id)}')">Ver</button></td></tr>`;
  }).join("");
}

window.verCotizacionesGruaAdmin=id=>{
  const s=state.services.find(x=>x.id===id); if(!s)return; const g=s.raw?.grua||{}; const quotes=state.towQuotes.get(id)||[];
  const propuestas=quotes.length?quotes.sort((a,b)=>Number(a.precio||0)-Number(b.precio||0)).map(q=>`<article><b>${escaparHtml(q.nombreProveedor||q.proveedorUid||"Proveedor")}</b> · ${formatearDinero(q.precio)}<small>ETA ${escaparHtml(q.tiempoEstimadoMinutos||"-")} min · ${escaparHtml(q.estado||"enviada")}</small>${q.observaciones?`<p>${escaparHtml(q.observaciones)}</p>`:""}</article>`).join(""):'<p>Aún no hay cotizaciones.</p>';
  openModal(`Cotizaciones ${s.folio}`,`<p><b>Categoría:</b> ${escaparHtml(g.categoria||"-")}</p><p><b>Condición:</b> ${escaparHtml(g.condicion||"-")}</p><p><b>Liberación:</b> ${escaparHtml(g.liberacion||"-")}</p><p><b>Destino:</b> ${escaparHtml(g.destino||s.raw?.destino||"-")}</p><p><b>Carga:</b> ${g.esVehiculoCarga?escaparHtml(`${g.estadoCarga||""} ${g.tipoCarga||""} ${g.pesoCargaAproximado||""}`.trim()):"No"}</p><hr style="border:0;border-top:1px solid #29435c"><div class="quoteDetail">${propuestas}</div>`);
};

window.addEventListener("beforeunload",() => {
  unsubscribeServices?.();
  unsubscribeProviders?.();
  unsubscribeClients?.();
  towQuoteUnsubscribers.forEach(unsub=>unsub?.());
  towQuoteUnsubscribers.clear();
  detenerListenersVehiculos();
});

renderKpis();
renderServices();
renderAuthorizations();
renderProviders();
renderClients();
renderVehicles();
renderMemberships();
setToday();
initMaps();
drawIncomeChart();
iniciarFirebaseAdmin();
