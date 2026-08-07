---
name: QueryClient de contexto vs. objeto importado
description: Por qué un useQuery sin queryFn explícito puede fallar en silencio al portar pantallas entre dos apps React con distinta convención de query client.
---

# QueryClient de contexto vs. objeto importado

`useQuery()` resuelve su `queryFn` (y su config de caché) por el `QueryClientProvider` ACTUAL en el árbol de React (contexto), no por qué objeto `queryClient` se haya importado en ese archivo. Importar `queryClient` de un módulo nuevo y usarlo solo para `.invalidateQueries()`/mutaciones no conecta a ese objeto con los `useQuery()` del mismo archivo — si nadie puso un `<QueryClientProvider client={eseQueryClient}>` en un ancestro, esos `useQuery()` siguen usando el provider ambiental heredado, que puede tener una convención de `queryFn` por defecto distinta (o ninguna).

**Síntoma:** error de TanStack Query "No queryFn was passed... no default queryFn was found" en llamadas `useQuery({queryKey})` sin `queryFn` explícito — pero SOLO en algunas páginas/queries, porque las que sí pasan un `queryFn` inline siguen funcionando igual. El bug parece "inconsistente" (una lista vacía acá, un detalle que sí carga allá) cuando en realidad es sistémico: afecta a toda query portada que dependa del default.

**Por qué pasa al portar entre dos apps:** la app origen suele tener su queryClient con un `getQueryFn` genérico como default (fetch por queryKey); la app destino puede no tener default alguno (todas sus queries usan `queryFn` explícito por convención propia). Las páginas portadas se escribieron asumiendo el default del ORIGEN, pero terminan montadas bajo el `QueryClientProvider` de la app destino.

**Cómo aplicar / arreglar:** envolver el subárbol portado en su propio `<QueryClientProvider client={queryClientDelOrigen}>` (anidado, no reemplaza al de la app destino) para que tanto el default `queryFn` como los `invalidateQueries()` apunten al MISMO queryClient que los `useQuery()` de esas páginas realmente usan.

**Cómo detectarlo rápido:** si el error aparece para unas queryKeys y no otras dentro del mismo archivo o feature, revisar cuáles de esas llamadas tienen `queryFn` inline — las que no lo tienen son las afectadas, no es aleatorio.
