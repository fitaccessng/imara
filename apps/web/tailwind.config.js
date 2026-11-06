/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        imara: {
          navy: "#102b46",
          green: "#1d8a5b",
          paper: "#f6f5f0",
          ink: "#172d3a",
        },
      },
    },
  },
  plugins: [],
};
