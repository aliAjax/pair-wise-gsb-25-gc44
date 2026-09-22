// 领域模型：处方、加工单、版本链
// 数据结构与页面、判定规则解耦，本目录不依赖 React。

/** 眼别 */
export type EyeSide = "OD" | "OS";

/** 镜片类型：单光 / 渐进多焦点 */
export type LensKind = "single" | "progressive";

/** 处方加工状态 */
export type PrescriptionStatus =
  | "pending" // 待加工（参数可编辑，且占用该患者该眼别）
  | "frozen" // 已被加工单引用，参数冻结
  | "processed" // 已加工完成，只能修订
  | "superseded"; // 被修订处方替代（旧值保留）

/** 加工单状态 */
export type OrderStatus =
  | "queued" // 待开工（渐进片参数缺失时停留在此）
  | "in_progress" // 加工中
  | "done"; // 已完成核验

/** 单只眼的屈光四要素 + 渐进片附加参数 */
export interface LensParams {
  /** 球镜 S（D），如 -2.75 */
  sphere: number | null;
  /** 柱镜 C（D），0 或缺省表示无散光 */
  cylinder: number | null;
  /** 轴位（度，0~180），有柱镜时必填 */
  axis: number | null;
  /** 瞳距 PD（mm，50~80 之外需复核） */
  pd: number | null;
  /** 下加光 ADD（D），渐进片必填 */
  add: number | null;
  /** 瞳高 H（mm），渐进片必填 */
  segHeight: number | null;
}

export interface Prescription {
  id: string;
  patientId: string;
  eye: EyeSide;
  lensKind: LensKind;
  params: LensParams;
  status: PrescriptionStatus;
  /** 瞳距越界等场景下的复核标记 */
  reviewRequired: boolean;
  /** 修订原因：仅修订处方上有值 */
  reviseReason?: string;
  /** 版本链：rootId 指向家族首张处方，prevId 指向上一版本 */
  rootId: string;
  prevId: string | null;
  version: number;
  /** 引用该处方的加工单 */
  orderId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkOrder {
  id: string;
  prescriptionId: string;
  patientId: string;
  eye: EyeSide;
  lensKind: LensKind;
  /** 引用时冻结的参数快照，后续处方变化不影响加工 */
  frozenParams: LensParams;
  status: OrderStatus;
  /** 核验备注 */
  checkNote: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/** 录入草稿（与 LensParams 一致，但允许空串表达“未填”） */
export type PrescriptionDraft = {
  patientId: string;
  eye: EyeSide;
  lensKind: LensKind;
  reviseReason?: string;
} & {
  [K in keyof LensParams]: string;
};

export type FormField = keyof LensParams | "patientId" | "reviseReason";

export interface FieldIssue {
  field: FormField;
  message: string;
}

/** 规则判定结果：issues 为阻断性错误，warnings 为需复核提醒 */
export interface ValidationResult {
  issues: FieldIssue[];
  warnings: FieldIssue[];
  /** 渐进片加工前缺少的附加参数 */
  missingProgressive: (keyof LensParams)[];
  /** 是否允许下达处方 */
  canIssue: boolean;
  /** 是否允许开工 */
  canStart: boolean;
}

export interface AppState {
  prescriptions: Prescription[];
  orders: WorkOrder[];
}

export const EMPTY_PARAMS: LensParams = {
  sphere: null,
  cylinder: null,
  axis: null,
  pd: null,
  add: null,
  segHeight: null,
};

/** 占用判定：同一患者同眼别只能有一张待加工处方 */
export function occupationKey(patientId: string, eye: EyeSide): string {
  return `${patientId.trim()}::${eye}`;
}
