// Portada de ejemplo de cada formato interactivo.
//
// El selector mostraba un emoji y una frase, así que no había forma de saber
// qué salía al elegir un formato — y el único ejemplo que existía era una
// imagen fija del diseño antiguo, que envejeció mal.
//
// Estas portadas se DIBUJAN con la misma geometría que usa el compositor del
// servidor (render-interactivo), sobre el fondo del estudio en penumbra. Al
// ser dibujadas y no fotos guardadas, nunca pueden quedar desfasadas del
// resultado real: si mañana cambia el layout, cambian solas.
//
// Y se dibujan a partir del FORMATO, no del tipo de bloque: hay diez formatos
// y siete bloques, así que tres parejas comparten forma. Lo que las distingue
// —cuántas opciones, si una va marcada, los rótulos del duelo, si los pasos
// van numerados— es exactamente lo que distingue a la pieza real.

/** Lo que el catálogo del servidor expone de cada formato. */
export interface FormatoPortada {
  bloque: string;
  opciones: number;
  etiquetas: string[] | null;
  ordenado: boolean;
  marcaCorrecta: boolean;
}

const AMBAR = "#FB923C";
const FONDO = "#171310";
const HALO = "#3A2415";
const CARTA = "#FFFFFF";
const GRIS = "#E7EAEE";

/** Silueta simplificada de Webi: lo justo para que se lea "está el zorro". */
function Webi({ x, y, escala = 1 }: { x: number; y: number; escala?: number }) {
  const s = escala;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity="0.95">
      {/* cola */}
      <path d="M34 44 q16 6 18 20 q-10 4 -18 -4 z" fill="#E86A30" stroke="#141210" strokeWidth="2.4" />
      {/* cuerpo */}
      <rect x="8" y="30" width="26" height="26" rx="7" fill="#4A5D3A" stroke="#141210" strokeWidth="2.4" />
      {/* cabeza */}
      <path d="M6 8 L12 0 L16 8 M36 8 L30 0 L26 8" fill="#E86A30" stroke="#141210" strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="4" y="6" width="34" height="26" rx="12" fill="#E86A30" stroke="#141210" strokeWidth="2.4" />
      {/* lentes */}
      <rect x="8" y="14" width="11" height="8" rx="2.5" fill="none" stroke="#141210" strokeWidth="2.4" />
      <rect x="23" y="14" width="11" height="8" rx="2.5" fill="none" stroke="#141210" strokeWidth="2.4" />
      <line x1="19" y1="18" x2="23" y2="18" stroke="#141210" strokeWidth="2.4" />
      {/* hocico */}
      <ellipse cx="21" cy="27" rx="9" ry="5" fill="#F5E6D3" stroke="#141210" strokeWidth="2.2" />
      <ellipse cx="21" cy="24.5" rx="2.6" ry="2" fill="#141210" />
    </g>
  );
}

/** Barras que insinúan el titular arriba, con la palabra clave en ámbar. */
function Titular({ y }: { y: number }) {
  return (
    <g>
      <rect x="16" y={y} width="52" height="9" rx="2" fill={AMBAR} />
      <rect x="72" y={y} width="46" height="9" rx="2" fill="#FFFFFF" />
      <rect x="16" y={y + 13} width="78" height="9" rx="2" fill="#FFFFFF" />
    </g>
  );
}

/** Zona reservada al bloque, en coordenadas de la portada. */
const ZONA = { y: 124, alto: 76 };

/**
 * Tarjeta con opciones apiladas: encuesta (2, ninguna marcada) y quiz (3, la
 * correcta en ámbar). El alto de las píldoras sale del hueco, igual que en el
 * servidor, para que dos y tres opciones ocupen lo mismo.
 */
function TarjetaOpciones({ n, marcaCorrecta }: { n: number; marcaCorrecta: boolean }) {
  const filas = Math.max(2, n);
  const gap = 3;
  const altoPregunta = 18;
  const altoPildora = (ZONA.alto - altoPregunta - 12 - gap * (filas - 1)) / filas;
  const y0 = ZONA.y;
  return (
    <g>
      <rect x="14" y={y0} width="132" height={ZONA.alto} rx="10" fill={CARTA} fillOpacity="0.97" />
      <rect x="26" y={y0 + 7} width="86" height="6" rx="2" fill="#3A3F47" />
      {Array.from({ length: filas }, (_, i) => {
        const y = y0 + altoPregunta + 4 + i * (altoPildora + gap);
        // El quiz marca la correcta; la encuesta no, porque destacar una
        // opción sesgaría la respuesta.
        const correcta = marcaCorrecta && i === 1;
        return (
          <g key={i}>
            <rect
              x="24" y={y} width="112" height={altoPildora} rx={altoPildora / 2}
              fill={correcta ? AMBAR : GRIS}
            />
            <rect
              x="34" y={y + altoPildora / 2 - 2.5} width={34 - i * 5} height="5" rx="2.5"
              fill={correcta ? "#2A1B0E" : "#7B828C"}
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * Dos mitades enfrentadas. Con rótulos si el formato los fija (MITO /
 * REALIDAD): sin ellos no se sabe cuál de los dos lados es el que vale.
 */
function Duelo({ etiquetas }: { etiquetas: string[] | null }) {
  const altoRotulo = etiquetas ? 11 : 0;
  const alto = ZONA.alto - altoRotulo - 8;
  const y0 = ZONA.y + altoRotulo + 4;
  const cy = y0 + alto / 2;
  return (
    <g>
      {etiquetas && (
        <>
          <text x="44" y={y0 - 4} textAnchor="middle" fontSize="8" fontWeight="800" letterSpacing="0.7" fill="#FFFFFF">
            {etiquetas[0]}
          </text>
          <text x="116" y={y0 - 4} textAnchor="middle" fontSize="8" fontWeight="800" letterSpacing="0.7" fill={AMBAR}>
            {etiquetas[1]}
          </text>
        </>
      )}
      <rect x="14" y={y0} width="60" height={alto} rx="10" fill={CARTA} fillOpacity="0.97" />
      <rect x="26" y={cy - 4} width="36" height="8" rx="3" fill="#3A3F47" />
      <rect x="86" y={y0} width="60" height={alto} rx="10" fill={AMBAR} />
      <rect x="98" y={cy - 4} width="36" height="8" rx="3" fill="#2A1B0E" />
      <circle cx="80" cy={cy} r="15" fill="#141318" />
      <text x="80" y={cy + 5} textAnchor="middle" fontSize="12" fontWeight="800" fill="#FFFFFF">VS</text>
    </g>
  );
}

/** Sello inclinado de VERDADERO / FALSO. */
function Veredicto() {
  const cy = ZONA.y + ZONA.alto / 2;
  return (
    <g transform={`rotate(-4 80 ${cy})`}>
      <rect x="26" y={cy - 20} width="108" height="40" rx="7" fill="none" stroke="#EF4444" strokeWidth="3.5" />
      <rect x="31" y={cy - 15} width="98" height="30" rx="5" fill="#EF4444" fillOpacity="0.16" />
      <rect x="46" y={cy - 5} width="68" height="10" rx="3" fill="#EF4444" />
    </g>
  );
}

/**
 * Filas de la lista. El test rápido lleva casillas —se marcan en cualquier
 * orden—; el reto lleva los pasos numerados, porque van en secuencia.
 */
function Checklist({ n, ordenado }: { n: number; ordenado: boolean }) {
  const filas = Math.max(2, n);
  const gap = 4;
  const altoFila = (ZONA.alto - gap * (filas - 1)) / filas;
  const lado = Math.min(11, altoFila * 0.55);
  return (
    <g>
      {Array.from({ length: filas }, (_, i) => {
        const y = ZONA.y + i * (altoFila + gap);
        const cy = y + altoFila / 2;
        return (
          <g key={i}>
            <rect x="14" y={y} width="132" height={altoFila} rx="6" fill={CARTA} fillOpacity="0.95" />
            {ordenado ? (
              <>
                <circle cx={22 + lado / 2} cy={cy} r={lado / 2} fill={AMBAR} />
                <text
                  x={22 + lado / 2} y={cy + lado * 0.2} textAnchor="middle"
                  fontSize={lado * 0.72} fontWeight="800" fill="#141318"
                >
                  {i + 1}
                </text>
              </>
            ) : (
              <rect
                x="22" y={cy - lado / 2} width={lado} height={lado} rx="2.5"
                fill="none" stroke={AMBAR} strokeWidth="2.4"
              />
            )}
            <rect x={22 + lado + 8} y={cy - 2.5} width={72 - i * 12} height="5" rx="2.5" fill="#5B6069" />
          </g>
        );
      })}
    </g>
  );
}

/** Campo de texto punteado, la forma del sticker de preguntas. */
function CajaPregunta() {
  const y0 = ZONA.y + 3;
  return (
    <g>
      <rect x="14" y={y0} width="132" height={ZONA.alto - 6} rx="10" fill={CARTA} fillOpacity="0.97" />
      <rect x="28" y={y0 + 12} width="104" height="7" rx="2" fill="#3A3F47" />
      <rect x="28" y={y0 + 24} width="76" height="7" rx="2" fill="#3A3F47" />
      <rect x="26" y={y0 + 40} width="108" height="18" rx="9" fill="none" stroke={AMBAR} strokeWidth="2.6" strokeDasharray="7 5" />
      <rect x="40" y={y0 + 46} width="46" height="6" rx="3" fill="#B6BCC5" />
    </g>
  );
}

/** Frase con el hueco subrayado en ámbar. */
function Hueco() {
  const y0 = ZONA.y + 10;
  return (
    <g>
      <rect x="14" y={y0} width="132" height={ZONA.alto - 20} rx="10" fill={CARTA} fillOpacity="0.96" />
      <rect x="28" y={y0 + 12} width="104" height="8" rx="3" fill="#3A3F47" />
      <rect x="28" y={y0 + 25} width="62" height="8" rx="3" fill="#3A3F47" />
      <rect x="44" y={y0 + 44} width="72" height="5" rx="2.5" fill={AMBAR} />
    </g>
  );
}

/** El dato grande sobre la barra: adivina la cifra. */
function Escala() {
  const y0 = ZONA.y + 7;
  return (
    <g>
      <rect x="14" y={y0} width="132" height={ZONA.alto - 14} rx="10" fill={CARTA} fillOpacity="0.96" />
      <text x="80" y={y0 + 34} textAnchor="middle" fontSize="26" fontWeight="800" fill={AMBAR}>73%</text>
      <rect x="30" y={y0 + 46} width="100" height="7" rx="3.5" fill="#E6E9ED" />
      <rect x="30" y={y0 + 46} width="68" height="7" rx="3.5" fill={AMBAR} />
      <circle cx="98" cy={y0 + 49.5} r="7" fill="#FFFFFF" stroke={AMBAR} strokeWidth="3" />
    </g>
  );
}

function Bloque({ formato }: { formato: FormatoPortada }) {
  switch (formato.bloque) {
    case "tarjeta_opciones":
      return <TarjetaOpciones n={formato.opciones} marcaCorrecta={formato.marcaCorrecta} />;
    case "duelo":
      return <Duelo etiquetas={formato.etiquetas} />;
    case "veredicto":
      return <Veredicto />;
    case "checklist":
      return <Checklist n={formato.opciones} ordenado={formato.ordenado} />;
    case "caja_pregunta":
      return <CajaPregunta />;
    case "hueco":
      return <Hueco />;
    case "escala":
      return <Escala />;
    default:
      return null;
  }
}

/** Portada 9:16 de un formato. */
export function PortadaFormato({
  formato,
  nombre,
  className = "",
}: {
  formato: FormatoPortada;
  nombre: string;
  className?: string;
}) {
  const id = `halo-${formato.bloque}-${formato.opciones}-${formato.ordenado ? "n" : "c"}`;
  return (
    <svg viewBox="0 0 160 284" className={className} role="img" aria-label={`Ejemplo de ${nombre}`}>
      <defs>
        <radialGradient id={id} cx="50%" cy="34%" r="62%">
          <stop offset="0%" stopColor={HALO} />
          <stop offset="100%" stopColor={FONDO} />
        </radialGradient>
      </defs>
      <rect width="160" height="284" rx="10" fill={`url(#${id})`} />
      {/* El foco del set, que es la firma visual de la marca. */}
      <ellipse cx="80" cy="90" rx="62" ry="44" fill={AMBAR} fillOpacity="0.10" />

      <Titular y={20} />
      <Webi x={58} y={56} escala={1.1} />
      <Bloque formato={formato} />

      {/* La invitación de abajo, insinuada. */}
      <rect x="42" y="238" width="76" height="7" rx="3.5" fill="#FFFFFF" fillOpacity="0.42" />
    </svg>
  );
}
