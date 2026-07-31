// La aritmética de la caja. Un error aquí no revienta: entrega un saldo
// convincente con el número cambiado, y de estos números se cobra.

import { describe, it, expect } from "vitest";
import {
  CUENTA_COBRO,
  MAX_MONTO_PAGO,
  estadoPagoDe,
  sumaPagos,
  textoTransferencia,
  totalConIva,
} from "./cobros";

describe("totalConIva", () => {
  it("suma el 19% con UN redondeo (la convención de contractNet)", () => {
    expect(totalConIva(1_000_000)).toBe(1_190_000);
    expect(totalConIva(100)).toBe(119);
    // 105 × 0.19 = 19.95 → 20: se redondea el IVA total, no módulo a módulo.
    expect(totalConIva(105)).toBe(125);
  });

  it("sin neto no hay total (cero, negativo o basura)", () => {
    expect(totalConIva(0)).toBe(0);
    expect(totalConIva(-500)).toBe(0);
    expect(totalConIva(Number.NaN)).toBe(0);
  });
});

describe("estadoPagoDe", () => {
  it("pendiente → parcial → pagado según los abonos", () => {
    expect(estadoPagoDe(1_190_000, 0)).toBe("pendiente");
    expect(estadoPagoDe(1_190_000, 1)).toBe("parcial");
    expect(estadoPagoDe(1_190_000, 1_189_999)).toBe("parcial");
    expect(estadoPagoDe(1_190_000, 1_190_000)).toBe("pagado");
    expect(estadoPagoDe(1_190_000, 2_000_000)).toBe("pagado");
  });

  it("sin total conocido NUNCA declara pagado: lo más que afirma es que hay abonos", () => {
    expect(estadoPagoDe(0, 0)).toBe("pendiente");
    expect(estadoPagoDe(0, 500_000)).toBe("parcial");
    expect(estadoPagoDe(Number.NaN, 500_000)).toBe("parcial");
  });
});

describe("sumaPagos", () => {
  it("suma montos válidos e ignora la basura sin reventar", () => {
    expect(sumaPagos([
      { monto: 100_000 },
      { monto: "no es plata" },
      { monto: -5_000 },
      { monto: 200_000 },
    ])).toBe(300_000);
    expect(sumaPagos([])).toBe(0);
  });
});

describe("la cuenta de cobro", () => {
  it("los datos fijos van completos y el RUT crudo coincide con el formateado", () => {
    expect(CUENTA_COBRO.numero).toBe("1041474795");
    expect(CUENTA_COBRO.rut).toBe("780429682");
    expect(CUENTA_COBRO.rutFormateado.replace(/[.\-]/g, "")).toBe(CUENTA_COBRO.rut);
  });

  it("el texto para pegar en una transferencia lleva banco, cuenta y RUT", () => {
    const t = textoTransferencia();
    expect(t).toContain("Mercado Pago");
    expect(t).toContain("1041474795");
    expect(t).toContain("78.042.968-2");
  });

  it("el tope de un pago cabe en integer de Postgres", () => {
    expect(MAX_MONTO_PAGO).toBeLessThanOrEqual(2_147_483_647);
  });
});
