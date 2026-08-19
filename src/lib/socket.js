import { io } from "socket.io-client";

// URL du serveur : en local, tourne via .env (VITE_SERVER_URL). Sur Vercel,
// definir VITE_SERVER_URL dans les variables d'environnement du projet
// (voir README) pour pointer vers l'URL Render du serveur.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

// autoConnect: false -> on se connecte nous-memes au bon moment (quand
// l'utilisateur a choisi un nom + une salle), pas au chargement de la page.
export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

export { SERVER_URL };
