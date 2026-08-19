import { useEffect, useRef } from "react";

export default function VideoTile({
  stream,
  name,
  isLocal = false,
  micOn = true,
  camOn = true,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-panel border border-slate-800">
      {stream && camOn ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // essentiel sur iOS : sans playsInline, la video s'ouvre en
          // plein ecran natif au lieu de jouer dans la page
          muted={isLocal} // on coupe toujours notre propre retour audio
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-800/60">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-lg font-medium text-slate-200">
            {initial}
          </div>
        </div>
      )}

      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 backdrop-blur-sm">
        <span className="text-xs font-medium text-white truncate max-w-[8rem]">
          {name} {isLocal && "(toi)"}
        </span>
        {!micOn && <span className="text-xs">🔇</span>}
      </div>
    </div>
  );
}
