// Shared Design Save/Load — Firebase Realtime Database (CDN SDK, no build step)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCP8oU51Ok2vW-XNReKlklz_N0PDiHbfss",
  authDomain: "cutescape-studio.firebaseapp.com",
  databaseURL: "https://cutescape-studio-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cutescape-studio",
  storageBucket: "cutescape-studio.firebasestorage.app",
  messagingSenderId: "907642569759",
  appId: "1:907642569759:web:643d843e9fe15119b7812a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

window.cutescapeSaveDesign = function (designId, design) {
  return set(ref(db, "designs/" + designId), design);
};

window.cutescapeLoadDesign = function (designId) {
  return get(ref(db, "designs/" + designId)).then(function (snapshot) {
    return snapshot.exists() ? snapshot.val() : null;
  });
};
