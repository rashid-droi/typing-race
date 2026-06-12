/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
      animation: {
        shake: "shake 0.38s cubic-bezier(0.36, 0.07, 0.19, 0.97) both",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "15%": { transform: "translateX(-7px)" },
          "30%": { transform: "translateX(7px)" },
          "45%": { transform: "translateX(-5px)" },
          "60%": { transform: "translateX(5px)" },
          "75%": { transform: "translateX(-2px)" },
          "90%": { transform: "translateX(2px)" },
        },
      },
    },
  },
  plugins: [],
};
