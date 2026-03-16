import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <div className="h-full flex flex-col items-center justify-center">
        <div className="glass-card p-12 rounded-3xl text-center border border-white/5">
          <FileQuestion className="w-24 h-24 text-primary/50 mx-auto mb-6" />
          <h1 className="text-4xl font-display font-bold mb-4">404 - No Encontrado</h1>
          <p className="text-muted-foreground mb-8 text-lg">La página que buscas no existe o ha sido movida.</p>
          <Link href="/" className="px-6 py-3 bg-primary text-white rounded-xl font-medium shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all inline-block">
            Volver al Dashboard
          </Link>
        </div>
      </div>
    </Layout>
  );
}
