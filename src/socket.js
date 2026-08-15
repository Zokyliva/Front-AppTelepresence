import { io } from "socket.io-client";

// URL du serveur de signalisation.
// - En développement local : http://localhost:4000 (valeur par défaut).
// - En production (déploiement) : définie via la variable d'environnement
//   Vite VITE_SERVER_URL (voir .env.example), pour pointer vers l'URL
//   publique de votre serveur déployé (ex: https://mon-serveur.onrender.com).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

// -----------------------------------------------------------------------
// Une seule instance de socket, PARTAGÉE par toute l'application (import
// de ce même module partout). C'est important : si chaque composant
// créait sa propre connexion avec io(...), le serveur verrait plusieurs
// "participants" fantômes pour un seul utilisateur.
// -----------------------------------------------------------------------
export const socket = io(SERVER_URL, {
  autoConnect: true,

  // ---- Reconnexion automatique en cas de coupure réseau ----
  // Ces options sont déjà les valeurs par défaut de Socket.IO, mais on les
  // rend explicites ici pour la démonstration / la soutenance : la
  // librairie retente seule de se reconnecter, avec un délai croissant
  // entre chaque tentative (pour ne pas surcharger le serveur si la
  // coupure dure longtemps).
  reconnection: true, // active la reconnexion automatique
  reconnectionAttempts: Infinity, // ne jamais abandonner
  reconnectionDelay: 1000, // 1re tentative après 1s
  reconnectionDelayMax: 5000, // jamais plus de 5s entre deux tentatives
  timeout: 20000, // 20 secondes de timeout
  transports: ['websocket', 'polling'], // Force WebSocket d'abord
});

// Remarque : côté application (voir hooks/useWebRTC.js), on écoute les
// événements "connect" et "disconnect" de ce socket pour re-rejoindre la
// salle et renégocier les connexions WebRTC à chaque reconnexion — la
// reconnexion du WebSocket seule ne suffit pas, il faut reconstruire
// l'état applicatif par-dessus.
