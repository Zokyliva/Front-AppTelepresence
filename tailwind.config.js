/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1120",
        panel: "#111827",
        accent: "#2dd4bf",
      },
    },
  },
  plugins: [],
};
