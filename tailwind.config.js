/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        hermes: {
          bg: "#0f0f12",
          panel: "#1a1a1e",
          border: "#2a2a30",
          accent: "#aa3bff",
          accentHover: "#c084fc",
        },
      },
    },
  },
  plugins: [],
}

