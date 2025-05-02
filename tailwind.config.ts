import type { Config } from "tailwindcss";

export default {
    darkMode: "class", // Keep class-based dark mode if needed, though 98/7 might not use it
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
            // Remove ShadCN specific HSL variables
            // background: 'hsl(var(--background))',
            // foreground: 'hsl(var(--foreground))',
            // ... remove others ...

            // Add the accent color using the CSS variable defined in globals.css
            accent: 'var(--accent-purple)',
  		},
  		borderRadius: {
             // Keep or remove if not needed - 98/7 might dictate border radius
  			lg: '0.5rem', // Example value
  			md: '0.375rem',
  			sm: '0.25rem'
  		},
  		keyframes: {
            // Keep animations if used by components like Toast
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			}
  		},
  		animation: {
            // Keep animations if used
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")], // Keep if animations are used
} satisfies Config;
