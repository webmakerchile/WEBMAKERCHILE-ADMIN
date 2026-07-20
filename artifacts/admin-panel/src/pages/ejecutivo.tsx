import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";

export default function EjecutivoPage() {
  const [, setLocation] = useLocation();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#0A0A0A" }}>
      <iframe
        src="/hub-ejecutivo.html"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        title="Hub Ejecutivo WebMaker Latam"
        allow="clipboard-write"
      />

      <button
        onClick={() => setLocation("/")}
        title="Volver al panel"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 200,
          background: "rgba(0,0,0,0.82)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.875rem",
          borderRadius: "0.75rem",
          color: "white",
          fontSize: "0.8125rem",
          fontWeight: 500,
          border: "1px solid rgba(255,255,255,0.12)",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(20,20,20,0.95)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.82)"; }}
      >
        <img src="/icon-192.png" alt="Logo" style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0 }} />
        <ChevronRight style={{ width: 14, height: 14, transform: "rotate(180deg)", opacity: 0.5, flexShrink: 0 }} />
        <span>Panel Admin</span>
      </button>
    </div>
  );
}
