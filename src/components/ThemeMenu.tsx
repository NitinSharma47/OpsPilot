"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/lib/theme";

const choices = [
  { id: "light", label: "Light", description: "Soft and focused", mark: "☼" },
  { id: "dark", label: "Dark", description: "True black & slate", mark: "◐" },
  { id: "classic", label: "Classic", description: "Ink & parchment", mark: "▤" },
  { id: "lovely", label: "Lovely", description: "Berry & lilac", mark: "✿" },
] as const;

export default function ThemeMenu({ profileHref = "/profile" }: { profileHref?: string }) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  return (
    <div className="settings-control">
      <button
        className={`settings-trigger ${open ? "settings-trigger-open" : ""}`}
        aria-expanded={open}
        aria-label="Open preferences and settings"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⚙</span><span className="settings-trigger-label">Preferences</span><span className="settings-chevron">⌄</span>
      </button>
      {open && <>
        <button className="settings-dismiss" aria-label="Close settings" onClick={() => setOpen(false)} />
        <section className="settings-popover" aria-label="Preferences">
          <div className="settings-popover-head"><div><p className="eyebrow">MAKE YOURSELF AT HOME</p><h2>Preferences</h2></div><button className="settings-close" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
          <p className="settings-label">APPEARANCE</p>
          <div className="theme-options">
            {choices.map((choice) => (
              <button
                key={choice.id}
                className={`theme-option ${theme === choice.id ? "theme-option-active" : ""}`}
                onClick={() => setTheme(choice.id)}
              >
                <span className={`theme-swatch theme-swatch-${choice.id}`}>{choice.mark}</span>
                <span className="theme-copy"><strong>{choice.label}</strong><small>{choice.description}</small></span>
                <span className="theme-check">{theme === choice.id ? "✓" : ""}</span>
              </button>
            ))}
          </div>
          <div className="settings-foot"><Link href={profileHref} onClick={() => setOpen(false)}>View your profile <span>→</span></Link></div>
        </section>
      </>}
    </div>
  );
}
