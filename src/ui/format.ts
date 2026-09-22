// 展示用格式化辅助（纯文本转换，不含规则判定）

import { EyeSide, LensKind, LensParams, OrderStatus, PrescriptionStatus } from "../domain/types";

export const eyeLabel = (eye: EyeSide) => (eye === "OD" ? "右眼 OD" : "左眼 OS");
export const eyeShort = (eye: EyeSide) => (eye === "OD" ? "右" : "左");
export const kindLabel = (kind: LensKind) => (kind === "progressive" ? "渐进多焦点" : "单光");

export const rxStatusMeta: Record<PrescriptionStatus, { text: string; cls: string }> = {
  pending: { text: "待加工", cls: "st-pending" },
  frozen: { text: "已冻结", cls: "st-frozen" },
  processed: { text: "已加工", cls: "st-done" },
  superseded: { text: "已修订", cls: "st-old" },
};

export const orderStatusMeta: Record<OrderStatus, { text: string; cls: string }> = {
  queued: { text: "排队中", cls: "st-pending" },
  in_progress: { text: "加工中", cls: "st-frozen" },
  done: { text: "已完成", cls: "st-done" },
};

export function fmtD(v: number | null, suffix = ""): string {
  if (v === null) return "—";
  const s = v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  return `${s}${suffix}`;
}

export function fmtNum(v: number | null, suffix = ""): string {
  return v === null ? "—" : `${v}${suffix}`;
}

/** 验光单习惯写法：-2.75DS / -0.50DC x 180 */
export function formatRxLine(p: LensParams): string {
  const parts = [`S ${fmtD(p.sphere, "D")}`];
  if (p.cylinder !== null && Math.abs(p.cylinder) > 1e-9) {
    parts.push(`C ${fmtD(p.cylinder, "D")}`);
    parts.push(`x ${p.axis ?? "?"}°`);
  }
  parts.push(`PD ${fmtNum(p.pd, "mm")}`);
  return parts.join(" ");
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
