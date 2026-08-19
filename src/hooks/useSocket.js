import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// URL du serveur : en local, on pointe vers localhost:4000 par defaut.
// En production, VITE_SERVER_URL est definie sur Vercel (voir README).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

/**
 * Cree une seule connexion Socket.IO par montage de composant
 * et la ferme proprement quand le composant est demonte.
 */
export function useSocket() {
  const socketRef = useRef(null);

  if (!socketRef.current) {
    socketRef.current = io(SERVER_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"], // polling en secours si websocket bloque
    });
  }

  useEffect(() => {
    const socket = socketRef.current;
    return () => {
      socket.disconnect();
    };
  }, []);

  return socketRef.current;
}
