import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import VideoTile from "../components/VideoTile.jsx";
import Chat from "../components/Chat.jsx";
import Controls from "../components/Controls.jsx";
import { useWebRTC } from "../hooks/useWebRTC.js";
import { socket } from "../lib/socket.js";

const MAX_PARTICIPANTS = 25;

export default function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const name = location.state?.name || localStorage.getItem("telepresence:name");

  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimeout = useRef(null);

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

  const { status, errorMessage, peers, chatMessages, typingUsers, sendChatMessage, sendTyping, broadcastMediaState } =
    useWebRTC({ roomId, name, localStream });

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

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(""), 2200);
  }

  function copyRoomLink() {
    const url = window.location.href;
    navigator.clipboard
      ?.writeText(url)
      .then(() => showToast("Lien de la salle copié ✓"))
      .catch(() => showToast("Impossible de copier le lien"));
  }

  function handleLeave() {
    localStream?.getTracks().forEach((t) => t.stop());
    navigate("/");
  }

  const peerList = Object.entries(peers).filter(([, p]) => p.name); // ignore entrees vides
  const participantCount = peerList.length + 1; // + soi-meme

  const typingNames = Object.values(typingUsers);
  const typingLabel =
    typingNames.length === 0
      ? ""
      : typingNames.length === 1
      ? `${typingNames[0]} est en train d'écrire…`
      : `${typingNames.length} personnes écrivent…`;

  if (!name) return null;

  return (
    <div className="flex h-dvh flex-col bg-ink">
      {/* En-tete */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold text-white">Salle : {roomId}</h1>
          <p className="text-xs text-slate-500">
            {status === "connecting" && "Connexion en cours…"}
            {status === "connected" && `${participantCount}/${MAX_PARTICIPANTS} participants`}
            {status === "error" && "Erreur de connexion"}
            {status === "full" && "Salle complète"}
          </p>
        </div>
        <button
          onClick={() => setChatOpen(true)}
          className="hidden items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white md:flex"
        >
          💬 Chat {chatMessages.length > 0 && `(${chatMessages.length})`}
        </button>
      </header>

      {(status === "error" || status === "full" || mediaError) && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {mediaError || errorMessage}
        </div>
      )}

      {/* Corps : grille video + panneau chat (desktop) */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-3 md:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <VideoTile
              stream={localStream}
              name={name}
              isLocal
              micOn={micOn}
              camOn={camOn}
            />
            {peerList.map(([id, p]) => (
              <VideoTile
                key={id}
                stream={p.stream}
                name={p.name}
                micOn={p.micOn !== false}
                camOn={p.camOn !== false}
              />
            ))}
          </div>
        </main>

        {/* Panneau chat desktop (colonne fixe) */}
        <aside
          className={`hidden w-80 shrink-0 border-l border-slate-800 md:block ${
            chatOpen ? "md:block" : "md:hidden"
          }`}
        >
          <Chat
            messages={chatMessages}
            selfId={socket.id}
            typingLabel={typingLabel}
            onSend={sendChatMessage}
            onTyping={sendTyping}
            onClose={() => setChatOpen(false)}
          />
        </aside>
      </div>

      {/* Chat mobile en plein ecran (drawer) */}
      {chatOpen && (
        <div className="fixed inset-0 z-30 bg-ink md:hidden">
          <Chat
            messages={chatMessages}
            selfId={socket.id}
            typingLabel={typingLabel}
            onSend={sendChatMessage}
            onTyping={sendTyping}
            onClose={() => setChatOpen(false)}
          />
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}

      <Controls
        micOn={micOn}
        camOn={camOn}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleChat={() => setChatOpen((v) => !v)}
        onLeave={handleLeave}
        onCopyLink={copyRoomLink}
        participantCount={participantCount}
        maxParticipants={MAX_PARTICIPANTS}
      />
    </div>
  );
}
