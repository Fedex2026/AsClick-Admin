import {
  auth,
  db
} from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

/* =========================================
   ELEMENTOS PRINCIPALES
========================================= */

const registerForm =
  document.getElementById("registerForm");

const registerMessage =
  document.getElementById("registerMessage");

const registerButton =
  document.getElementById("registerButton");

const registerButtonText =
  document.getElementById("registerButtonText");

const registerSpinner =
  document.getElementById("registerSpinner");

/* =========================================
   TIPO DE REGISTRO
========================================= */

const optionWithMembership =
  document.getElementById("optionWithMembership");

const optionWithoutMembership =
  document.getElementById("optionWithoutMembership");

const tieneMembresiaInput =
  document.getElementById("tieneMembresia");

const membershipNumberBlock =
  document.getElementById("membershipNumberBlock");

const nonMemberNotice =
  document.getElementById("nonMemberNotice");

const numeroMembresiaInput =
  document.getElementById("numeroMembresia");

/* =========================================
   AFILIACIÓN MONTEC / ACME
========================================= */

const afiliacionGremialInput =
  document.getElementById("afiliacionGremial");

const montecNumberBlock =
  document.getElementById("montecNumberBlock");

const acmeNumberBlock =
  document.getElementById("acmeNumberBlock");

const numeroEstampaMontecInput =
  document.getElementById("numeroEstampaMontec");

const numeroEstampaAcmeInput =
  document.getElementById("numeroEstampaAcme");

/* =========================================
   DATOS PERSONALES
========================================= */

const nombreInput =
  document.getElementById("nombre");

const telefonoInput =
  document.getElementById("telefono");

const tipoClienteInput =
  document.getElementById("tipoCliente");

/* =========================================
   DATOS DE ACCESO
========================================= */

const emailInput =
  document.getElementById("email");

const passwordInput =
  document.getElementById("password");

const confirmPasswordInput =
  document.getElementById("confirmPassword");

const passwordToggle =
  document.getElementById("passwordToggle");

const confirmPasswordToggle =
  document.getElementById("confirmPasswordToggle");

/* =========================================
   DATOS DEL VEHÍCULO
========================================= */

const marcaInput =
  document.getElementById("marca");

const subMarcaInput =
  document.getElementById("subMarca");

const colorInput =
  document.getElementById("color");

const placasInput =
  document.getElementById("placas");

const serieInput =
  document.getElementById("serie");

/* =========================================
   TÉRMINOS
========================================= */

const acceptTerms =
  document.getElementById("acceptTerms");

const termsButton =
  document.getElementById("termsButton");

const privacyButton =
  document.getElementById("privacyButton");

/* =========================================
   MODAL
========================================= */

const infoModal =
  document.getElementById("infoModal");

const infoModalIcon =
  document.getElementById("infoModalIcon");

const infoModalTitle =
  document.getElementById("infoModalTitle");

const infoModalText =
  document.getElementById("infoModalText");

const closeInfoModal =
  document.getElementById("closeInfoModal");

const acceptInfoModal =
  document.getElementById("acceptInfoModal");

/* =========================================
   CAMPOS DE ERROR
========================================= */

const errores = {
  numeroMembresia:
    document.getElementById("numeroMembresiaError"),

  numeroEstampaMontec:
    document.getElementById("numeroEstampaMontecError"),

  numeroEstampaAcme:
    document.getElementById("numeroEstampaAcmeError"),

  nombre:
    document.getElementById("nombreError"),

  telefono:
    document.getElementById("telefonoError"),

  tipoCliente:
    document.getElementById("tipoClienteError"),

  email:
    document.getElementById("emailError"),

  password:
    document.getElementById("passwordError"),

  confirmPassword:
    document.getElementById("confirmPasswordError"),

  marca:
    document.getElementById("marcaError"),

  subMarca:
    document.getElementById("subMarcaError"),

  color:
    document.getElementById("colorError"),

  placas:
    document.getElementById("placasError"),

  serie:
    document.getElementById("serieError"),

  terms:
    document.getElementById("termsError")
};

/* =========================================
   CAMBIAR ENTRE MIEMBRO Y NO MIEMBRO
========================================= */

optionWithMembership?.addEventListener(
  "click",
  () => seleccionarTipoRegistro(true)
);

optionWithoutMembership?.addEventListener(
  "click",
  () => seleccionarTipoRegistro(false)
);

function seleccionarTipoRegistro(esMiembro) {
  tieneMembresiaInput.value =
    esMiembro ? "si" : "no";

  optionWithMembership.classList.toggle(
    "active",
    esMiembro
  );

  optionWithoutMembership.classList.toggle(
    "active",
    !esMiembro
  );

  membershipNumberBlock.hidden =
    !esMiembro;

  nonMemberNotice.hidden =
    esMiembro;

  if (!esMiembro) {
    numeroMembresiaInput.value = "";
    limpiarError(
      numeroMembresiaInput,
      errores.numeroMembresia
    );
  }
}

afiliacionGremialInput?.addEventListener(
  "change",
  actualizarCamposAfiliacion
);

function actualizarCamposAfiliacion() {
  const afiliacion =
    afiliacionGremialInput?.value || "ninguna";

  const mostrarMontec =
    afiliacion === "montec" || afiliacion === "ambos";

  const mostrarAcme =
    afiliacion === "acme" || afiliacion === "ambos";

  if (montecNumberBlock) {
    montecNumberBlock.hidden = !mostrarMontec;
  }

  if (acmeNumberBlock) {
    acmeNumberBlock.hidden = !mostrarAcme;
  }

  if (!mostrarMontec && numeroEstampaMontecInput) {
    numeroEstampaMontecInput.value = "";
    limpiarError(
      numeroEstampaMontecInput,
      errores.numeroEstampaMontec
    );
  }

  if (!mostrarAcme && numeroEstampaAcmeInput) {
    numeroEstampaAcmeInput.value = "";
    limpiarError(
      numeroEstampaAcmeInput,
      errores.numeroEstampaAcme
    );
  }
}

/* =========================================
   ENVÍO DEL FORMULARIO
========================================= */

registerForm?.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    limpiarTodosLosErrores();

    const datos = obtenerDatosFormulario();

    if (!validarFormulario(datos)) {
      mostrarMensaje(
        "Revisa los campos marcados antes de continuar.",
        "error"
      );

      enfocarPrimerError();
      return;
    }

    activarCarga(true);

    let usuarioCreado = null;

    try {
      /*
        Primero se crea el usuario en Firebase Authentication
        con el correo y contraseña elegidos por el cliente.
      */

      const credencial =
        await createUserWithEmailAndPassword(
          auth,
          datos.email,
          datos.password
        );

      usuarioCreado = credencial.user;

      if (datos.tieneMembresia) {
        await validarMembresiaAntesDeCrearCuenta(
          datos.numeroMembresia
        );
      }

      await updateProfile(
        usuarioCreado,
        {
          displayName: datos.nombre
        }
      );

      if (datos.tieneMembresia) {
        await registrarClienteConMembresia(
          usuarioCreado,
          datos
        );
      } else {
        await registrarClienteSinMembresia(
          usuarioCreado,
          datos
        );
      }

      mostrarMensaje(
        datos.tieneMembresia
          ? "Cuenta creada correctamente. Tu membresía quedó vinculada."
          : "Cuenta creada correctamente como cliente sin membresía.",
        "success"
      );

      /*
        Cerramos la sesión para que el cliente ingrese
        normalmente desde login.html.
      */

      await signOut(auth);

      registerForm.reset();
      seleccionarTipoRegistro(true);

      setTimeout(() => {
        window.location.href =
          "login.html?registro=exitoso";
      }, 1600);
    } catch (error) {
      console.error(
        "Error al crear la cuenta:",
        error
      );

      /*
        Si Authentication creó la cuenta, pero ocurrió
        un error al guardar Firestore, eliminamos la cuenta
        incompleta para que pueda volver a intentarlo.
      */

      if (
        usuarioCreado &&
        debeEliminarCuentaIncompleta(error)
      ) {
        try {
          await deleteUser(usuarioCreado);
        } catch (deleteError) {
          console.error(
            "No se pudo eliminar la cuenta incompleta:",
            deleteError
          );
        }
      }

      mostrarMensaje(
        obtenerMensajeError(error),
        "error"
      );
    } finally {
      activarCarga(false);
    }
  }
);

/* =========================================
   OBTENER DATOS
========================================= */

function obtenerDatosFormulario() {
  const tieneMembresia =
    tieneMembresiaInput.value === "si";

  return {
    tieneMembresia,

    numeroMembresia:
      tieneMembresia
        ? normalizarNumeroMembresia(
            numeroMembresiaInput.value
          )
        : "",

    afiliacionGremial:
      afiliacionGremialInput?.value || "ninguna",

    numeroEstampaMontec:
      numeroEstampaMontecInput?.value
        .trim()
        .toUpperCase() || "",

    numeroEstampaAcme:
      numeroEstampaAcmeInput?.value
        .trim()
        .toUpperCase() || "",

    nombre:
      limpiarTexto(nombreInput.value),

    telefono:
      telefonoInput.value.replace(/\D/g, ""),

    tipoCliente:
      tipoClienteInput.value,

    email:
      emailInput.value
        .trim()
        .toLowerCase(),

    password:
      passwordInput.value,

    confirmPassword:
      confirmPasswordInput.value,

    marca:
      limpiarTexto(marcaInput.value),

    subMarca:
      limpiarTexto(subMarcaInput.value),

    color:
      limpiarTexto(colorInput.value),

    placas:
      placasInput.value
        .trim()
        .toUpperCase(),

    serie:
      serieInput.value
        .trim()
        .toUpperCase()
        .replace(/\s/g, "")
  };
}

function limpiarTexto(texto) {
  return texto
    .trim()
    .replace(/\s+/g, " ");
}

function normalizarNumeroMembresia(numero) {
  return numero
    .trim()
    .toUpperCase()
    .replace(/\s/g, "")
    .replace(/;$/, "");
}

/* =========================================
   REGISTRO CON MEMBRESÍA
========================================= */

async function obtenerReferenciaMembresia(numeroMembresia) {
  const referenciaDirecta = doc(
    db,
    "membresias",
    numeroMembresia
  );

  const directa = await getDoc(referenciaDirecta);

  if (directa.exists()) {
    return referenciaDirecta;
  }

  // Compatibilidad con membresías creadas anteriormente con ID automático.
  const consulta = query(
    collection(db, "membresias"),
    where("numeroMembresia", "==", numeroMembresia)
  );

  const resultado = await getDocs(consulta);

  if (!resultado.empty) {
    return resultado.docs[0].ref;
  }

  return null;
}

async function validarMembresiaAntesDeCrearCuenta(numeroMembresia) {
  const referencia = await obtenerReferenciaMembresia(numeroMembresia);

  if (!referencia) {
    throw crearErrorPersonalizado(
      "membership/not-found",
      "El número de membresía no existe."
    );
  }

  const documento = await getDoc(referencia);
  const membresia = documento.data();
  validarDisponibilidadMembresia(membresia, "");
}

function normalizarEstadoMembresia(valor) {
  const estado = String(valor || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const equivalencias = {
    activo: "activa",
    active: "activa",
    asignada: "activa",
    asignado: "activa",
    disponible: "activa",
    vigente: "activa",
    cancelado: "cancelada",
    vencido: "vencida"
  };

  return equivalencias[estado] || estado;
}

function validarDisponibilidadMembresia(membresia, uidUsuario) {
  const uidVinculado = membresia.uidUsuario || "";
  const estado = normalizarEstadoMembresia(
    membresia.estadoMembresia || membresia.estado || "activa"
  );

  if (uidVinculado && uidVinculado !== uidUsuario) {
    throw crearErrorPersonalizado(
      "membership/already-used",
      "Esta membresía ya está vinculada a otra cuenta."
    );
  }

  if (estado === "cancelada") {
    throw crearErrorPersonalizado(
      "membership/cancelled",
      "Esta membresía está cancelada."
    );
  }

  if (estado === "vencida") {
    throw crearErrorPersonalizado(
      "membership/expired",
      "Esta membresía está vencida."
    );
  }
}

async function registrarClienteConMembresia(
  usuario,
  datos
) {
  const membresiaRef = await obtenerReferenciaMembresia(
    datos.numeroMembresia
  );

  if (!membresiaRef) {
    throw crearErrorPersonalizado(
      "membership/not-found",
      "El número de membresía no existe."
    );
  }

  const usuarioRef = doc(
    db,
    "usuarios",
    usuario.uid
  );

  await runTransaction(
    db,
    async transaction => {
      const membresiaSnap = await transaction.get(membresiaRef);

      if (!membresiaSnap.exists()) {
        throw crearErrorPersonalizado(
          "membership/not-found",
          "El número de membresía no existe."
        );
      }

      const membresia = membresiaSnap.data();

      validarDisponibilidadMembresia(
        membresia,
        usuario.uid
      );

      /*
        Si el folio fue generado por Admin, llega como:
        estadoMembresia = "pendiente_activacion"
        fechaInicio = null
        fechaFin = null

        Al usarlo por primera vez se activa aquí mismo.
      */
      const uidVinculado = String(
        membresia.uidUsuario || ""
      ).trim();

      const esPrimeraActivacion =
        uidVinculado === "";

      let fechaInicio =
        membresia.fechaInicio ||
        membresia.inicioVigencia ||
        null;

      let fechaFin =
        membresia.fechaFin ||
        membresia.finVigencia ||
        membresia.vigencia ||
        null;

      if (
        esPrimeraActivacion ||
        !fechaInicio ||
        !fechaFin
      ) {
        const inicio = new Date();
        const fin = new Date(inicio);

        const meses =
          Number(membresia.duracionMeses) ||
          (
            String(membresia.plan || "").toLowerCase() === "mensual"
              ? 1
              : 12
          );

        fin.setMonth(
          fin.getMonth() + meses
        );

        fechaInicio =
          Timestamp.fromDate(inicio);

        fechaFin =
          Timestamp.fromDate(fin);
      }

      const estadoMembresia = "activa";

      const perfilUsuario = construirPerfilUsuario(
        usuario,
        datos,
        {
          tieneMembresia: true,
          numeroMiembro: datos.numeroMembresia,
          estadoMembresia,
          tipoMembresia:
            membresia.tipoMembresia ||
            membresia.plan ||
            datos.tipoCliente,
          vigencia: fechaFin,
          tarifa: "preferencial",
          puedeUsarAlertas: true
        }
      );

      transaction.set(
        usuarioRef,
        perfilUsuario,
        { merge: true }
      );

      transaction.set(
        membresiaRef,
        {
          numeroMembresia:
            datos.numeroMembresia,

          uidUsuario:
            usuario.uid,

          correo:
            datos.email,

          nombreRegistro:
            datos.nombre,

          telefonoRegistro:
            datos.telefono,

          tipoCliente:
            datos.tipoCliente,

          estado:
            "asignada",

          estadoMembresia:
            "activa",

          puedeUsarAlertas:
            true,

          fechaVinculacion:
            serverTimestamp(),

          fechaInicio,
          fechaFin,

          inicioVigencia:
            fechaInicio,

          finVigencia:
            fechaFin,

          vigencia:
            fechaFin,

          marcaRegistro:
            datos.marca,

          subMarcaRegistro:
            datos.subMarca,

          colorRegistro:
            datos.color,

          placasRegistro:
            datos.placas,

          serieRegistro:
            datos.serie
        },
        { merge: true }
      );
    }
  );
}

/* =========================================
   REGISTRO SIN MEMBRESÍA
========================================= */

async function registrarClienteSinMembresia(
  usuario,
  datos
) {
  const usuarioRef = doc(
    db,
    "usuarios",
    usuario.uid
  );

  const perfilUsuario =
    construirPerfilUsuario(
      usuario,
      datos,
      {
        tieneMembresia: false,
        numeroMiembro: "",
        estadoMembresia:
          "sin_membresia",
        tipoMembresia: "",
        vigencia: "",
        tarifa:
          "publico_general",
        puedeUsarAlertas: false
      }
    );

  await setDoc(
    usuarioRef,
    perfilUsuario
  );
}

/* =========================================
   PERFIL QUE SE GUARDA EN FIRESTORE
========================================= */

function construirPerfilUsuario(
  usuario,
  datos,
  membresia
) {
  return {
    uid: usuario.uid,

    nombre:
      datos.nombre,

    telefono:
      datos.telefono,

    correo:
      datos.email,

    rol:
      "cliente",

    tipoCliente:
      datos.tipoCliente,

    tieneMembresia:
      membresia.tieneMembresia,

    numeroMiembro:
      membresia.numeroMiembro,

    estadoMembresia:
      membresia.estadoMembresia,

    tipoMembresia:
      membresia.tipoMembresia,

    vigencia:
      membresia.vigencia,

    tarifa:
      membresia.tarifa,

    puedeUsarAlertas:
      membresia.puedeUsarAlertas,

    afiliacionGremial:
      datos.afiliacionGremial || "ninguna",

    afiliaciones: {
      montec: {
        activo:
          datos.afiliacionGremial === "montec" ||
          datos.afiliacionGremial === "ambos",
        numeroEstampa:
          datos.numeroEstampaMontec || ""
      },
      acme: {
        activo:
          datos.afiliacionGremial === "acme" ||
          datos.afiliacionGremial === "ambos",
        numeroEstampa:
          datos.numeroEstampaAcme || ""
      }
    },

    marca:
      datos.marca,

    subMarca:
      datos.subMarca,

    color:
      datos.color,

    placas:
      datos.placas,

    serie:
      datos.serie,

    vehiculoPrincipal: {
      marca:
        datos.marca,

      subMarca:
        datos.subMarca,

      color:
        datos.color,

      placas:
        datos.placas,

      serie:
        datos.serie
    },

    activo:
      true,

    fechaRegistro:
      serverTimestamp(),

    actualizadoEn:
      serverTimestamp()
  };
}

/* =========================================
   VALIDACIÓN
========================================= */

function validarFormulario(datos) {
  let valido = true;

  if (datos.tieneMembresia) {
    if (!datos.numeroMembresia) {
      marcarError(
        numeroMembresiaInput,
        errores.numeroMembresia,
        "Escribe tu número de membresía."
      );

      valido = false;
    } else if (
      !/^ASC-\d{6}$/.test(
        datos.numeroMembresia
      )
    ) {
      marcarError(
        numeroMembresiaInput,
        errores.numeroMembresia,
        "Usa el formato ASC-000245."
      );

      valido = false;
    }
  }

  if (
    (datos.afiliacionGremial === "montec" ||
      datos.afiliacionGremial === "ambos") &&
    !datos.numeroEstampaMontec
  ) {
    marcarError(
      numeroEstampaMontecInput,
      errores.numeroEstampaMontec,
      "Escribe tu número de estampa MONTEC."
    );

    valido = false;
  }

  if (
    (datos.afiliacionGremial === "acme" ||
      datos.afiliacionGremial === "ambos") &&
    !datos.numeroEstampaAcme
  ) {
    marcarError(
      numeroEstampaAcmeInput,
      errores.numeroEstampaAcme,
      "Escribe tu número de estampa ACME."
    );

    valido = false;
  }

  if (!datos.nombre) {
    marcarError(
      nombreInput,
      errores.nombre,
      "Escribe tu nombre completo."
    );

    valido = false;
  } else if (
    datos.nombre.length < 3
  ) {
    marcarError(
      nombreInput,
      errores.nombre,
      "El nombre es demasiado corto."
    );

    valido = false;
  }

  if (!datos.telefono) {
    marcarError(
      telefonoInput,
      errores.telefono,
      "Escribe tu teléfono."
    );

    valido = false;
  } else if (
    datos.telefono.length !== 10
  ) {
    marcarError(
      telefonoInput,
      errores.telefono,
      "El teléfono debe tener 10 dígitos."
    );

    valido = false;
  }

  if (!datos.tipoCliente) {
    marcarError(
      tipoClienteInput,
      errores.tipoCliente,
      "Selecciona particular o servicio público."
    );

    valido = false;
  }

  if (!datos.email) {
    marcarError(
      emailInput,
      errores.email,
      "Escribe tu correo electrónico."
    );

    valido = false;
  } else if (
    !correoValido(datos.email)
  ) {
    marcarError(
      emailInput,
      errores.email,
      "Escribe un correo electrónico válido."
    );

    valido = false;
  }

  if (!datos.password) {
    marcarError(
      passwordInput,
      errores.password,
      "Crea una contraseña."
    );

    valido = false;
  } else if (
    datos.password.length < 6
  ) {
    marcarError(
      passwordInput,
      errores.password,
      "La contraseña debe tener mínimo 6 caracteres."
    );

    valido = false;
  }

  if (!datos.confirmPassword) {
    marcarError(
      confirmPasswordInput,
      errores.confirmPassword,
      "Confirma tu contraseña."
    );

    valido = false;
  } else if (
    datos.password !==
    datos.confirmPassword
  ) {
    marcarError(
      confirmPasswordInput,
      errores.confirmPassword,
      "Las contraseñas no coinciden."
    );

    valido = false;
  }

  if (!datos.marca) {
    marcarError(
      marcaInput,
      errores.marca,
      "Escribe la marca."
    );

    valido = false;
  }

  if (!datos.subMarca) {
    marcarError(
      subMarcaInput,
      errores.subMarca,
      "Escribe la submarca."
    );

    valido = false;
  }

  if (!datos.color) {
    marcarError(
      colorInput,
      errores.color,
      "Escribe el color."
    );

    valido = false;
  }

  if (!datos.placas) {
    marcarError(
      placasInput,
      errores.placas,
      "Escribe las placas."
    );

    valido = false;
  } else if (
    datos.placas.length < 4
  ) {
    marcarError(
      placasInput,
      errores.placas,
      "Revisa las placas capturadas."
    );

    valido = false;
  }

  if (!datos.serie) {
    marcarError(
      serieInput,
      errores.serie,
      "Escribe el número de serie."
    );

    valido = false;
  } else if (
    datos.serie.length < 5
  ) {
    marcarError(
      serieInput,
      errores.serie,
      "Revisa el número de serie."
    );

    valido = false;
  }

  if (!acceptTerms.checked) {
    errores.terms.textContent =
      "Debes aceptar los términos y el aviso de privacidad.";

    valido = false;
  }

  return valido;
}

function correoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    correo
  );
}

/* =========================================
   ERRORES VISUALES
========================================= */

function marcarError(
  campo,
  elementoError,
  mensaje
) {
  campo?.classList.add("error");

  if (elementoError) {
    elementoError.textContent =
      mensaje;
  }
}

function limpiarError(
  campo,
  elementoError
) {
  campo?.classList.remove("error");

  if (elementoError) {
    elementoError.textContent = "";
  }
}

function limpiarTodosLosErrores() {
  [
    [
      numeroMembresiaInput,
      errores.numeroMembresia
    ],
    [
      numeroEstampaMontecInput,
      errores.numeroEstampaMontec
    ],
    [
      numeroEstampaAcmeInput,
      errores.numeroEstampaAcme
    ],
    [
      nombreInput,
      errores.nombre
    ],
    [
      telefonoInput,
      errores.telefono
    ],
    [
      tipoClienteInput,
      errores.tipoCliente
    ],
    [
      emailInput,
      errores.email
    ],
    [
      passwordInput,
      errores.password
    ],
    [
      confirmPasswordInput,
      errores.confirmPassword
    ],
    [
      marcaInput,
      errores.marca
    ],
    [
      subMarcaInput,
      errores.subMarca
    ],
    [
      colorInput,
      errores.color
    ],
    [
      placasInput,
      errores.placas
    ],
    [
      serieInput,
      errores.serie
    ]
  ].forEach(([campo, error]) => {
    limpiarError(
      campo,
      error
    );
  });

  errores.terms.textContent = "";
  ocultarMensaje();
}

function enfocarPrimerError() {
  const primerCampoError =
    document.querySelector(
      "input.error, select.error"
    );

  if (primerCampoError) {
    primerCampoError.focus();

    primerCampoError.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

/* =========================================
   LIMPIAR ERROR AL ESCRIBIR
========================================= */

[
  [
    numeroMembresiaInput,
    errores.numeroMembresia
  ],
  [
    numeroEstampaMontecInput,
    errores.numeroEstampaMontec
  ],
  [
    numeroEstampaAcmeInput,
    errores.numeroEstampaAcme
  ],
  [
    nombreInput,
    errores.nombre
  ],
  [
    telefonoInput,
    errores.telefono
  ],
  [
    tipoClienteInput,
    errores.tipoCliente
  ],
  [
    emailInput,
    errores.email
  ],
  [
    passwordInput,
    errores.password
  ],
  [
    confirmPasswordInput,
    errores.confirmPassword
  ],
  [
    marcaInput,
    errores.marca
  ],
  [
    subMarcaInput,
    errores.subMarca
  ],
  [
    colorInput,
    errores.color
  ],
  [
    placasInput,
    errores.placas
  ],
  [
    serieInput,
    errores.serie
  ]
].forEach(([campo, error]) => {
  campo?.addEventListener(
    "input",
    () => {
      limpiarError(
        campo,
        error
      );

      ocultarMensaje();
    }
  );

  campo?.addEventListener(
    "change",
    () => {
      limpiarError(
        campo,
        error
      );

      ocultarMensaje();
    }
  );
});

acceptTerms?.addEventListener(
  "change",
  () => {
    errores.terms.textContent = "";
    ocultarMensaje();
  }
);

/* =========================================
   FORMATO AUTOMÁTICO
========================================= */

telefonoInput?.addEventListener(
  "input",
  () => {
    telefonoInput.value =
      telefonoInput.value
        .replace(/\D/g, "")
        .slice(0, 10);
  }
);

numeroMembresiaInput?.addEventListener(
  "input",
  () => {
    let valor =
      numeroMembresiaInput.value
        .toUpperCase()
        .replace(/\s/g, "")
        .replace(/[^A-Z0-9-]/g, "");

    if (
      /^\d+$/.test(valor)
    ) {
      valor =
        `ASC-${valor.padStart(6, "0")}`;
    }

    numeroMembresiaInput.value =
      valor.slice(0, 10);
  }
);

[numeroEstampaMontecInput, numeroEstampaAcmeInput].forEach(
  campo => {
    campo?.addEventListener(
      "input",
      () => {
        campo.value = campo.value
          .toUpperCase()
          .replace(/\s+/g, " ")
          .slice(0, 40);
      }
    );
  }
);

placasInput?.addEventListener(
  "input",
  () => {
    placasInput.value =
      placasInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "")
        .slice(0, 12);
  }
);

serieInput?.addEventListener(
  "input",
  () => {
    serieInput.value =
      serieInput.value
        .toUpperCase()
        .replace(/\s/g, "")
        .replace(/[^A-HJ-NPR-Z0-9]/g, "")
        .slice(0, 17);
  }
);

/* =========================================
   MOSTRAR CONTRASEÑAS
========================================= */

configurarTogglePassword(
  passwordToggle,
  passwordInput
);

configurarTogglePassword(
  confirmPasswordToggle,
  confirmPasswordInput
);

function configurarTogglePassword(
  boton,
  campo
) {
  boton?.addEventListener(
    "click",
    () => {
      const ocultando =
        campo.type === "password";

      campo.type =
        ocultando
          ? "text"
          : "password";

      boton.textContent =
        ocultando
          ? "🙈"
          : "👁";

      boton.setAttribute(
        "aria-label",
        ocultando
          ? "Ocultar contraseña"
          : "Mostrar contraseña"
      );

      campo.focus();
    }
  );
}

/* =========================================
   CARGA
========================================= */

function activarCarga(activo) {
  registerButton.disabled =
    activo;

  registerButton.classList.toggle(
    "loading",
    activo
  );

  registerButton.setAttribute(
    "aria-busy",
    String(activo)
  );

  registerButtonText.textContent =
    activo
      ? "CREANDO CUENTA..."
      : "CREAR MI CUENTA";

  registerSpinner.setAttribute(
    "aria-hidden",
    String(!activo)
  );
}

/* =========================================
   MENSAJES
========================================= */

function mostrarMensaje(
  texto,
  tipo = "info"
) {
  registerMessage.textContent =
    texto;

  registerMessage.className =
    `registerMessage visible ${tipo}`;

  registerMessage.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function ocultarMensaje() {
  registerMessage.textContent = "";
  registerMessage.className =
    "registerMessage";
}

/* =========================================
   ERRORES DE FIREBASE
========================================= */

function obtenerMensajeError(error) {
  const codigo =
    error?.code || "";

  const mensajes = {
    "auth/email-already-in-use":
      "Este correo ya está registrado. Inicia sesión o recupera tu contraseña.",

    "auth/invalid-email":
      "El correo electrónico no es válido.",

    "auth/weak-password":
      "La contraseña es demasiado débil. Utiliza al menos 6 caracteres.",

    "auth/operation-not-allowed":
      "El registro por correo y contraseña no está habilitado en Firebase.",

    "auth/network-request-failed":
      "No fue posible conectarse. Revisa tu conexión a internet.",

    "auth/too-many-requests":
      "Se realizaron demasiados intentos. Espera unos minutos.",

    "auth/unauthorized-domain":
      "Este dominio no está autorizado en Firebase Authentication.",

    "permission-denied":
      "Firestore no permitió guardar los datos. Revisa las reglas de seguridad.",

    "membership/not-found":
      "El número de membresía no existe. Revisa el número proporcionado por AS CLICK.",

    "membership/already-used":
      "Esta membresía ya está vinculada a otra cuenta.",

    "membership/cancelled":
      "Esta membresía está cancelada. Comunícate con un asesor.",

    "membership/expired":
      "Esta membresía está vencida. Comunícate con un asesor."
  };

  return (
    mensajes[codigo] ||
    error?.message ||
    "No fue posible crear la cuenta. Inténtalo nuevamente."
  );
}

function crearErrorPersonalizado(
  codigo,
  mensaje
) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

function debeEliminarCuentaIncompleta(
  error
) {
  const codigo =
    error?.code || "";

  return [
    "membership/not-found",
    "membership/already-used",
    "membership/cancelled",
    "membership/expired",
    "permission-denied",
    "firestore/permission-denied",
    "unavailable",
    "firestore/unavailable"
  ].includes(codigo);
}

/* =========================================
   TÉRMINOS Y PRIVACIDAD
========================================= */

termsButton?.addEventListener(
  "click",
  () => {
    mostrarModalInformativo(
      "📄",
      "Términos y condiciones",
      "Los clientes con y sin membresía pueden solicitar ajustador, abogado, auxilio vial y grúa. Los miembros activos reciben tarifa preferencial. Los clientes sin membresía pagan tarifa de público general. Las alertas de robo y montachoques son exclusivas para miembros activos y deben utilizarse únicamente en emergencias reales."
    );
  }
);

privacyButton?.addEventListener(
  "click",
  () => {
    mostrarModalInformativo(
      "🛡️",
      "Aviso de privacidad",
      "AS CLICK utilizará tus datos personales y los datos de tu vehículo para administrar tu cuenta, identificar tu membresía, atender solicitudes, comunicarse contigo durante los servicios y mejorar la atención."
    );
  }
);

/* =========================================
   MODALES
========================================= */

closeInfoModal?.addEventListener(
  "click",
  () => cerrarModal(infoModal)
);

acceptInfoModal?.addEventListener(
  "click",
  () => cerrarModal(infoModal)
);

infoModal?.addEventListener(
  "click",
  event => {
    if (
      event.target === infoModal
    ) {
      cerrarModal(infoModal);
    }
  }
);

function abrirModal(modal) {
  if (!modal) return;

  modal.classList.add("active");

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.style.overflow =
    "hidden";
}

function cerrarModal(modal) {
  if (!modal) return;

  modal.classList.remove("active");

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.style.overflow =
    "";
}

function mostrarModalInformativo(
  icono,
  titulo,
  texto
) {
  infoModalIcon.textContent =
    icono;

  infoModalTitle.textContent =
    titulo;

  infoModalText.textContent =
    texto;

  abrirModal(infoModal);
}

/* =========================================
   TECLA ESCAPE
========================================= */

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape"
    ) {
      cerrarModal(infoModal);
    }
  }
);

/* =========================================
   CARGA INICIAL
========================================= */

window.addEventListener(
  "DOMContentLoaded",
  () => {
    seleccionarTipoRegistro(true);
    actualizarCamposAfiliacion();
    nombreInput?.focus();
  }
);
