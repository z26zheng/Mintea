/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  // 'class' rather than 'media': NativeWind's runtime refuses to set a colour
  // scheme under 'media', and following the OS still needs an explicit
  // `setColorScheme('system')` call — see app/_layout.tsx. It also leaves room
  // for a manual in-app theme toggle later.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand — a deep mint/teal, used for primary actions and the active state.
        mint: {
          50: '#EDFBF5',
          100: '#D3F5E6',
          200: '#A8EACE',
          300: '#72D9B0',
          400: '#3FC291',
          500: '#1FA678',
          600: '#138661',
          700: '#106B4F',
          800: '#0E5540',
          900: '#0C4635',
          950: '#04281E',
        },
        // Neutrals — slightly warm greys so large tables don't read as pure grey.
        ink: {
          50: '#F8F9FA',
          100: '#F1F3F5',
          200: '#E6E9EC',
          300: '#D3D8DE',
          400: '#A4ADB8',
          500: '#74808E',
          600: '#54606E',
          700: '#3C4753',
          800: '#28313B',
          900: '#1A212A',
          950: '#11161C',
        },
        // Semantic money colours. Income is green, spending is neutral-dark (not
        // red) so a normal transaction list doesn't look like an error state.
        positive: '#12A150',
        negative: '#DC2626',
      },
      fontVariant: {
        tabular: ['tabular-nums'],
      },
    },
  },
  plugins: [],
};
