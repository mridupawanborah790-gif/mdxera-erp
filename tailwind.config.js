/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
    "./index.tsx"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#004242',
        'primary-dark': '#003333',
        accent: '#ffcc00',
        'app-bg': '#fdfdf5',
        'card-bg': '#ffffff',
        'sidebar-bg': '#0F4C5C',
        'sidebar-bg-dark': '#0A3B49',
        'app-text-primary': '#000000',
        'app-text-secondary': '#333333',
        'app-border': '#999999',
      },
      borderRadius: {
        'tally': '0px',
      }
    },
  },
  plugins: [],
}
