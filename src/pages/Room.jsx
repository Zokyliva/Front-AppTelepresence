import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Users, MessageSquare } from "lucide-react";
import VideoTile from "../components/VideoTile.jsx";
import Chat from "../components/Chat.jsx";
import Controls from "../components/Controls.jsx";
import ParticipantsList from "../components/ParticipantsList.jsx";
import { useWebRTC } from "../hooks/useWebRTC.js";
import { socket } from "../lib/socket.js";

const MAX_PARTICIPANTS = 25;

// Decale chaque reaction horizontalement de facon deterministe (a partir de
// sa cle) pour eviter qu'elles ne s'empilent toutes au meme endroit.
function reactionOffset(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 100;
  return 20 + (hash % 60); // entre 20% et 80% de la largeur
}

export default function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const name = location.state?.name || localStorage.getItem("telepresence:name");

  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [panel, setPanel] = useState(null); // null | 'chat' | 'participants'
  const [toast, setToast] = useState("");
  const toastTimeout = useRef(null);
  const screenStreamRef = useRef(null);

  // Redirige vers l'accueil si on arrive directement sur /room/xxx sans nom
  useEffect(() => {
    if (!name) {
      navigate("/", { replace: true });
    }
  }, [name, navigate]);

  // --------------------------------------------------------------
  // Demande d'acces camera + micro des le montage de la page
  // --------------------------------------------------------------
  useEffect(() => {
    let activeStream = null;
    let cancelled = false;

    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        activeStream = stream;
        setLocalStream(stream);
      } catch (err) {
        console.error("Erreur accès caméra/micro :", err);
        setMediaError(
          "Impossible d'accéder à la caméra/micro. Vérifie les autorisations de ton navigateur."
        );
      }
    }

    initMedia();

    return () => {
      cancelled = true;
      activeStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const {
    status,
    errorMessage,
    peers,
    chatMessages,
    typingUsers,
    reactions,
    sendChatMessage,
    sendTyping,
    broadcastMediaState,
    replaceOutgoingVideoTrack,
    setScreenShareState,
    setRaiseHand,
    sendReaction,
  } = useWebRTC({ roomId, name, localStream });

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(""), 2400);
  }

  // --------------------------------------------------------------
  // Micro / camera on-off (coupe la piste localement + previent les autres)
  // --------------------------------------------------------------
  const toggleMic = useCallback(() => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    broadcastMediaState("audio", track.enabled);
  }, [localStream, broadcastMediaState]);

  const toggleCam = useCallback(() => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
    broadcastMediaState("video", track.enabled);
  }, [localStream, broadcastMediaState]);

  // --------------------------------------------------------------
  // Partage d'ecran : capture l'ecran, remplace la piste video envoyee a
  // tous les participants, et revient a la camera a l'arret.
  // --------------------------------------------------------------
  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    const camTrack = localStream?.getVideoTracks()[0];
    if (camTrack) replaceOutgoingVideoTrack(camTrack);
    setIsScreenSharing(false);
    setScreenShareState(false);
  }, [localStream, replaceOutgoingVideoTrack, setScreenShareState]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast("Le partage d'écran n'est pas supporté par ce navigateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const res = await setScreenShareState(true);
      if (!res.ok) {
        stream.getTracks().forEach((t) => t.stop());
        showToast(res.error || "Partage d'écran refusé.");
        return;
      }
      const track = stream.getVideoTracks()[0];
      // L'utilisateur peut arreter le partage via le bouton natif du
      // navigateur (pas seulement via notre UI) : on ecoute cet arret.
      track.onended = () => stopScreenShare();
      replaceOutgoingVideoTrack(track);
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
    } catch (err) {
      // L'utilisateur a annule la selection de fenetre/ecran : rien a faire.
      if (err?.name !== "NotAllowedError") {
        console.error("Erreur partage d'écran :", err);
      }
    }
  }, [isScreenSharing, replaceOutgoingVideoTrack, setScreenShareState, stopScreenShare]);

  // Nettoyage du flux d'ecran si on quitte la page en plein partage
  useEffect(() => {
    return () => {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleHand = useCallback(() => {
    setHandRaised((prev) => {
      const next = !prev;
      setRaiseHand(next);
      return next;
    });
  }, [setRaiseHand]);

  function copyRoomLink() {
    const url = window.location.href;
    navigator.clipboard
      ?.writeText(url)
      .then(() => showToast("Lien de la salle copié ✓"))
      .catch(() => showToast("Impossible de copier le lien"));
  }

  function handleLeave() {
    localStream?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    navigate("/");
  }

  function togglePanel(panelName) {
    setPanel((prev) => (prev === panelName ? null : panelName));
  }

  const peerList = useMemo(
    () => Object.entries(peers).filter(([, p]) => p.name),
    [peers]
  );
  const participantCount = peerList.length + 1; // + soi-meme

  const typingNames = Object.values(typingUsers);
  const typingLabel =
    typingNames.length === 0
      ? ""
      : typingNames.length === 1
      ? `${typingNames[0]} est en train d'écrire…`
      : `${typingNames.length} personnes écrivent…`;

  // Determine si quelqu'un (soi-meme ou un participant) presente son ecran
  const remoteSharer = peerList.find(([, p]) => p.screenSharing);
  const isPresenting = isScreenSharing || !!remoteSharer;

  const selfForList = { name, micOn, camOn, handRaised, screenSharing: isScreenSharing };

  if (!name) return null;

  const panelContent =
    panel === "chat" ? (
      <Chat
        messages={chatMessages}
        selfId={socket.id}
        typingLabel={typingLabel}
        onSend={sendChatMessage}
        onTyping={sendTyping}
        onClose={() => setPanel(null)}
      />
    ) : panel === "participants" ? (
      <ParticipantsList
        self={selfForList}
        peerList={peerList}
        maxParticipants={MAX_PARTICIPANTS}
        onClose={() => setPanel(null)}
      />
    ) : null;

  return (
    <div className="flex h-dvh flex-col bg-ink">
      {/* En-tete */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h1 className="font-tech text-sm font-semibold uppercase tracking-wide text-paper">
            Canal · {roomId}
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            {status === "connected" && (
              <span className="h-1.5 w-1.5 rounded-full bg-tally animate-tally-pulse" />
            )}
            {status === "connecting" && "Connexion en cours…"}
            {status === "connected" && `${participantCount}/${MAX_PARTICIPANTS} en ligne`}
            {status === "error" && "Erreur de connexion"}
            {status === "full" && "Salle complète"}
          </p>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <button
            onClick={() => togglePanel("participants")}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
              panel === "participants"
                ? "border-phosphor text-phosphor"
                : "border-line text-paper hover:border-muted"
            }`}
          >
            <Users size={14} /> {participantCount}
          </button>
          <button
            onClick={() => togglePanel("chat")}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
              panel === "chat"
                ? "border-phosphor text-phosphor"
                : "border-line text-paper hover:border-muted"
            }`}
          >
            <MessageSquare size={14} /> Chat{chatMessages.length > 0 && ` (${chatMessages.length})`}
          </button>
        </div>
      </header>

      {(status === "error" || status === "full" || mediaError) && (
        <div className="mx-4 mt-3 rounded-xl border border-tally/30 bg-tally/10 px-4 py-3 text-sm text-tally">
          {mediaError || errorMessage}
        </div>
      )}

      {/* Corps : scene video + panneau lateral (desktop) */}
      <div className="relative flex flex-1 overflow-hidden">
        <main className="relative flex-1 overflow-y-auto p-3 md:p-5">
          {isPresenting ? (
            <div className="flex h-full flex-col gap-3">
              {/* Scene principale : la personne qui presente */}
              <div className="min-h-0 flex-1">
                {isScreenSharing ? (
                  <VideoTile
                    stream={screenStream}
                    name={name}
                    isLocal
                    micOn={micOn}
                    camOn
                    screenSharing
                    large
                  />
                ) : (
                  <VideoTile
                    stream={remoteSharer[1].stream}
                    name={remoteSharer[1].name}
                    micOn={remoteSharer[1].micOn !== false}
                    camOn
                    screenSharing
                    large
                  />
                )}
              </div>
              {/* Pellicule des autres participants */}
              <div className="flex shrink-0 gap-2 overflow-x-auto thin-scroll pb-1">
                {!isScreenSharing && (
                  <div className="w-36 shrink-0">
                    <VideoTile stream={localStream} name={name} isLocal micOn={micOn} camOn={camOn} />
                  </div>
                )}
                {peerList
                  .filter(([id]) => !remoteSharer || id !== remoteSharer[0])
                  .map(([id, p]) => (
                    <div key={id} className="w-36 shrink-0">
                      <VideoTile
                        stream={p.stream}
                        name={p.name}
                        micOn={p.micOn !== false}
                        camOn={p.camOn !== false}
                        handRaised={p.handRaised}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              <VideoTile
                stream={localStream}
                name={name}
                isLocal
                micOn={micOn}
                camOn={camOn}
                handRaised={handRaised}
              />
              {peerList.map(([id, p]) => (
                <VideoTile
                  key={id}
                  stream={p.stream}
                  name={p.name}
                  micOn={p.micOn !== false}
                  camOn={p.camOn !== false}
                  handRaised={p.handRaised}
                />
              ))}
            </div>
          )}

          {/* Reactions flottantes */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 overflow-hidden">
            {reactions.map((r) => (
              <span
                key={r.key}
                className="absolute bottom-4 animate-float-up text-3xl"
                style={{ left: `${reactionOffset(r.key)}%` }}
              >
                {r.emoji}
              </span>
            ))}
          </div>
        </main>

        {/* Panneau lateral desktop (chat OU participants) */}
        {panel && (
          <aside className="hidden w-80 shrink-0 border-l border-line md:block">
            {panelContent}
          </aside>
        )}
      </div>

      {/* Panneau mobile en plein ecran (drawer) */}
      {panel && (
        <div className="fixed inset-0 z-30 bg-ink md:hidden">{panelContent}</div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-panel border border-line px-4 py-2 text-xs text-paper shadow-xl">
          {toast}
        </div>
      )}

      <Controls
        micOn={micOn}
        camOn={camOn}
        screenSharing={isScreenSharing}
        handRaised={handRaised}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleScreenShare={toggleScreenShare}
        onToggleHand={toggleHand}
        onSendReaction={sendReaction}
        onToggleChat={() => togglePanel("chat")}
        onToggleParticipants={() => togglePanel("participants")}
        onLeave={handleLeave}
        onCopyLink={copyRoomLink}
        participantCount={participantCount}
        maxParticipants={MAX_PARTICIPANTS}
      />
    </div>
  );
}
