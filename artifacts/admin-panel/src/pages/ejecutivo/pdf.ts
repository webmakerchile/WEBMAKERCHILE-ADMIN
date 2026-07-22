import { fmtCLP } from "./lib";
import type { WizData } from "./types";

/* ============================================================
   PDF DE COTIZACIÓN (jsPDF) — diseño WebMaker Latam
   ============================================================ */

export async function buildContractPdf(wiz: WizData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, ml = 14, mr = W - 14;
  const IVA = 0.19;

  const clrDark = () => doc.setTextColor(13, 23, 46);
  const clrOrange = () => doc.setTextColor(234, 88, 12);
  const clrWhite = () => doc.setTextColor(255, 255, 255);
  const clrDim = () => doc.setTextColor(120, 120, 120);
  const clrFaint = () => doc.setTextColor(200, 200, 200);

  const validMods = wiz.modules.filter(m => m.name.trim() !== "");

  function pageFooter(n: number, total: number) {
    doc.setFillColor(13, 23, 46);
    doc.rect(0, H - 18, W, 18, "F");
    clrWhite();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(`WEBMAKER LATAM · COTIZACIÓN · ${(wiz.client || "CLIENTE").toUpperCase()}`, ml, H - 9);
    clrFaint();
    doc.setFont("helvetica", "normal");
    doc.text(`${n} / ${total}`, mr, H - 9, { align: "right" });
  }

  // ===== COVER =====
  doc.setFillColor(13, 23, 46);
  doc.rect(0, 0, W, 78, "F");
  clrWhite();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Diseño y desarrollo de plataformas", ml, 11);
  doc.setFont("helvetica", "bold");
  doc.text("COTIZACIÓN COMERCIAL", mr, 11, { align: "right" });
  doc.setFont("helvetica", "normal");
  const monthYear = wiz.date
    ? new Date(wiz.date + "T12:00:00").toLocaleDateString("es-CL", { month: "long", year: "numeric" }).toUpperCase()
    : new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" }).toUpperCase();
  doc.text(monthYear, mr, 19, { align: "right" });
  doc.setDrawColor(234, 88, 12);
  doc.setLineWidth(0.4);
  doc.line(ml, 27, mr, 27);
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`COTIZACIÓN · ${(wiz.client || "CLIENTE").toUpperCase()}`, ml, 37);
  clrWhite();
  doc.setFontSize(17);
  const titleLines = doc.splitTextToSize((wiz.project || "Sin título").toUpperCase(), mr - ml - 5);
  doc.text(titleLines.slice(0, 3), ml, 49);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const scopeShort = doc.splitTextToSize(wiz.scope || "", mr - ml - 5);
  const titleBottom = 49 + Math.min(titleLines.length, 3) * 7;
  if (titleBottom < 74 && wiz.scope) doc.text(scopeShort.slice(0, 2), ml, Math.min(titleBottom + 3, 70));

  // Grid cards
  const gridY = 90;
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(ml, gridY, (mr - ml) / 2 - 4, 48, 2, 2, "F");
  doc.roundedRect(ml + (mr - ml) / 2 + 4, gridY, (mr - ml) / 2 - 4, 48, 2, 2, "F");
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("PREPARADO PARA", ml + 5, gridY + 8);
  doc.text("ALCANCE DE LA COTIZACIÓN", ml + (mr - ml) / 2 + 9, gridY + 8);
  clrDark();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(wiz.client || "—", ml + 5, gridY + 18);
  clrDim();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(wiz.advisor || "WebMaker Latam", ml + 5, gridY + 27);
  clrDark();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`${validMods.length} módulo${validMods.length !== 1 ? "s" : ""}`, ml + (mr - ml) / 2 + 9, gridY + 18);
  clrDim();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const alcLines = doc.splitTextToSize(validMods.map(m => m.name).join(", ") || wiz.scope.slice(0, 80) || "—", (mr - ml) / 2 - 18);
  doc.text(alcLines.slice(0, 3), ml + (mr - ml) / 2 + 9, gridY + 27);

  doc.setFillColor(13, 23, 46);
  doc.rect(0, H - 18, W, 18, "F");
  clrWhite();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("WEBMAKER LATAM · WEBMAKERLATAM.COM", ml, H - 9);
  clrFaint();
  doc.setFont("helvetica", "normal");
  doc.text("1 / 4", mr, H - 9, { align: "right" });
  clrDim();
  doc.text("agencia@webmakerlatam.com", mr, H - 15, { align: "right" });

  // ===== PAGE 2: QUÉ SE COTIZA =====
  doc.addPage();
  doc.setFillColor(13, 23, 46);
  doc.rect(0, 0, W, 14, "F");
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("01 · QUÉ SE COTIZA", ml, 10);
  clrFaint();
  doc.setFontSize(72);
  doc.text("01", mr + 2, 72, { align: "right" });
  clrDark();
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(wiz.project || "Proyecto", ml, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const scopeLines2 = doc.splitTextToSize(wiz.scope || "Descripción del servicio.", mr - ml - 5);
  doc.text(scopeLines2.slice(0, 7), ml, 37);
  let y2 = 37 + Math.min(scopeLines2.length, 7) * 4.5 + 10;
  validMods.forEach((m, i) => {
    if (y2 > H - 30) { doc.addPage(); y2 = 22; }
    doc.setFillColor(234, 88, 12);
    doc.circle(ml + 1.5, y2 - 1, 1.5, "F");
    clrDark();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${i + 1} · ${m.name}`, ml + 6, y2);
    y2 += 6;
    if (m.desc) {
      clrDim();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const dl = doc.splitTextToSize(m.desc, mr - ml - 10);
      doc.text(dl.slice(0, 2), ml + 6, y2);
      y2 += Math.min(dl.length, 2) * 4.5 + 3;
    } else { y2 += 2; }
  });
  pageFooter(2, 4);

  // ===== PAGE 3: INVERSIÓN =====
  doc.addPage();
  doc.setFillColor(13, 23, 46);
  doc.rect(0, 0, W, 14, "F");
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("02 · INVERSIÓN", ml, 10);
  clrFaint();
  doc.setFontSize(72);
  doc.text("02", mr + 2, 72, { align: "right" });
  clrDark();
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Inversión por módulo.", ml, 26);
  clrDim();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Valores en pesos chilenos (CLP), IVA incluido y desglosado:", ml, 33);

  let iy = 40;
  const priceMods = validMods.filter(m => m.price > 0);
  if (priceMods.length === 0) {
    clrDim(); doc.setFontSize(8.5);
    doc.text("Los valores se coordinarán según el alcance definido.", ml, iy + 8);
    iy += 20;
  } else {
    priceMods.forEach((m, i) => {
      if (iy > H - 60) { doc.addPage(); iy = 22; }
      const neto = m.price, iva = Math.round(neto * IVA), total = neto + iva;
      doc.setFillColor(255, 247, 237);
      doc.roundedRect(ml, iy, mr - ml, 30, 2, 2, "F");
      clrDark(); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(`${i + 1} · ${m.name}`, ml + 4, iy + 7);
      if (m.desc) {
        clrDim(); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
        doc.text(m.desc.slice(0, 90), ml + 4, iy + 13);
      }
      const c1 = ml + 4, c2 = ml + (mr - ml) / 3, c3 = ml + (mr - ml) * 2 / 3;
      clrOrange(); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
      doc.text("NETO", c1, iy + 20); doc.text("IVA 19%", c2, iy + 20); doc.text("TOTAL", c3, iy + 20);
      clrDark(); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(fmtCLP(neto), c1, iy + 27); doc.text(fmtCLP(iva), c2, iy + 27); doc.text(fmtCLP(total), c3, iy + 27);
      iy += 36;
    });
    if (iy > H - 50) { doc.addPage(); iy = 22; }
    const tNeto = priceMods.reduce((a, m) => a + m.price, 0), tIva = Math.round(tNeto * IVA), tTotal = tNeto + tIva;
    doc.setFillColor(13, 23, 46);
    doc.roundedRect(ml, iy, mr - ml, 30, 2, 2, "F");
    clrWhite(); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("TOTAL PROYECTO (IVA INCLUIDO)", ml + 4, iy + 7);
    const c1 = ml + 4, c2 = ml + (mr - ml) / 3, c3 = ml + (mr - ml) * 2 / 3;
    doc.setFontSize(6.5);
    doc.text("NETO", c1, iy + 16); doc.text("IVA 19%", c2, iy + 16); doc.text("TOTAL", c3, iy + 16);
    doc.setFontSize(10);
    doc.text(fmtCLP(tNeto), c1, iy + 25); doc.text(fmtCLP(tIva), c2, iy + 25); doc.text(fmtCLP(tTotal), c3, iy + 25);
  }
  pageFooter(3, 4);

  // ===== PAGE 4: PAGO =====
  doc.addPage();
  doc.setFillColor(13, 23, 46);
  doc.rect(0, 0, W, 14, "F");
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("03 · FORMA DE PAGO Y MENSUALIDAD", ml, 10);
  clrFaint();
  doc.setFontSize(72);
  doc.text("03", mr + 2, 72, { align: "right" });
  clrDark();
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Pago ${wiz.downPct}% / ${100 - wiz.downPct}%.`, ml, 26);
  clrDim();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Simple y directo, sin sorpresas:", ml, 33);

  const priceMods2 = validMods.filter(m => m.price > 0);
  const tNeto2 = priceMods2.reduce((a, m) => a + m.price, 0);
  const tTotal2 = tNeto2 + Math.round(tNeto2 * IVA);
  const initAmt = Math.round(tTotal2 * wiz.downPct / 100);
  const delivAmt = tTotal2 - initAmt;
  const bxY = 40, bxW = (mr - ml) / 2 - 5;

  doc.setFillColor(234, 88, 12);
  doc.roundedRect(ml, bxY, bxW, 44, 3, 3, "F");
  clrWhite(); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(`${wiz.downPct}%`, ml + bxW / 2, bxY + 18, { align: "center" });
  doc.setFontSize(8); doc.text("AL INICIAR", ml + bxW / 2, bxY + 27, { align: "center" });
  if (tTotal2 > 0) { doc.setFontSize(10); doc.text(fmtCLP(initAmt), ml + bxW / 2, bxY + 37, { align: "center" }); }

  doc.setFillColor(13, 23, 46);
  doc.roundedRect(mr - bxW, bxY, bxW, 44, 3, 3, "F");
  clrWhite(); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(`${100 - wiz.downPct}%`, mr - bxW / 2, bxY + 18, { align: "center" });
  doc.setFontSize(8); doc.text("A LA ENTREGA", mr - bxW / 2, bxY + 27, { align: "center" });
  if (tTotal2 > 0) { doc.setFontSize(10); doc.text(fmtCLP(delivAmt), mr - bxW / 2, bxY + 37, { align: "center" }); }

  let py4 = bxY + 54;
  if (wiz.monthly) {
    clrOrange(); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("MENSUALIDAD (OPCIONAL)", ml, py4 + 6); py4 += 12;
    if (wiz.monthlyPrice) {
      clrDark(); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(fmtCLP(Number(wiz.monthlyPrice)), ml, py4 + 6); py4 += 10;
    }
    clrDim(); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const ml2 = doc.splitTextToSize(wiz.monthly, mr - ml - 10);
    doc.text(ml2.slice(0, 3), ml, py4 + 6); py4 += Math.min(ml2.length, 3) * 4.5 + 8;
  }
  if (wiz.notes) {
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(ml, py4, mr - ml, 20, 2, 2, "F");
    clrDim(); doc.setFont("helvetica", "italic"); doc.setFontSize(7.5);
    const nl = doc.splitTextToSize(wiz.notes, mr - ml - 10);
    doc.text(nl.slice(0, 3), ml + 5, py4 + 8);
  }
  clrDim(); doc.setFont("helvetica", "italic"); doc.setFontSize(9);
  doc.text("Esta cotización queda abierta a los ajustes que definamos juntos.", W / 2, H - 38, { align: "center" });
  doc.text("Quedamos atentos para cuando quieras ponerla en marcha.", W / 2, H - 31, { align: "center" });
  pageFooter(4, 4);

  return doc.output("blob");
}
