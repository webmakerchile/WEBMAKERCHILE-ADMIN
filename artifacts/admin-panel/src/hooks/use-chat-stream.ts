import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListGeminiMessagesQueryKey } from "@workspace/api-client-react";

interface MessageChunk {
  content?: string;
  done?: boolean;
}

export function useChatStream(conversationId: number | null) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (content: string) => {
    if (!conversationId) return;

    setIsStreaming(true);
    setStreamedResponse("");
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/gemini/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "");
            if (!dataStr.trim()) continue;

            try {
              const data = JSON.parse(dataStr) as MessageChunk;
              if (data.done) {
                // Invalidate query when done to refresh full message list
                queryClient.invalidateQueries({
                  queryKey: getListGeminiMessagesQueryKey(conversationId),
                });
                break;
              }
              if (data.content) {
                setStreamedResponse((prev) => prev + data.content);
              }
            } catch (e) {
              console.error("Failed to parse SSE chunk:", e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Stream aborted");
      } else {
        setError(err.message || "An error occurred during streaming");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const cancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelStream();
  }, []);

  return {
    sendMessage,
    isStreaming,
    streamedResponse,
    error,
    cancelStream,
  };
}
