import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

/**
 * Chat — messagerie texte de la salle.
 *
 * Contrairement à VideoCall, ce composant ne touche JAMAIS à WebRTC : le
 * texte transite entièrement via Socket.IO (client -> serveur -> tous les
 * clients de la salle), car il n'y a pas d'intérêt à établir une connexion
 * P2P pour de si petits messages ponctuels — le serveur suffit largement,
 * et ça simplifie beaucoup le code.
 *
 * Se reconnecte automatiquement avec le reste de l'app grâce à la
 * reconnexion Socket.IO : si la connexion tombe puis revient, useWebRTC
 * (dans VideoCall) renvoie "room:join", ce qui déclenche côté serveur un
 * nouvel envoi de "chat:history" — donc l'historique se resynchronise tout
 * seul sans code supplémentaire ici.
 */
export default function Chat({ roomId }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    // Un nouveau message envoyé par n'importe qui dans la salle (nous y
    // compris — le serveur nous renvoie aussi nos propres messages).
    function handleMessage(payload) {
      setMessages((prev) => [...prev, payload]);
    }

    // Reçu à chaque fois qu'on (re)rejoint la salle : tous les messages
    // déjà échangés avant notre arrivée (ou pendant une coupure réseau).
    // On REMPLACE la liste plutôt que d'ajouter, pour éviter les doublons
    // en cas de reconnexion.
    function handleHistory(history) {
      setMessages(history);
    }

    socket.on("chat:message", handleMessage);
    socket.on("chat:history", handleHistory);
    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:history", handleHistory);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    socket.emit("chat:message", { roomId, message: trimmed });
    setDraft("");
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-md border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-700">
        Chat de la salle
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 italic">Aucun message pour l'instant.</p>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className="text-sm">
            <span className="font-semibold text-indigo-600">{msg.pseudo}</span>{" "}
            <span className="text-gray-400 text-xs">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
            <p className="text-gray-800">{msg.message}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={sendMessage} className="flex gap-2 p-3 border-t border-gray-200">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Écrire un message..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
