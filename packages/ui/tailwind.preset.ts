import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--color-primary-rgb) / <alpha-value>)",
        "primary-foreground": "var(--color-button-text)",
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        muted: "var(--color-muted)",
        "muted-foreground": "var(--color-muted-foreground)",
        border: "var(--color-border)",
        accent: "rgb(var(--color-accent-rgb) / <alpha-value>)",
      },
      fontFamily: {
        heading: "var(--font-heading)",
        body: "var(--font-body)",
      },
      borderRadius: {
        base: "var(--radius-base)",
        button: "var(--radius-button)",
        input: "var(--radius-input)",
        card: "var(--radius-card)",
      },
      maxWidth: {
        page: "var(--page-width)",
      },
      spacing: {
        section: "var(--spacing-section)",
      },
    },
  },
} satisfies Partial<Config>;
