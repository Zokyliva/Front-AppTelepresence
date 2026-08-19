import { useEffect, useRef, useState } from "react";

export default function Chat({
  messages,
  selfId,
  typingLabel,
  onSend,
  onTyping,
  onClose,
}) {
  const [text, setText] = useState("");
  const scrollRef = useRef(null);
  const typingTimeout = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, typingLabel]);

  function handleChange(e) {
    setText(e.target.value);
    onTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 1500);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onSend(clean);
    setText("");
    onTyping(false);
    clearTimeout(typingTimeout.current);
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Chat</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm md:hidden"
            aria-label="Fermer le chat"
          >
            ✕
          </button>
        )}
      </div>

      <div ref={scrollRef} className="thin-scroll flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-600 mt-6">
            Aucun message pour l'instant. Dis bonjour 👋
          </p>
        )}
        {messages.map((m, i) => {
          const isSelf = m.id === selfId;
          return (
            <div key={i} className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                  isSelf
                    ? "bg-accent text-ink rounded-br-sm"
                    : "bg-slate-800 text-slate-100 rounded-bl-sm"
                }`}
              >
                {!isSelf && (
                  <p className="mb-0.5 text-xs font-semibold text-accent">{m.name}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              </div>
              <span className="mt-0.5 text-[10px] text-slate-600">
                {formatTime(m.time)}
              </span>
            </div>
          );
        })}
        {typingLabel && (
          <p className="text-xs italic text-slate-500">{typingLabel}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-800 p-3">
        <input
          value={text}
          onChange={handleChange}
          placeholder="Écrire un message…"
          maxLength={1000}
          className="flex-1 rounded-xl bg-ink border border-slate-700 px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 text-sm font-medium text-ink hover:brightness-110 active:scale-95 transition"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
