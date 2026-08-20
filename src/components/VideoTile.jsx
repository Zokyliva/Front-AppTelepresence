import { useEffect, useRef } from "react";
import { MicOff, Hand, ScreenShare } from "lucide-react";

export default function VideoTile({
  stream,
  name,
  isLocal = false,
  micOn = true,
  camOn = true,
  handRaised = false,
  screenSharing = false,
  large = false,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <div
      className={`group relative w-full overflow-hidden rounded-lg bg-panel border border-line ${
        large ? "aspect-video" : "aspect-video"
      }`}
    >
      {stream && camOn ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // essentiel sur iOS : sans playsInline, la video s'ouvre en
          // plein ecran natif au lieu de jouer dans la page
          muted={isLocal} // on coupe toujours notre propre retour audio
          className={`h-full w-full ${screenSharing ? "object-contain bg-black" : "object-cover"}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-line/30">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-line font-tech text-lg font-medium text-paper">
            {initial}
          </div>
        </div>
      )}

      {/* Voyant "tally" : allume quand le micro est actif, evoque une
          camera de studio en direct */}
      <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/50 px-1.5 py-1 backdrop-blur-sm">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            micOn ? "bg-tally animate-tally-pulse" : "bg-muted/60"
          }`}
        />
      </div>

      {screenSharing && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-phosphor px-2 py-1 text-ink">
          <ScreenShare size={12} strokeWidth={2.5} />
          <span className="font-tech text-[10px] font-semibold uppercase tracking-wide">
            Présente
          </span>
        </div>
      )}

      {handRaised && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-phosphor text-ink">
          <Hand size={13} strokeWidth={2.5} />
        </div>
      )}

      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 backdrop-blur-sm">
        <span className="text-xs font-medium text-paper truncate max-w-[8rem]">
          {name} {isLocal && "(toi)"}
        </span>
        {!micOn && <MicOff size={12} className="text-tally shrink-0" strokeWidth={2.5} />}
      </div>
    </div>
  );
}
