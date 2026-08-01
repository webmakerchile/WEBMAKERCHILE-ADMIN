import fitz
doc = fitz.open("attached_assets/Documento-Tecnico-Rosario-Vargas-Lifschitz-2026-08-01_1785598066757.pdf")
mm = 72/25.4
print(f"14mm = {14*mm:.1f}pt, 16mm = {16*mm:.1f}pt")
for i in [0, 2, 3]:
    page = doc[i]
    # dark background rect
    rects = [d["rect"] for d in page.get_drawings() if d.get("fill") and d["rect"].width > 400]
    bg = min(rects, key=lambda r: r.x0) if rects else None
    print(f"p{i}: bg rect x0={bg.x0:.1f} y0={bg.y0:.1f} x1={bg.x1:.1f} y1={bg.y1:.1f}" if bg else f"p{i}: no bg rect")
    d = page.get_text("dict")
    for block in d["blocks"]:
        if block["type"] != 0: continue
        for line in block["lines"]:
            txt = "".join(s["text"] for s in line["spans"])
            if any(k in txt for k in ["CÓMO", "FUERA", "MÓDULOS", "PÁGINA", "LÍMITES", "HITOS"]):
                print(f"  p{i} '{txt[:40]}' x0={line['bbox'][0]:.1f} y0={line['bbox'][1]:.1f} font={line['spans'][0]['font']} size={line['spans'][0]['size']:.1f}")
