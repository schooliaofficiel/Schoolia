/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marine: { DEFAULT: '#12315C', 50: '#EEF3FA', 100: '#D9E4F4', 200: '#B3C8E8', 700: '#0E2748', 800: '#0A1E39', 900: '#071528' },
        ciel: { DEFAULT: '#1E9BD7', 50: '#E8F6FC', 100: '#C9EBF9', 600: '#1887BD', 700: '#12709F' },
        crayon: { DEFAULT: '#F5B82E', 50: '#FFF7E0', 100: '#FDEBB5', 700: '#A87306' },
        marge: { DEFAULT: '#D64545', 50: '#FDECEC', 700: '#A92E2E' },
        feuille: { DEFAULT: '#1F9D6B', 50: '#E6F6EF', 700: '#157350' },
        papier: '#F5F7FB',
        encre: '#14213D',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
