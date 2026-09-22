// 展示层格式化辅助：不承载任何判定规则。
import type { Prescription } from "../domain/types";

/** 屈光度数格式化：+/- 前缀，两位小数，单位 D */
export function formatD(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}D`;
}

export function formatAxis(value: number | null): string {
  if (value === null) return "—";
  return `${value}°`;
}

export function formatPD(value: number): string {
  return `${value}mm`;
}

/** 一行概括处方屈光参数 */
export function formatPowerLine(rx: {
  sphere: number;
  cylinder: number;
  axis: number | null;
  pd: number;
  lensKind: Prescription["lensKind"];
  add: number | null;
  ph: number | null;
}): string {
  const parts = [
    `S ${formatD(rx.sphere)}`,
    `C ${formatD(rx.cylinder)}`,
    `A ${formatAxis(rx.axis)}`,
    `PD ${formatPD(rx.pd)}`,
  ];
  if (rx.lensKind === "progressive") {
    parts.push(`ADD ${formatD(rx.add)}`);
    parts.push(`PH ${rx.ph === null ? "待补" : `${rx.ph}mm`}`);
  }
  return parts.join(" · ");
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
