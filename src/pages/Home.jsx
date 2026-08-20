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

// Logomark "signal en direct" : un point tally entoure d'ondes de diffusion.
// Reference visuelle directe au sujet (telepresence / retransmission live)
// plutot qu'une icone generique.
function SignalMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <circle cx="15" cy="15" r="3.5" fill="#ff5a3c" />
      <path
        d="M9 9a8.5 8.5 0 0 0 0 12"
        stroke="#d9a441"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M21 9a8.5 8.5 0 0 1 0 12"
        stroke="#d9a441"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M5 5a13.2 13.2 0 0 0 0 20"
        stroke="#d9a441"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M25 5a13.2 13.2 0 0 1 0 20"
        stroke="#d9a441"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
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
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-panel border border-line mb-4">
            <SignalMark />
          </div>
          <h1 className="text-2xl font-bold text-paper tracking-tight">Signal</h1>
          <p className="text-muted text-sm mt-1.5">
            Vidéo, chat et présence en direct — 25 postes max par salle
          </p>
        </div>

        <form
          onSubmit={handleJoin}
          className="bg-panel border border-line rounded-2xl p-5 space-y-4"
        >
          <div>
            <label className="block font-tech text-[11px] uppercase tracking-wide text-muted mb-1.5">
              Ton nom
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex : Rina"
              maxLength={40}
              className="w-full rounded-xl bg-ink border border-line px-3.5 py-2.5 text-sm text-paper placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-phosphor/50"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-tech text-[11px] uppercase tracking-wide text-muted mb-1.5">
              Canal <span className="normal-case text-muted/70">(laisser vide pour en créer un)</span>
            </label>
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="ex : swift-otter-42"
              maxLength={64}
              className="w-full rounded-xl bg-ink border border-line px-3.5 py-2.5 font-tech text-sm text-paper placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-phosphor/50"
            />
          </div>

          {error && <p className="text-sm text-tally">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-phosphor text-ink font-semibold py-2.5 text-sm hover:brightness-110 active:scale-[0.98] transition"
          >
            Rejoindre le canal
          </button>
        </form>

        <p className="text-center font-tech text-[11px] text-muted/70 mt-6 tracking-wide">
          CAPACITÉ MAX · 25 PARTICIPANTS
        </p>
      </div>
    </main>
  );
}
