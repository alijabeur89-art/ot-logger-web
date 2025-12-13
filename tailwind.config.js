/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        hmc: {
          primary: "#004C97",
          primarySoft: "#E6F0FA",
          accent: "#3DB4E5",
          ink: "#111827",
          subtle: "#6B7280",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 14px 40px rgba(15, 23, 42, 0.10)",
      },
    },
  },
  plugins: [],
};
