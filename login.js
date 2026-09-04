import { auth, db } from "./firebase-config.js";

 

import {

  onAuthStateChanged,

  signInWithEmailAndPassword,

  signOut

} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

 

import {

  doc,

  getDoc

} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

 

const form = document.getElementById("loginForm");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const button = document.getElementById("loginButton");

const message = document.getElementById("message");

 

function setMessage(text = "") {

  message.textContent = text;

}

 

function setLoading(loading) {

  button.disabled = loading;

  button.textContent = loading ? "Validando..." : "Entrar al panel";

}

 

async function validarAdministrador(user) {

  const snap = await getDoc(doc(db, "usuarios", user.uid));

 

  if (!snap.exists()) {

    throw new Error(

      "La cuenta existe en Authentication, pero no tiene documento en usuarios."

    );

  }

 

  const data = snap.data();

 

  if (data.rol !== "admin" || data.activo !== true) {

    throw new Error(

      'Esta cuenta no está autorizada. En Firestore debe tener rol: "admin" y activo: true.'

    );

  }

 

  return true;

}

 

form.addEventListener("submit", async event => {

  event.preventDefault();

  setMessage("");

  setLoading(true);

 

  try {

    const email = emailInput.value.trim();

    const password = passwordInput.value;

 

    const credential = await signInWithEmailAndPassword(

      auth,

      email,

      password

    );

 

    await validarAdministrador(credential.user);

 

    window.location.replace("./index.html");

  } catch (error) {

    console.error("Error de acceso Admin:", error);

 

    try {

      if (auth.currentUser) {

        await signOut(auth);

      }

    } catch (_) {}

 

    const code = error?.code || "";

 

    if (code === "auth/invalid-credential" ||

        code === "auth/wrong-password" ||

        code === "auth/user-not-found") {

      setMessage("Correo o contraseña incorrectos.");

    } else if (code === "auth/too-many-requests") {

      setMessage("Demasiados intentos. Espera un momento y vuelve a intentar.");

    } else {

      setMessage(error?.message || "No fue posible iniciar sesión.");

    }

  } finally {

    setLoading(false);

  }

});

 

onAuthStateChanged(auth, async user => {

  if (!user) return;

 

  try {

    await validarAdministrador(user);

    window.location.replace("./index.html");

  } catch (_) {

    await signOut(auth);

  }

});
