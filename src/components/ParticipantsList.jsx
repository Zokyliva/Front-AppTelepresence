import { Mic, MicOff, Video, VideoOff, Hand, ScreenShare, X } from "lucide-react";

export default function ParticipantsList({ self, peerList, maxParticipants, onClose }) {
  // Les mains levees remontent en haut de la liste - c'est l'info la plus
  // actionnable pour un animateur de reunion.
  const sorted = [...peerList].sort((a, b) => {
    const ah = a[1].handRaised ? 1 : 0;
    const bh = b[1].handRaised ? 1 : 0;
    return bh - ah;
  });

  const total = peerList.length + 1;

  function Row({ id, p, isSelf }) {
    const initial = (p.name || "?").trim().charAt(0).toUpperCase();
    return (
      <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-line/40">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line font-tech text-sm font-medium text-paper">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-paper">
            {p.name} {isSelf && <span className="text-muted">(toi)</span>}
          </p>
          {p.screenSharing && (
            <p className="flex items-center gap-1 text-xs text-phosphor">
              <ScreenShare size={11} /> Partage son écran
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-muted">
          {p.handRaised && <Hand size={15} className="text-phosphor" strokeWidth={2.5} />}
          {p.micOn === false ? (
            <MicOff size={15} className="text-tally" />
          ) : (
            <Mic size={15} />
          )}
          {p.camOn === false ? <VideoOff size={15} className="text-tally" /> : <Video size={15} />}
        </div>
      </li>
    );
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-paper">
          Participants{" "}
          <span className="font-tech text-xs text-muted">
            ({total}/{maxParticipants})
          </span>
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted hover:text-paper"
            aria-label="Fermer la liste des participants"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <ul className="thin-scroll flex-1 overflow-y-auto px-2 py-2">
        <Row id="self" p={self} isSelf />
        {sorted.map(([id, p]) => (
          <Row key={id} id={id} p={p} />
        ))}
      </ul>
    </div>
  );
}
