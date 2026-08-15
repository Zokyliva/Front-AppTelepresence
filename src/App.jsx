import { useState } from "react";
import RoomEntry from "./components/RoomEntry";
import VideoCall from "./components/VideoCall";
import Chat from "./components/Chat";

/**
 * App — composant racine.
 *
 * Ne gère qu'une seule chose : la bascule entre l'écran d'entrée
 * (RoomEntry, pour choisir pseudo + salle) et l'écran de salle une fois
 * qu'on a rejoint (VideoCall + Chat, côte à côte).
 *
 * Toute la logique WebRTC/Socket.IO est encapsulée plus bas (dans le hook
 * useWebRTC, utilisé par VideoCall, et directement dans Chat pour la
 * messagerie) — ce composant reste volontairement "bête".
 */
export default function App() {
  // session: null tant qu'on n'a pas rejoint de salle
  const [session, setSession] = useState(null);

  if (!session) {
    return <RoomEntry onJoin={setSession} />;
  }

  const { roomId, pseudo } = session;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">
          Salle : <span className="text-indigo-600">{roomId}</span>
        </h1>
        <button
          onClick={() => setSession(null)}
          className="text-sm text-red-600 hover:text-red-800 font-medium"
        >
          Quitter la salle
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-6rem)]">
        <div className="lg:col-span-3">
          <VideoCall roomId={roomId} pseudo={pseudo} />
        </div>
        <div className="lg:col-span-1">
          <Chat roomId={roomId} />
        </div>
      </div>
    </div>
  );
}

