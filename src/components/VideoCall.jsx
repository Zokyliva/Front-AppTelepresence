import { useState } from "react";
import VideoTile from "./VideoTile";
import { useWebRTC } from "../hooks/useWebRTC";

/**
 * Assemble la grille de tuiles vidéo (locale + distantes) et la barre de
 * contrôles (caméra, micro, partage d'écran, lever la main).
 *
 * Tout l'état "temps réel" (flux, participants, connexion...) vient du hook
 * useWebRTC — ce composant ne fait que l'afficher et brancher les boutons.
 */
export default function VideoCall({ roomId, pseudo }) {
  const {
    localStream,
    remoteStreams,
    participants,
    error,
    connectionStatus,
    connectionErrorDetail,
    toggleTrack,
    isScreenSharing,
    toggleScreenShare,
    remoteScreenSharing,
    handRaised,
    toggleHandRaise,
    remoteHandsRaised,
  } = useWebRTC(roomId, pseudo);

  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);

  function handleToggleVideo() {
    toggleTrack("video");
    setVideoOn((v) => !v);
  }

  function handleToggleAudio() {
    toggleTrack("audio");
    setAudioOn((a) => !a);
  }

  const remoteEntries = Object.entries(remoteStreams);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Bandeau d'état de connexion — visible uniquement en cas de coupure
          ou de tentative de reconnexion, pour ne pas polluer l'UI en temps
          normal. Socket.IO retente automatiquement en arrière-plan ; ce
          bandeau informe juste l'utilisateur de ce qui se passe. */}
      {connectionStatus !== "connected" && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-lg px-3 py-2 text-center">
          {connectionStatus === "disconnected"
            ? "Connexion perdue — tentative de reconnexion en cours..."
            : "Connexion au serveur en cours..."}
          {connectionErrorDetail && (
            <div className="mt-1 text-xs text-amber-600 font-mono break-words">
              Détail : {connectionErrorDetail}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
        {localStream && (
          <VideoTile
            stream={localStream}
            pseudo={pseudo}
            muted
            isLocal
            handRaised={handRaised}
            isScreenSharing={isScreenSharing}
          />
        )}
        {remoteEntries.map(([socketId, { stream, pseudo: remotePseudo }]) => (
          <VideoTile
            key={socketId}
            stream={stream}
            pseudo={remotePseudo || "Participant"}
            handRaised={!!remoteHandsRaised[socketId]}
            isScreenSharing={!!remoteScreenSharing[socketId]}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 py-2">
        <button
          onClick={handleToggleVideo}
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${
            videoOn
              ? "bg-gray-200 text-gray-800 hover:bg-gray-300"
              : "bg-red-100 text-red-700 hover:bg-red-200"
          }`}
        >
          {videoOn ? "Caméra activée" : "Caméra coupée"}
        </button>

        <button
          onClick={handleToggleAudio}
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${
            audioOn
              ? "bg-gray-200 text-gray-800 hover:bg-gray-300"
              : "bg-red-100 text-red-700 hover:bg-red-200"
          }`}
        >
          {audioOn ? "Micro activé" : "Micro coupé"}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${
            isScreenSharing
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          {isScreenSharing ? "Arrêter le partage" : "Partager l'écran"}
        </button>

        <button
          onClick={toggleHandRaise}
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${
            handRaised
              ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-500"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          {handRaised ? "Baisser la main ✋" : "Lever la main"}
        </button>

        <span className="text-sm text-gray-500">
          {participants.length + 1} participant(s) dans la salle
        </span>
      </div>
    </div>
  );
}
