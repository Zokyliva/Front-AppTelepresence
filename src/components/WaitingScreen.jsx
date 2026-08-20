import { Hourglass } from "lucide-react";

export default function WaitingScreen({ roomId, onLeave }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-ink px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel">
        <Hourglass size={22} className="text-phosphor animate-pulse" />
      </div>
      <div>
        <p className="font-tech text-[11px] uppercase tracking-wide text-muted">
          Canal · {roomId}
        </p>
        <h1 className="mt-1.5 text-lg font-semibold text-paper">En attente d'admission</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          L'hôte de la salle doit valider ton entrée. Cette page se mettra à jour
          automatiquement dès qu'il l'aura fait.
        </p>
      </div>
      <button
        onClick={onLeave}
        className="rounded-xl border border-line px-5 py-2.5 text-sm text-paper transition hover:border-muted"
      >
        Annuler
      </button>
    </div>
  );
}
