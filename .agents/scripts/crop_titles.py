import fitz
doc = fitz.open("attached_assets/Documento-Tecnico-Rosario-Vargas-Lifschitz-2026-08-01_1785598066757.pdf")
# zoom into left edge of the section titles on pages 2 and 3
for i, y0, y1 in [(2, 40, 110), (3, 40, 110), (0, 130, 210)]:
    page = doc[i]
    pix = page.get_pixmap(matrix=fitz.Matrix(4, 4), clip=fitz.Rect(30, y0, 300, y1))
    pix.save(f".agents/outputs/crop_p{i}.png")
print("ok")
