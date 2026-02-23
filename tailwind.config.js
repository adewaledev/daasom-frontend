/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#1D4ED8",
          black: "#0B0F19",
        },
      },
    },
  },
  plugins: [],
};
