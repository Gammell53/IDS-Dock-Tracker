/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Status colors
    {
      pattern: /(bg|text|border)-(emerald|amber|red|blue|gray)-(50|100|200|300|400|500|600|700|800|900)/,
      variants: ['hover'],
    },
    // Opacity variants
    {
      pattern: /bg-(emerald|amber|red|blue|gray)-500\/[0-9]+/,
      variants: ['hover'],
    },
    // Other utility classes that might be dynamically generated
    'backdrop-blur-sm',
    'shadow-sm',
    'shadow-lg',
    'scale-105',
    'ring-2',
    'ring-blue-500',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
