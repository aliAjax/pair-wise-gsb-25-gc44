// 眼视光处方与加工领域类型：只描述数据，不含任何界面逻辑。

export type EyeSide = "OD" | "OS";

export const EYE_SIDE_LABEL: Record<EyeSide, string> = {
  OD: "右眼",
  OS: "左眼",
};

/** 镜片品类：单光 / 渐进多焦点 */
export type LensKind = "single" | "progressive";

export const LENS_KIND_LABEL: Record<LensKind, string> = {
  single: "单光片",
  progressive: "渐进片",
};

/** 处方生命周期状态 */
export type PrescriptionStatus =
  | "pending" // 待加工（有效占用：同患者同眼别唯一）
  | "review" // 待复核（瞳距异常，等待复核确认，仍占用名额）
  | "processing" // 已被加工单引用，参数冻结
  | "processed" // 加工完成，只读，只能带原因修订
  | "superseded"; // 被修订处方替代，归档保留

export const STATUS_LABEL: Record<PrescriptionStatus, string> = {
  pending: "待加工",
  review: "待复核",
  processing: "加工中",
  processed: "已加工",
  superseded: "已修订",
};

/** 一张处方的完整参数（加工单引用后整体冻结，不允许原地修改） */
export interface Prescription {
  id: string;
  /** 版本链：同一张处方历次修订共享同一 rootId，按 version 递增 */
  rootId: string;
  version: number;
  patientId: string;
  patientName: string;
  eye: EyeSide;
  /** 球镜 S，单位 D，步进 0.25 */
  sphere: number;
  /** 柱镜 C，单位 D，0 表示无散光 */
  cylinder: number;
  /** 轴位，0~180 度；仅在柱镜非 0 时必填 */
  axis: number | null;
  /** 瞳距 PD，单位 mm，正常区间 50~80 */
  pd: number;
  lensKind: LensKind;
  /** 下加光 ADD，单位 D，仅渐进片必填 */
  add: number | null;
  /** 瞳高 PH，单位 mm，仅渐进片必填 */
  ph: number | null;
  status: PrescriptionStatus;
  note: string;
  createdAt: string;
  /** 被哪张加工单引用（冻结来源） */
  jobId: string | null;
  /** 修订原因：修订版本必须填写 */
  revisionReason: string | null;
  /** 上一版本处方 id，串起版本链 */
  supersedesId: string | null;
}

export type JobStatus = "queued" | "done";

export interface ProcessingJob {
  id: string;
  patientId: string;
  patientName: string;
  eye: EyeSide;
  /** 引用时刻冻结下来的处方快照 */
  snapshot: Prescription;
  status: JobStatus;
  createdAt: string;
  finishedAt: string | null;
}

export interface AppState {
  prescriptions: Prescription[];
  jobs: ProcessingJob[];
}
