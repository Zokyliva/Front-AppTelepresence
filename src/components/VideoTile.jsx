import { useEffect, useRef } from "react";

/**
 * Affiche un flux vidéo (MediaStream) dans une balise <video>.
 * Utilisé à la fois pour le flux local et pour chaque flux distant.
 *
 * Remarque technique : une balise <video> ne prend pas directement une
 * "src" comme pour un fichier — elle prend un objet MediaStream via la
 * propriété "srcObject". C'est pour ça qu'on ne peut pas simplement écrire
 * <video src={stream} /> : il faut passer par une ref et un useEffect.
 *
 * @param {MediaStream} stream - flux à afficher
 * @param {string} pseudo - nom du participant affiché en overlay
 * @param {boolean} muted - couper le son (toujours vrai pour notre PROPRE
 *   flux local, sinon on s'entendrait en écho)
 * @param {boolean} isLocal - vrai pour notre propre tuile (miroir + label "(vous)")
 * @param {boolean} handRaised - affiche un badge "main levée"
 * @param {boolean} isScreenSharing - affiche un badge "partage d'écran"
 */
export default function VideoTile({
  stream,
  pseudo,
  muted = false,
  isLocal = false,
  handRaised = false,
  isScreenSharing = false,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video shadow-md">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        // Effet miroir uniquement sur notre propre webcam (comme un miroir
        // physique) ; pas de miroir pour les flux distants ni pour un
        // partage d'écran (ce serait illisible à l'envers).
        className={`w-full h-full object-cover ${
          isLocal && !isScreenSharing ? "scale-x-[-1]" : ""
        }`}
      />

      {/* Badge "main levée", coin supérieur droit */}
      {handRaised && (
        <span
          className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-lg px-2 py-1 rounded-full shadow"
          title="Main levée"
        >
          ✋
        </span>
      )}

      {/* Badge "partage d'écran", coin supérieur gauche */}
      {isScreenSharing && (
        <span className="absolute top-2 left-2 bg-indigo-600 text-white text-xs font-medium px-2 py-1 rounded-md shadow">
          Partage d'écran
        </span>
      )}

      <span className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md">
        {pseudo} {isLocal && "(vous)"}
      </span>
    </div>
  );
}
