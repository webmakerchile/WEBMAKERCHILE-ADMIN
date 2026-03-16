import { useState, useRef, useEffect } from "react";
import { useListGeminiConversations, useCreateGeminiConversation } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useChatStream } from "@/hooks/use-chat-stream";
import { 
  MessageSquare, Plus, Send, Bot, User, Loader2
} from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { getListGeminiConversationsQueryKey } from "@workspace/api-client-react";

export default function ChatPage() {
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  
  const { data: conversations, isLoading: loadingConvs } = useListGeminiConversations();
  const createConv = useCreateGeminiConversation();
  const queryClient = useQueryClient();
  
  const { sendMessage, isStreaming, streamedResponse } = useChatStream(activeConvId);

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (conversations?.length && !activeConvId) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations, activeConvId]);

  const handleCreateNew = () => {
    createConv.mutate({ data: { title: "Nueva Idea de Contenido" } }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListGeminiConversationsQueryKey() });
        setActiveConvId(data.id);
      }
    });
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-8rem)] gap-6">
        
        {/* Sidebar Conversations */}
        <div className="w-80 flex flex-col glass-card rounded-3xl border border-white/5 overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-white/5">
            <button 
              onClick={handleCreateNew}
              disabled={createConv.isPending}
              className="w-full flex items-center justify-center py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
            >
              {createConv.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
              Nueva Conversación
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingConvs ? (
               <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : conversations?.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                  activeConvId === conv.id 
                    ? "bg-primary/20 text-primary border border-primary/30" 
                    : "text-muted-foreground hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="font-medium truncate">{conv.title}</div>
                <div className="text-xs opacity-50 mt-1">{new Date(conv.createdAt).toLocaleDateString()}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col glass-card rounded-3xl border border-white/5 overflow-hidden">
          {!activeConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
              <p>Selecciona o crea una conversación para interactuar con Gemini 3.1 Pro</p>
            </div>
          ) : (
            <>
              {/* Messages Area - simplified for demo, normally would fetch past messages via useListGeminiMessages */}
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
                 {/* In a complete implementation, map over fetched messages here */}
                 
                 {isStreaming && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-primary" />
                      </div>
                      <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-none p-4 max-w-[80%] text-foreground whitespace-pre-wrap">
                        {streamedResponse || <span className="animate-pulse">Escribiendo...</span>}
                      </div>
                    </motion.div>
                 )}
                 {!isStreaming && !streamedResponse && (
                    <div className="h-full flex items-center justify-center opacity-50">
                        <p className="text-sm">Inicia una conversación...</p>
                    </div>
                 )}
              </div>

              {/* Input Area */}
              <div className="p-4 bg-background/50 border-t border-white/5">
                <form onSubmit={handleSend} className="relative">
                  <input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isStreaming}
                    placeholder="Escribe tu prompt para ideas de contenido..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-6 pr-14 py-4 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={!input.trim() || isStreaming}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary hover:bg-orange-400 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

      </div>
    </Layout>
  );
}
