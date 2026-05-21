/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        rust: {
          50:  "#fff3ed",
          100: "#ffe4cc",
          200: "#ffc594",
          300: "#ff9d5c",
          400: "#ff7024",
          500: "#f04f00",
          600: "#cc3a00",
          700: "#a82b00",
          800: "#862200",
          900: "#6e1c00",
        },
        surface: {
          900: "#0d0d0f",
          800: "#141418",
          700: "#1c1c22",
          600: "#24242c",
          500: "#2e2e38",
          400: "#3a3a46",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

