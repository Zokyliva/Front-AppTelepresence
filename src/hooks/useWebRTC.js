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

const REACTION_LIFETIME_MS = 2500;

/**
 * Gere une "salle" en topologie mesh : le navigateur local ouvre une
 * RTCPeerConnection distincte vers CHAQUE autre participant. C'est simple
 * a comprendre et suffisant pour un petit groupe, mais ca ne scale pas a
 * l'infini (voir note dans le README) : c'est pour ca que le serveur
 * plafonne les salles a 25 participants.
 */
export function useWebRTC({ roomId, name, localStream }) {
  // connecting | waiting | connected | error | full | denied | kicked
  const [status, setStatus] = useState("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  // peers: { [peerId]: { name, stream, micOn, camOn, screenSharing, handRaised } }
  const [peers, setPeers] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState({}); // { [peerId]: name }
  const [reactions, setReactions] = useState([]); // [{ key, id, name, emoji }]

  // Role d'hote : le createur de la salle (ou son successeur si l'hote
  // quitte). Determine ce que l'UI autorise (valider les entrees, sourdine
  // forcee, expulsion).
  const [hostId, setHostId] = useState(null);
  const isHost = hostId !== null && hostId === socket.id;

  // Uniquement pertinent pour l'hote : demandes d'entree en attente de
  // validation. [{ id, name }]
  const [waitingList, setWaitingList] = useState([]);

  // Compteur incremente a chaque fois que le serveur nous force la
  // sourdine : Room.jsx observe ce compteur pour reellement couper la
  // piste audio locale (le hook n'a pas acces au localStream lui-meme).
  const [forceMuteSignal, setForceMuteSignal] = useState(0);

  const peerConnections = useRef(new Map()); // peerId -> RTCPeerConnection
  const pendingCandidates = useRef(new Map()); // peerId -> ICE candidates en attente
  const localStreamRef = useRef(localStream);
  localStreamRef.current = localStream;

  // Piste video actuellement envoyee a tout le monde (camera OU partage
  // d'ecran). Toute nouvelle RTCPeerConnection utilise cette reference,
  // pour qu'un participant qui rejoint APRES le debut d'un partage d'ecran
  // recoive quand meme le bon flux des le depart.
  const outgoingVideoTrackRef = useRef(null);
  useEffect(() => {
    if (localStream) {
      outgoingVideoTrackRef.current = localStream.getVideoTracks()[0] || null;
    }
  }, [localStream]);

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

      // Piste audio : toujours celle du micro local.
      const stream = localStreamRef.current;
      const audioTrack = stream?.getAudioTracks()[0];
      if (audioTrack) pc.addTrack(audioTrack, stream);

      // Piste video : la piste "sortante" courante (camera ou ecran partage).
      const videoTrack = outgoingVideoTrackRef.current;
      if (videoTrack) pc.addTrack(videoTrack, stream);

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

    socket.on("peer-screen-share", ({ id, enabled }) => {
      updatePeer(id, { screenSharing: enabled });
    });

    socket.on("peer-raise-hand", ({ id, raised }) => {
      updatePeer(id, { handRaised: raised });
    });

    socket.on("peer-reaction", ({ id, name: peerName, emoji, ts }) => {
      const key = `${id}-${ts}-${Math.random().toString(36).slice(2, 7)}`;
      setReactions((prev) => [...prev, { key, id, name: peerName, emoji }]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.key !== key));
      }, REACTION_LIFETIME_MS);
    });

    // ------------------------------------------------------------
    // Salle d'attente : evenements recus uniquement par l'hote
    // ------------------------------------------------------------
    socket.on("waiting-room-request", ({ id, name: peerName }) => {
      setWaitingList((prev) =>
        prev.some((w) => w.id === id) ? prev : [...prev, { id, name: peerName }]
      );
    });

    socket.on("waiting-room-cancelled", ({ id }) => {
      setWaitingList((prev) => prev.filter((w) => w.id !== id));
    });

    // Recu par le nouvel hote quand le role lui est transfere, avec la
    // liste d'attente en cours a reprendre.
    socket.on("waiting-room-sync", ({ waiting }) => {
      setWaitingList(waiting || []);
    });

    socket.on("host-changed", ({ hostId: newHostId }) => {
      setHostId(newHostId);
      if (newHostId !== socket.id) setWaitingList([]);
    });

    // ------------------------------------------------------------
    // Salle d'attente : evenements recus par le participant en attente
    // ------------------------------------------------------------
    socket.on("admitted", (res) => {
      if (cancelled) return;
      setStatus("connected");
      setHostId(res.hostId);
      setChatMessages(res.chatHistory || []);
      res.participants.forEach((p) => callPeer(p.id, p.name));
    });

    socket.on("join-denied", ({ reason }) => {
      if (cancelled) return;
      setStatus("denied");
      setErrorMessage(reason || "L'hôte a refusé ta demande d'accès.");
    });

    // ------------------------------------------------------------
    // Controles de l'hote qui nous ciblent personnellement
    // ------------------------------------------------------------
    socket.on("force-muted", () => {
      setForceMuteSignal((n) => n + 1);
    });

    socket.on("kicked", () => {
      if (cancelled) return;
      setStatus("kicked");
      setErrorMessage("L'hôte t'a retiré de la salle.");
    });

    socket.on("connect", () => {
      socket.emit("join-room", { roomId, name }, (res) => {
        if (cancelled) return;
        if (!res?.ok) {
          setStatus(res?.error?.includes("pleine") ? "full" : "error");
          setErrorMessage(res?.error || "Impossible de rejoindre la salle.");
          return;
        }
        if (res.pending) {
          // On patiente : c'est l'evenement "admitted" ou "join-denied"
          // qui fera avancer le statut ensuite.
          setStatus("waiting");
          return;
        }
        setStatus("connected");
        setHostId(res.hostId);
        setChatMessages(res.chatHistory || []);
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
      socket.off("peer-screen-share");
      socket.off("peer-raise-hand");
      socket.off("peer-reaction");
      socket.off("waiting-room-request");
      socket.off("waiting-room-cancelled");
      socket.off("waiting-room-sync");
      socket.off("host-changed");
      socket.off("admitted");
      socket.off("join-denied");
      socket.off("force-muted");
      socket.off("kicked");
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

  // ------------------------------------------------------------------
  // Partage d'ecran : remplace la piste video envoyee a TOUTES les
  // connexions existantes (sans renegociation SDP, RTCRtpSender.replaceTrack
  // le permet), et memorise la piste pour les connexions futures.
  // ------------------------------------------------------------------
  const replaceOutgoingVideoTrack = useCallback((newTrack) => {
    outgoingVideoTrackRef.current = newTrack;
    peerConnections.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(newTrack);
    });
  }, []);

  // Retourne une promesse : le serveur peut refuser si quelqu'un d'autre
  // partage deja son ecran dans la salle.
  const setScreenShareState = useCallback((enabled) => {
    return new Promise((resolve) => {
      socket.emit("screen-share-state", { enabled }, (res) => resolve(res || { ok: false }));
    });
  }, []);

  const setRaiseHand = useCallback((raised) => {
    socket.emit("raise-hand", { raised });
  }, []);

  const sendReaction = useCallback((emoji) => {
    socket.emit("reaction", { emoji });
  }, []);

  // ------------------------------------------------------------------
  // Controles reserves a l'hote (le serveur revalide de toute facon).
  // ------------------------------------------------------------------
  const admitParticipant = useCallback((id) => {
    socket.emit("admit-participant", { id });
    setWaitingList((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const denyParticipant = useCallback((id) => {
    socket.emit("deny-participant", { id });
    setWaitingList((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const forceMuteParticipant = useCallback((id) => {
    socket.emit("force-mute", { id });
  }, []);

  const kickParticipant = useCallback((id) => {
    socket.emit("kick-participant", { id });
  }, []);

  return {
    status,
    errorMessage,
    peers,
    chatMessages,
    typingUsers,
    reactions,
    hostId,
    isHost,
    waitingList,
    forceMuteSignal,
    sendChatMessage,
    sendTyping,
    broadcastMediaState,
    replaceOutgoingVideoTrack,
    setScreenShareState,
    setRaiseHand,
    sendReaction,
    admitParticipant,
    denyParticipant,
    forceMuteParticipant,
    kickParticipant,
  };
}
