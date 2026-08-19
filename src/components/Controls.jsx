export default function Controls({
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  onToggleChat,
  onLeave,
  onCopyLink,
  participantCount,
  maxParticipants,
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-panel px-3 py-3 md:px-5">
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
        <span className="h-2 w-2 rounded-full bg-accent" />
        {participantCount}/{maxParticipants} participants
      </div>

      <div className="flex flex-1 items-center justify-center gap-2 md:gap-3">
        <button
          onClick={onToggleMic}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition active:scale-90 ${
            micOn ? "bg-slate-800 text-white" : "bg-red-500/90 text-white"
          }`}
          aria-label={micOn ? "Couper le micro" : "Activer le micro"}
          title={micOn ? "Couper le micro" : "Activer le micro"}
        >
          {micOn ? "🎤" : "🔇"}
        </button>

        <button
          onClick={onToggleCam}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition active:scale-90 ${
            camOn ? "bg-slate-800 text-white" : "bg-red-500/90 text-white"
          }`}
          aria-label={camOn ? "Couper la caméra" : "Activer la caméra"}
          title={camOn ? "Couper la caméra" : "Activer la caméra"}
        >
          {camOn ? "📷" : "🚫"}
        </button>

        <button
          onClick={onCopyLink}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-lg text-white transition active:scale-90"
          aria-label="Copier le lien de la salle"
          title="Copier le lien de la salle"
        >
          🔗
        </button>

        <button
          onClick={onToggleChat}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-lg text-white transition active:scale-90 md:hidden"
          aria-label="Afficher le chat"
          title="Afficher le chat"
        >
          💬
        </button>

        <button
          onClick={onLeave}
          className="flex h-11 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-medium text-white transition active:scale-90"
        >
          Quitter
        </button>
      </div>

      <div className="hidden md:block w-32" />
    </div>
  );
}
