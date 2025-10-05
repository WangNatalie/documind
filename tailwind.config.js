/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./viewer.html",
    "./popup.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ECE2FF',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#7a57cbff',
          600: '#633CB1', // Your custom color
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        neutral: {
          25: '#FCFCFD',
        }
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
