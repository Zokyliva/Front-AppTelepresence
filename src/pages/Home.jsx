import { useState } from "react";
import { useNavigate } from "react-router-dom";

function randomRoomId() {
  // ex: "swift-otter-42" - plus facile a dicter/copier qu'un UUID
  const adjectives = ["swift", "calm", "bright", "quiet", "bold", "lunar"];
  const animals = ["otter", "falcon", "lynx", "heron", "panda", "wren"];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const b = animals[Math.floor(Math.random() * animals.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${a}-${b}-${n}`;
}

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(
    () => localStorage.getItem("telepresence:name") || ""
  );
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");

  function handleJoin(e) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Entre ton nom pour continuer.");
      return;
    }
    localStorage.setItem("telepresence:name", cleanName);
    const targetRoom = roomId.trim() || randomRoomId();
    navigate(`/room/${encodeURIComponent(targetRoom)}`, {
      state: { name: cleanName },
    });
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent text-xl mb-4">
            ◎
          </div>
          <h1 className="text-2xl font-semibold text-white">Téléprésence</h1>
          <p className="text-slate-400 text-sm mt-1">
            Salle vidéo + chat en temps réel — jusqu'à 25 participants
          </p>
        </div>

        <form
          onSubmit={handleJoin}
          className="bg-panel border border-slate-800 rounded-2xl p-5 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Ton nom
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Rina"
              maxLength={40}
              className="w-full rounded-xl bg-ink border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              ID de la salle{" "}
              <span className="text-slate-600">(laisser vide pour en créer une)</span>
            </label>
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="ex : swift-otter-42"
              maxLength={64}
              className="w-full rounded-xl bg-ink border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-accent text-ink font-medium py-2.5 text-sm hover:brightness-110 active:scale-[0.98] transition"
          >
            Rejoindre la salle
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Capacité maximale : 25 personnes par salle
        </p>
      </div>
    </main>
  );
}
