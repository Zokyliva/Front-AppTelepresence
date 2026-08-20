import { useState, useRef, useEffect } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  Hand,
  SmilePlus,
  Users,
  MessageSquare,
  Link2,
  PhoneOff,
} from "lucide-react";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "👏", "🎉", "😮"];

function ControlButton({ active, danger, onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition active:scale-90 ${
        danger
          ? "border-tally bg-tally text-paper"
          : active
          ? "border-phosphor bg-phosphor text-ink"
          : "border-line bg-ink text-paper hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}

export default function Controls({
  micOn,
  camOn,
  screenSharing,
  handRaised,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onToggleHand,
  onSendReaction,
  onToggleChat,
  onToggleParticipants,
  onLeave,
  onCopyLink,
  participantCount,
  maxParticipants,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [pickerOpen]);

  return (
    <div className="border-t border-line bg-panel px-3 py-3 md:px-5">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
        <div className="hidden shrink-0 items-center gap-2 font-tech text-xs text-muted md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-tally animate-tally-pulse" />
          {participantCount}/{maxParticipants}
        </div>

        <div className="flex flex-1 items-center justify-center gap-2 overflow-x-auto thin-scroll md:gap-2.5">
          <ControlButton
            active={micOn}
            danger={!micOn}
            onClick={onToggleMic}
            label={micOn ? "Couper le micro" : "Activer le micro"}
          >
            {micOn ? <Mic size={19} /> : <MicOff size={19} />}
          </ControlButton>

          <ControlButton
            active={camOn}
            danger={!camOn}
            onClick={onToggleCam}
            label={camOn ? "Couper la caméra" : "Activer la caméra"}
          >
            {camOn ? <Video size={19} /> : <VideoOff size={19} />}
          </ControlButton>

          <ControlButton
            active={screenSharing}
            onClick={onToggleScreenShare}
            label={screenSharing ? "Arrêter le partage d'écran" : "Partager mon écran"}
          >
            {screenSharing ? <ScreenShareOff size={19} /> : <ScreenShare size={19} />}
          </ControlButton>

          <ControlButton
            active={handRaised}
            onClick={onToggleHand}
            label={handRaised ? "Baisser la main" : "Lever la main"}
          >
            <Hand size={19} />
          </ControlButton>

          <div className="relative" ref={pickerRef}>
            <ControlButton
              onClick={() => setPickerOpen((v) => !v)}
              label="Envoyer une réaction"
            >
              <SmilePlus size={19} />
            </ControlButton>
            {pickerOpen && (
              <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-line bg-ink p-1.5 shadow-xl">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onSendReaction(emoji);
                      setPickerOpen(false);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:bg-line active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ControlButton onClick={onToggleParticipants} label="Voir les participants">
            <Users size={19} />
          </ControlButton>

          <ControlButton onClick={onCopyLink} label="Copier le lien de la salle">
            <Link2 size={19} />
          </ControlButton>

          <div className="md:hidden">
            <ControlButton onClick={onToggleChat} label="Afficher le chat">
              <MessageSquare size={19} />
            </ControlButton>
          </div>

          <button
            onClick={onLeave}
            className="ml-1 flex h-11 shrink-0 items-center gap-2 rounded-full bg-tally px-4 text-sm font-medium text-paper transition active:scale-95"
          >
            <PhoneOff size={17} />
            <span className="hidden sm:inline">Quitter</span>
          </button>
        </div>

        <div className="hidden w-16 shrink-0 md:block" />
      </div>
    </div>
  );
}
