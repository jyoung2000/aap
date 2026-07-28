/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Single accent — deep blue.
        accent: {
          50: '#eff5ff',
          100: '#dbe8fe',
          200: '#bfd7fe',
          300: '#93bbfd',
          400: '#6096fa',
          500: '#3b76f6',
          600: '#2563eb',
          700: '#1d4fd7',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Semantic (used sparingly).
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          'Inter',
          'system-ui',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
        card: '0 1px 2px rgba(16,24,40,0.05), 0 4px 16px -4px rgba(16,24,40,0.08)',
        elevated: '0 8px 30px -8px rgba(16,24,40,0.16), 0 2px 8px -2px rgba(16,24,40,0.08)',
        glow: '0 0 0 4px rgba(37,99,235,0.12)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'check-pop': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '55%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'progress-indeterminate': {
          '0%': { left: '-40%', width: '40%' },
          '100%': { left: '100%', width: '40%' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out both',
        'fade-in-up': 'fade-in-up 0.25s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right': 'slide-in-right 0.28s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'check-pop': 'check-pop 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'progress-indeterminate': 'progress-indeterminate 1.1s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
