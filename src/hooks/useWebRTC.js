import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../socket";

// -----------------------------------------------------------------------------
// CONFIGURATION ICE (Interactive Connectivity Establishment)
// -----------------------------------------------------------------------------
// WebRTC a besoin de "serveurs ICE" pour découvrir comment deux navigateurs
// peuvent se joindre directement (P2P), même s'ils sont chacun derrière un
// routeur / NAT.
//
// - Un serveur STUN dit à un navigateur "voici ton adresse IP publique vue
//   de l'extérieur". C'est suffisant dans la majorité des cas (réseaux
//   domestiques classiques).
// - Un serveur TURN sert de relais quand la connexion directe est impossible
//   (NAT symétrique, pare-feu strict) : le trafic audio/vidéo passe alors
//   PAR ce serveur. Non inclus ici (nécessite un serveur payant ou
//   auto-hébergé comme coturn), mais mentionné dans le README.
const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

/**
 * useWebRTC — cœur technique de l'application.
 *
 * Ce hook gère :
 *   1. La connexion/reconnexion à la salle (Socket.IO), y compris après une
 *      coupure réseau (reconnexion automatique).
 *   2. L'acquisition de la webcam/micro et la création d'une
 *      RTCPeerConnection par participant distant (signalisation WebRTC).
 *   3. Le partage d'écran (remplacement de la piste vidéo envoyée aux pairs).
 *   4. La fonctionnalité "lever la main".
 *
 * Vue d'ensemble du flux de données :
 *
 *   Navigateur A                    Serveur (Socket.IO)                Navigateur B
 *   ─────────────                   ────────────────────               ─────────────
 *   room:join        ────────────►  ajoute A à la salle
 *                     ◄────────────  room:participants (liste incl. B)
 *   webrtc:offer      ────────────►  relaie tel quel      ────────────► webrtc:offer
 *                                                          ◄──────────── webrtc:answer
 *   webrtc:answer     ◄────────────  relaie tel quel
 *   webrtc:ice-cand.  ◄───────────►  relaie tel quel      ◄───────────► webrtc:ice-cand.
 *                                                                        (répété plusieurs fois)
 *
 *   Une fois l'échange terminé : connexion DIRECTE entre A et B pour
 *   l'audio/vidéo. Le serveur ne voit plus jamais ce flux, seulement la
 *   signalisation (petits messages texte) et le chat.
 *
 * @param {string} roomId - identifiant de la salle à rejoindre
 * @param {string} pseudo - nom affiché de l'utilisateur local
 */
export function useWebRTC(roomId, pseudo) {
  // ---------------------------------------------------------------------
  // ÉTAT REACT (déclenche un re-rendu quand il change)
  // ---------------------------------------------------------------------
  const [localStream, setLocalStream] = useState(null);
  // remoteStreams : { [socketId]: { stream: MediaStream, pseudo: string } }
  // Un flux vidéo/audio par participant distant, indexé par son socket.id.
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState(null);

  // "disconnected" | "connecting" | "connected"
  // Reflète l'état de la connexion Socket.IO (donc du serveur de
  // signalisation), pour informer l'utilisateur en cas de coupure réseau.
  const [connectionStatus, setConnectionStatus] = useState(
    socket.connected ? "connected" : "connecting"
  );

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  // remoteHandsRaised : { [socketId]: boolean }
  const [remoteHandsRaised, setRemoteHandsRaised] = useState({});
  // remoteScreenSharing : { [socketId]: boolean } — qui partage son écran
  const [remoteScreenSharing, setRemoteScreenSharing] = useState({});

  // ---------------------------------------------------------------------
  // RÉFÉRENCES (ne déclenchent PAS de re-rendu ; état "technique" persistant)
  // ---------------------------------------------------------------------
  // Une RTCPeerConnection par participant distant, indexée par son socket.id.
  const peerConnectionsRef = useRef({});
  // Le flux webcam/micro d'origine (toujours conservé, même pendant un
  // partage d'écran, pour pouvoir y revenir ensuite).
  const localStreamRef = useRef(null);
  // Le flux de partage d'écran actif, s'il y en a un.
  const screenStreamRef = useRef(null);

  // =========================================================================
  // 1. GESTION D'UNE CONNEXION PEER (RTCPeerConnection)
  // =========================================================================

  /**
   * Crée (ou récupère si elle existe déjà) la RTCPeerConnection associée à
   * un participant distant donné.
   *
   * Une RTCPeerConnection représente UNE connexion P2P vers UN pair. Dans
   * une salle à N participants, chaque navigateur maintient donc (N-1)
   * RTCPeerConnection (topologie "mesh complet"). C'est simple à mettre en
   * œuvre mais coûteux en bande passante au-delà de 4-5 participants — au
   *-delà, on utiliserait plutôt un serveur SFU (hors cadre de ce cours).
   */
  const createPeerConnection = useCallback((remoteSocketId, remotePseudo) => {
    if (peerConnectionsRef.current[remoteSocketId]) {
      return peerConnectionsRef.current[remoteSocketId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // On ajoute nos pistes locales (audio + vidéo, ou audio + partage
    // d'écran si actif) à la nouvelle connexion, pour que le pair distant
    // les reçoive.
    const streamToSend = screenStreamRef.current || localStreamRef.current;
    if (streamToSend) {
      streamToSend.getTracks().forEach((track) => {
        pc.addTrack(track, streamToSend);
      });
    }

    // Événement déclenché quand on REÇOIT une piste (vidéo ou audio) du
    // pair distant. C'est ici qu'on récupère son flux pour l'afficher.
    pc.ontrack = (event) => {
      setRemoteStreams((prev) => ({
        ...prev,
        [remoteSocketId]: {
          stream: event.streams[0],
          pseudo: remotePseudo,
        },
      }));
    };

    // Pendant la négociation, le navigateur découvre progressivement les
    // chemins réseau possibles ("candidats ICE") pour joindre le pair. Il
    // faut les transmettre au fur et à mesure via le serveur de
    // signalisation (ils ne sont PAS inclus dans l'offer/answer initiale).
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:ice-candidate", {
          to: remoteSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Si la connexion tombe (réseau coupé côté pair, pair qui ferme son
    // onglet sans prévenir proprement, etc.), on nettoie notre référence
    // locale pour ne pas garder une tuile vidéo "fantôme".
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        removePeer(remoteSocketId);
      }
    };

    peerConnectionsRef.current[remoteSocketId] = pc;
    return pc;
  }, []);

  /** Ferme proprement une RTCPeerConnection et oublie son flux distant. */
  const removePeer = (remoteSocketId) => {
    const pc = peerConnectionsRef.current[remoteSocketId];
    if (pc) {
      pc.close();
      delete peerConnectionsRef.current[remoteSocketId];
    }
    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[remoteSocketId];
      return copy;
    });
    setRemoteHandsRaised((prev) => {
      const copy = { ...prev };
      delete copy[remoteSocketId];
      return copy;
    });
    setRemoteScreenSharing((prev) => {
      const copy = { ...prev };
      delete copy[remoteSocketId];
      return copy;
    });
  };

  /** Ferme TOUTES les connexions peer actuelles (utilisé à la reconnexion). */
  const removeAllPeers = () => {
    Object.keys(peerConnectionsRef.current).forEach(removePeer);
  };

  // =========================================================================
  // 2. CONNEXION / RECONNEXION À LA SALLE (Socket.IO)
  // =========================================================================
  //
  // Socket.IO essaie de se reconnecter automatiquement en cas de coupure
  // réseau (c'est un comportement par défaut de la librairie : backoff
  // exponentiel, plusieurs tentatives). Mais reconnecter le WEBSOCKET ne
  // suffit pas : après une coupure, le client obtient un NOUVEAU socket.id
  // côté serveur, donc il faut :
  //   (a) renvoyer "room:join" pour être re-rattaché à la salle,
  //   (b) réinitialiser nos connexions WebRTC locales, car les pairs
  //       distants nous considèrent comme parti (ils ont reçu
  //       "room:user-left" pendant la coupure) et attendent une nouvelle
  //       offre s'ils nous revoient arriver.
  //
  // L'écoute de l'événement "connect" (et non un simple appel unique au
  // montage) permet de gérer le premier chargement ET chaque reconnexion
  // avec la même logique.
  useEffect(() => {
    function handleConnect() {
      setConnectionStatus("connected");
      // On (re)rejoint la salle à chaque connexion réussie du socket,
      // qu'il s'agisse du tout premier chargement ou d'une reconnexion
      // après coupure réseau.
      socket.emit("room:join", { roomId, pseudo });
    }

    function handleDisconnect() {
      setConnectionStatus("disconnected");
      // Nos anciennes RTCPeerConnection ne servent plus à rien : à la
      // reconnexion, on récupérera un nouveau socket.id et il faudra de
      // toute façon renégocier une connexion WebRTC avec chaque pair.
      removeAllPeers();
      setParticipants([]);
    }

    function handleReconnectAttempt() {
      setConnectionStatus("connecting");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);

    // Cas où le socket est déjà connecté au moment où ce composant
    // apparaît (montage normal, pas une reconnexion) : on déclenche le
    // join immédiatement plutôt que d'attendre un futur événement
    // "connect" qui ne se reproduira pas puisqu'on est déjà connecté.
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, pseudo]);

  // =========================================================================
  // 3. ACQUISITION DE LA WEBCAM / MICRO
  // =========================================================================
  // Indépendant de la connexion à la salle : si getUserMedia échoue
  // (permission refusée, caméra déjà utilisée ailleurs), le chat et la
  // liste des participants doivent continuer à fonctionner normalement.
  useEffect(() => {
    let isMounted = true;

    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!isMounted) return;

        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err) {
        console.error("Erreur d'accès à la caméra/micro :", err);
        setError(
          "Impossible d'accéder à la caméra ou au micro (elle est peut-être déjà utilisée par un autre onglet ou une autre application). Le chat et la liste des participants restent disponibles."
        );
      }
    }

    initMedia();

    return () => {
      isMounted = false;
    };
  }, []);

  // =========================================================================
  // 4. ÉCOUTE DES ÉVÉNEMENTS DE SIGNALISATION ET DE PRÉSENCE
  // =========================================================================
  useEffect(() => {
    // Reçu juste après "room:join" : la liste des participants déjà
    // présents dans la salle. La convention adoptée ici est que c'est
    // TOUJOURS le nouvel arrivant qui initie la connexion WebRTC (envoie
    // l'"offer") vers chaque participant existant.
    async function handleParticipants(existingParticipants) {
      setParticipants(existingParticipants);

      for (const p of existingParticipants) {
        const pc = createPeerConnection(p.socketId, p.pseudo);
        // createOffer() génère une description SDP (Session Description
        // Protocol) qui décrit nos capacités multimédia (codecs
        // supportés, résolution, etc.). setLocalDescription() l'applique
        // localement et déclenche la collecte des candidats ICE.
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { to: p.socketId, offer });
      }
    }

    // Un nouveau participant vient d'arriver : on l'ajoute à notre liste,
    // mais on n'initie PAS de connexion nous-mêmes — c'est lui qui va nous
    // envoyer une "offer" (voir handleParticipants ci-dessus, exécuté de
    // son côté).
    function handleUserJoined({ socketId, pseudo: newPseudo }) {
      setParticipants((prev) => [
        ...prev,
        { socketId, pseudo: newPseudo, joinedAt: Date.now() },
      ]);
    }

    // On reçoit une offer : quelqu'un veut établir une connexion WebRTC
    // avec nous. On répond par une "answer".
    async function handleOffer({ from, offer }) {
      const fromParticipant = participants.find((p) => p.socketId === from);
      const pc = createPeerConnection(from, fromParticipant?.pseudo);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { to: from, answer });
    }

    // Réponse à notre offer initiale : on finalise la description distante.
    async function handleAnswer({ from, answer }) {
      const pc = peerConnectionsRef.current[from];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    }

    // Un candidat ICE (chemin réseau possible) envoyé par un pair : on
    // l'ajoute à notre connexion pour tester s'il permet d'établir le lien
    // direct.
    async function handleIceCandidate({ from, candidate }) {
      const pc = peerConnectionsRef.current[from];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Erreur ICE candidate :", err);
        }
      }
    }

    function handleUserLeft({ socketId }) {
      removePeer(socketId);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
    }

    // ---- Lever la main : mise à jour de l'état d'un participant distant ----
    function handleHandRaise({ socketId, raised }) {
      setRemoteHandsRaised((prev) => ({ ...prev, [socketId]: raised }));
    }

    // ---- Partage d'écran : un pair distant démarre/arrête son partage ----
    function handleScreenShare({ socketId, sharing }) {
      setRemoteScreenSharing((prev) => ({ ...prev, [socketId]: sharing }));
    }

    socket.on("room:participants", handleParticipants);
    socket.on("room:user-joined", handleUserJoined);
    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("room:user-left", handleUserLeft);
    socket.on("hand:raise", handleHandRaise);
    socket.on("screen:share", handleScreenShare);

    return () => {
      socket.off("room:participants", handleParticipants);
      socket.off("room:user-joined", handleUserJoined);
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
      socket.off("room:user-left", handleUserLeft);
      socket.off("hand:raise", handleHandRaise);
      socket.off("screen:share", handleScreenShare);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPeerConnection, participants]);

  // =========================================================================
  // 5. NETTOYAGE COMPLET (sortie de salle / démontage du composant)
  // =========================================================================
  useEffect(() => {
    return () => {
      removeAllPeers();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      socket.emit("room:leave");
    };
  }, []);

  // =========================================================================
  // 6. CONTRÔLES CAMÉRA / MICRO
  // =========================================================================
  const toggleTrack = useCallback(
    (kind) => {
      if (!localStreamRef.current) return;
      const tracks =
        kind === "video"
          ? localStreamRef.current.getVideoTracks()
          : localStreamRef.current.getAudioTracks();

      tracks.forEach((track) => {
        track.enabled = !track.enabled;
        socket.emit("media:toggle", { roomId, kind, enabled: track.enabled });
      });
    },
    [roomId]
  );

  // =========================================================================
  // 7. PARTAGE D'ÉCRAN
  // =========================================================================
  //
  // Principe : getDisplayMedia() ouvre une fenêtre système où l'utilisateur
  // choisit un écran/une fenêtre/un onglet à partager, et renvoie un
  // MediaStream comme getUserMedia(). On ne crée PAS de nouvelles
  // RTCPeerConnection : on utilise replaceTrack() sur chaque connexion déjà
  // établie, ce qui remplace la piste vidéo envoyée SANS renégociation
  // complète (pas de nouvel échange offer/answer nécessaire). C'est la
  // technique standard pour ce cas d'usage.

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        // La plupart des navigateurs permettent aussi de partager l'audio
        // d'un onglet ; on ne le demande pas ici pour rester simple.
      });

      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      // Pour chaque connexion peer existante, on remplace la piste vidéo
      // envoyée (la webcam) par celle du partage d'écran.
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const videoSender = pc
          .getSenders()
          .find((sender) => sender.track && sender.track.kind === "video");
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        }
      });

      setIsScreenSharing(true);
      socket.emit("screen:share", { roomId, sharing: true });

      // Si l'utilisateur arrête le partage depuis l'UI native du
      // navigateur (bouton "Arrêter le partage" de Chrome/Firefox) plutôt
      // que depuis notre bouton, on doit revenir à la webcam nous aussi.
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      // L'utilisateur a annulé la sélection d'écran, ou permission refusée.
      console.error("Partage d'écran annulé ou refusé :", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    // On revient à la piste webcam d'origine pour chaque connexion peer.
    const webcamTrack = localStreamRef.current?.getVideoTracks()[0];
    if (webcamTrack) {
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const videoSender = pc
          .getSenders()
          .find((sender) => sender.track && sender.track.kind === "video");
        if (videoSender) {
          videoSender.replaceTrack(webcamTrack);
        }
      });
    }

    setIsScreenSharing(false);
    socket.emit("screen:share", { roomId, sharing: false });
  }, [roomId]);

  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  // =========================================================================
  // 8. LEVER LA MAIN
  // =========================================================================
  // Fonctionnalité purement "sociale" : ne transite jamais par WebRTC,
  // seulement par Socket.IO (comme le chat), car il n'y a pas de flux
  // continu à transporter, juste une notification ponctuelle.
  const toggleHandRaise = useCallback(() => {
    setHandRaised((prev) => {
      const next = !prev;
      socket.emit("hand:raise", { roomId, raised: next });
      return next;
    });
  }, [roomId]);

  return {
    localStream,
    remoteStreams, // { [socketId]: { stream, pseudo } }
    participants,
    error,
    connectionStatus, // "connected" | "connecting" | "disconnected"
    toggleTrack,
    isScreenSharing,
    toggleScreenShare,
    remoteScreenSharing, // { [socketId]: boolean }
    handRaised,
    toggleHandRaise,
    remoteHandsRaised, // { [socketId]: boolean }
  };
}
