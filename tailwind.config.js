/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Palette "régie de diffusion" : charbon chaud plutôt que bleu-nuit,
        // un accent ambre (contrôles actifs) et un tally rouge-orangé
        // (statuts live / coupé) - references au monde de la retransmission
        // video plutot qu'un dark-mode SaaS générique.
        ink: "#15130f", // fond principal
        panel: "#211e19", // surfaces (cartes, barres)
        line: "#38322a", // bordures / séparateurs
        paper: "#f3ede1", // texte principal (blanc chaud)
        muted: "#a89d8c", // texte secondaire
        phosphor: "#d9a441", // accent principal (actions, focus)
        tally: "#ff5a3c", // signal live / alerte / micro coupé
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      keyframes: {
        "tally-pulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.35 },
        },
        "float-up": {
          "0%": { transform: "translateY(0)", opacity: 0 },
          "15%": { opacity: 1 },
          "100%": { transform: "translateY(-120px)", opacity: 0 },
        },
      },
      animation: {
        "tally-pulse": "tally-pulse 1.6s ease-in-out infinite",
        "float-up": "float-up 2.2s ease-out forwards",
      },
    },
  },
  plugins: [],
};
