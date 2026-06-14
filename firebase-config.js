// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDkhnO-Mwim2peFQKbn-avaGQCk59deEP4",
  authDomain: "volleyball-stat-tracker-350db.firebaseapp.com",
  projectId: "volleyball-stat-tracker-350db",
  storageBucket: "volleyball-stat-tracker-350db.firebasestorage.app",
  messagingSenderId: "461139136189",
  appId: "1:461139136189:web:34da3f9e33951cd35a71d4",
  measurementId: "G-M23K290LB1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);