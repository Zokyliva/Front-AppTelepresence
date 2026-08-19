import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../lib/socket.js";

// Serveurs STUN publics : ils servent uniquement a decouvrir l'IP publique
// de chaque navigateur pour etablir la connexion directe (peer-to-peer).
// Aucune donnee video/audio ne transite par ces serveurs.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

// Serveur TURN optionnel (recommande pour la fiabilite sur reseaux mobiles
// 4G/5G, qui utilisent souvent un NAT restrictif ou un STUN seul ne suffit
// pas). Voir README > "Ameliorer la fiabilite sur mobile" pour l'obtenir
// gratuitement (ex: Metered, Twilio, OpenRelay) et le renseigner ici via
// des variables d'environnement Vite.
const TURN_URL = import.meta.env.VITE_TURN_URL;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL;
if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
  ICE_SERVERS.push({
    urls: TURN_URL,
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  });
}

/**
 * Gere une "salle" en topologie mesh : le navigateur local ouvre une
 * RTCPeerConnection distincte vers CHAQUE autre participant. C'est simple
 * a comprendre et suffisant pour un petit groupe, mais ca ne scale pas a
 * l'infini (voir note dans le README) : c'est pour ca que le serveur
 * plafonne les salles a 25 participants.
 */
export function useWebRTC({ roomId, name, localStream }) {
  const [status, setStatus] = useState("connecting"); // connecting | connected | error | full
  const [errorMessage, setErrorMessage] = useState("");
  const [peers, setPeers] = useState({}); // { [peerId]: { name, stream, micOn, camOn } }
  const [chatMessages, setChatMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState({}); // { [peerId]: name }

  const peerConnections = useRef(new Map()); // peerId -> RTCPeerConnection
  const pendingCandidates = useRef(new Map()); // peerId -> ICE candidates en attente
  const localStreamRef = useRef(localStream);
  localStreamRef.current = localStream;

  const updatePeer = useCallback((peerId, patch) => {
    setPeers((prev) => ({
      ...prev,
      [peerId]: { ...prev[peerId], ...patch },
    }));
  }, []);

  const removePeer = useCallback((peerId) => {
    setPeers((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // ------------------------------------------------------------------
  // Cree (ou reutilise) une RTCPeerConnection pour un participant donne
  // ------------------------------------------------------------------
  const getOrCreatePeerConnection = useCallback(
    (peerId, peerName) => {
      if (peerConnections.current.has(peerId)) {
        return peerConnections.current.get(peerId);
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // On ajoute nos pistes locales (camera + micro) a la connexion
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("signal", {
            to: peerId,
            data: { candidate: event.candidate },
          });
        }
      };

      pc.ontrack = (event) => {
        updatePeer(peerId, { name: peerName, stream: event.streams[0] });
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(pc.connectionState)) {
          // Connexion morte : on nettoie proprement. Si le peer est
          // toujours dans la salle, il sera reconnecte via un nouvel
          // evenement (le mecanisme repose sur user-left/disconnect
          // cote serveur pour forcer un cycle propre plutot qu'un
          // ICE-restart, plus simple pour un MVP).
          pc.close();
          peerConnections.current.delete(peerId);
        }
      };

      peerConnections.current.set(peerId, pc);
      updatePeer(peerId, { name: peerName, micOn: true, camOn: true });
      return pc;
    },
    [updatePeer]
  );

  const closePeerConnection = useCallback((peerId) => {
    const pc = peerConnections.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(peerId);
    }
    pendingCandidates.current.delete(peerId);
  }, []);

  // ------------------------------------------------------------------
  // Initie une offre SDP vers un participant deja present dans la salle
  // ------------------------------------------------------------------
  const callPeer = useCallback(
    async (peerId, peerName) => {
      const pc = getOrCreatePeerConnection(peerId, peerName);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("signal", {
          to: peerId,
          data: { description: pc.localDescription },
        });
      } catch (err) {
        console.error("Erreur creation d'offre vers", peerId, err);
      }
    },
    [getOrCreatePeerConnection]
  );

  // ------------------------------------------------------------------
  // Reception d'un message de signaling (offre / reponse / candidat ICE)
  // ------------------------------------------------------------------
  const handleSignal = useCallback(
    async ({ from, name: peerName, data }) => {
      const pc = getOrCreatePeerConnection(from, peerName);

      try {
        if (data.description) {
          // Si on recoit une offre alors qu'on a deja une negociation en
          // cours (glare), on ignore poliment - suffisant pour ce MVP.
          if (
            data.description.type === "offer" &&
            pc.signalingState !== "stable" &&
            pc.signalingState !== "have-local-offer"
          ) {
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(data.description));

          // On applique les candidats ICE recus avant d'avoir la description
          const queued = pendingCandidates.current.get(from) || [];
          for (const candidate of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidates.current.delete(from);

          if (data.description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("signal", {
              to: from,
              data: { description: pc.localDescription },
            });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            // La description distante n'est pas encore arrivee : on met
            // le candidat de cote pour l'appliquer juste apres.
            const queue = pendingCandidates.current.get(from) || [];
            queue.push(data.candidate);
            pendingCandidates.current.set(from, queue);
          }
        }
      } catch (err) {
        console.error("Erreur traitement signal de", from, err);
      }
    },
    [getOrCreatePeerConnection]
  );

  // ------------------------------------------------------------------
  // Cycle de vie : connexion socket + abonnements aux evenements
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!roomId || !name || !localStream) return;

    let cancelled = false;
    setStatus("connecting");
    setErrorMessage("");

    socket.connect();

    socket.on("connect_error", () => {
      if (!cancelled) {
        setStatus("error");
        setErrorMessage(
          "Impossible de joindre le serveur. Il est peut-être en veille (cold start Render) : réessaie dans quelques secondes."
        );
      }
    });

    socket.on("signal", handleSignal);

    socket.on("user-joined", ({ id, name: peerName }) => {
      // Un nouveau participant vient d'arriver APRES nous : on ne fait
      // rien, c'est lui qui va nous envoyer une offre.
      updatePeer(id, { name: peerName });
    });

    socket.on("user-left", ({ id }) => {
      closePeerConnection(id);
      removePeer(id);
      setTypingUsers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on("chat-message", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    socket.on("typing", ({ id, name: peerName, isTyping }) => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (isTyping) next[id] = peerName;
        else delete next[id];
        return next;
      });
    });

    socket.on("peer-media-state", ({ id, kind, enabled }) => {
      if (kind === "audio") updatePeer(id, { micOn: enabled });
      if (kind === "video") updatePeer(id, { camOn: enabled });
    });

    socket.on("connect", () => {
      socket.emit("join-room", { roomId, name }, (res) => {
        if (cancelled) return;
        if (!res?.ok) {
          setStatus(res?.error?.includes("pleine") ? "full" : "error");
          setErrorMessage(res?.error || "Impossible de rejoindre la salle.");
          return;
        }
        setStatus("connected");
        // On initie une offre vers chaque participant deja present
        res.participants.forEach((p) => callPeer(p.id, p.name));
      });
    });

    return () => {
      cancelled = true;
      socket.off("connect_error");
      socket.off("signal", handleSignal);
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("chat-message");
      socket.off("typing");
      socket.off("peer-media-state");
      socket.off("connect");
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      pendingCandidates.current.clear();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, name, localStream]);

  const sendChatMessage = useCallback((text) => {
    socket.emit("chat-message", { text });
  }, []);

  const sendTyping = useCallback((isTyping) => {
    socket.emit("typing", { isTyping });
  }, []);

  const broadcastMediaState = useCallback((kind, enabled) => {
    socket.emit("media-state", { kind, enabled });
  }, []);

  return {
    status,
    errorMessage,
    peers,
    chatMessages,
    typingUsers,
    sendChatMessage,
    sendTyping,
    broadcastMediaState,
  };
}
