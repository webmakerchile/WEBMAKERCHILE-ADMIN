import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export function GlobalShortcutsProvider() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [location, setLocation] = useLocation();

  // Trigger "new video" reliably from anywhere: if we're already on /videos,
  // dispatch an event the page listens for; otherwise navigate with the
  // ?new=1 deep-link query so the freshly-mounted page picks it up.
  const triggerNewVideo = useCallback(() => {
    if (location === "/videos") {
      window.dispatchEvent(new CustomEvent("videos:new"));
    } else {
      setLocation("/videos?new=1");
    }
  }, [location, setLocation]);

  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener("open-shortcuts", open as EventListener);
    return () => window.removeEventListener("open-shortcuts", open as EventListener);
  }, []);

  useEffect(() => {
    const open = () => setPaletteOpen(true);
    window.addEventListener("open-command-palette", open as EventListener);
    return () => window.removeEventListener("open-command-palette", open as EventListener);
  }, []);

  useKeyboardShortcuts([
    { key: "k", meta: true, allowInInput: true, description: "Paleta de comandos", handler: () => setPaletteOpen((v) => !v) },
    { key: "?", description: "Ver atajos", handler: () => setHelpOpen((v) => !v) },
    { key: "n", description: "Nuevo video", handler: triggerNewVideo },
    { key: "s", description: "Programar publicaciones", handler: () => setLocation("/schedule") },
    { key: "h", prefix: "g", description: "Ir a Inicio", handler: () => setLocation("/") },
    { key: "v", prefix: "g", description: "Ir a Videos", handler: () => setLocation("/videos") },
    { key: "s", prefix: "g", description: "Ir a Programación", handler: () => setLocation("/schedule") },
    { key: "c", prefix: "g", description: "Ir a Cuentas", handler: () => setLocation("/cuentas") },
    { key: "p", prefix: "g", description: "Ir a Portadas", handler: () => setLocation("/cover") },
    { key: "d", prefix: "g", description: "Ir a Descripciones", handler: () => setLocation("/descripciones") },
    { key: "e", prefix: "g", description: "Ir a Estudio", handler: () => setLocation("/estudio") },
  ]);

  return (
    <>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
