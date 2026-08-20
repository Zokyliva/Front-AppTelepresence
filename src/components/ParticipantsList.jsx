import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  ScreenShare,
  Crown,
  X,
  Check,
  UserX,
} from "lucide-react";

export default function ParticipantsList({
  self,
  peerList,
  maxParticipants,
  onClose,
  isHost = false,
  hostId = null,
  selfId = null,
  waitingList = [],
  onAdmit,
  onDeny,
  onForceMute,
  onKick,
}) {
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
    const rowIsHost = isSelf ? hostId === selfId : hostId === id;

    return (
      <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-line/40">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-line font-tech text-sm font-medium text-paper">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm text-paper">
            {p.name} {isSelf && <span className="text-muted">(toi)</span>}
            {rowIsHost && (
              <Crown size={13} className="shrink-0 text-phosphor" strokeWidth={2.5} />
            )}
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

        {/* Controles hote : jamais affiches sur sa propre ligne ni sur celle d'un autre hote */}
        {isHost && !isSelf && !rowIsHost && (
          <div className="flex shrink-0 items-center gap-1 border-l border-line pl-2">
            <button
              onClick={() => onForceMute?.(id)}
              disabled={p.micOn === false}
              title="Couper le micro de ce participant"
              aria-label="Couper le micro de ce participant"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-line hover:text-paper disabled:opacity-30"
            >
              <MicOff size={14} />
            </button>
            <button
              onClick={() => onKick?.(id)}
              title="Expulser ce participant"
              aria-label="Expulser ce participant"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-tally/20 hover:text-tally"
            >
              <UserX size={14} />
            </button>
          </div>
        )}
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

      {isHost && waitingList.length > 0 && (
        <div className="border-b border-line bg-tally/5 px-2 py-2">
          <p className="px-2 pb-1.5 font-tech text-[11px] uppercase tracking-wide text-tally">
            En attente ({waitingList.length})
          </p>
          <ul className="space-y-1.5">
            {waitingList.map((w) => (
              <li
                key={w.id}
                className="flex items-center gap-2 rounded-lg bg-ink px-2.5 py-2"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line font-tech text-xs font-medium text-paper">
                  {(w.name || "?").trim().charAt(0).toUpperCase()}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-paper">{w.name}</p>
                <button
                  onClick={() => onAdmit?.(w.id)}
                  title="Admettre"
                  aria-label={`Admettre ${w.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-phosphor text-ink transition hover:brightness-110"
                >
                  <Check size={15} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => onDeny?.(w.id)}
                  title="Refuser"
                  aria-label={`Refuser ${w.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted transition hover:border-tally hover:text-tally"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="thin-scroll flex-1 overflow-y-auto px-2 py-2">
        <Row id="self" p={self} isSelf />
        {sorted.map(([id, p]) => (
          <Row key={id} id={id} p={p} />
        ))}
      </ul>
    </div>
  );
}
