import { useState } from "react";

export default function RoomEntry({ onJoin }) {
  const [pseudo, setPseudo] = useState("");
  const [roomId, setRoomId] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!pseudo.trim() || !roomId.trim()) return;
    onJoin({ pseudo: pseudo.trim(), roomId: roomId.trim() });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-sm space-y-4 border border-gray-200"
      >
        <h1 className="text-xl font-bold text-gray-800 text-center">
          Rejoindre une salle de téléprésence
        </h1>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Votre pseudo
          </label>
          <input
            type="text"
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder="ex: Rija"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Nom de la salle
          </label>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="ex: cours-techweb"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition"
        >
          Rejoindre
        </button>
      </form>
    </div>
  );
}
