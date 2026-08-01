import fitz, sys
doc = fitz.open("attached_assets/Documento-Tecnico-Rosario-Vargas-Lifschitz-2026-08-01_1785598066757.pdf")
print("pages:", doc.page_count)
for i, page in enumerate(doc):
    r = page.rect
    print(f"page {i}: {r.width:.1f} x {r.height:.1f} pt = {r.width/72:.2f} x {r.height/72:.2f} in")
    if i < 4:
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
        pix.save(f".agents/outputs/tecnico_p{i}.png")
