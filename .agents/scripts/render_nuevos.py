import fitz
for name in ["tecnico-rosario", "tecnico-estres", "cliente-rosario"]:
    doc = fitz.open(f"/tmp/{name}.pdf")
    print(f"{name}: {doc.page_count} paginas")
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
        pix.save(f".agents/outputs/{name}_p{i}.png")
