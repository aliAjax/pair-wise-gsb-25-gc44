// 判定规则（纯函数，无 React、无副作用）
// - 有柱镜必须填轴位，轴位限 0~180 度
// - 瞳距超出 50~80mm 必须待复核
// - 渐进片开工前必须有下加光与瞳高
// - 同一患者同眼别只能有一张待加工处方
// - 已加工处方只能带原因修订

import {
  AppState,
  EMPTY_PARAMS,
  EyeSide,
  FieldIssue,
  LensKind,
  LensParams,
  Prescription,
  PrescriptionDraft,
  occupationKey,
} from "./types";

export const AXIS_MIN = 0;
export const AXIS_MAX = 180;
export const PD_MIN = 50;
export const PD_MAX = 80;

/** 镜片行业常规步长：球镜/柱镜/下加光 0.25D 一档 */
export const DIOPTER_STEP = 0.25;

  function issue(field: keyof LensParams, message: string): FieldIssue {
  return { field, message };
}

export function hasCylinder(p: LensParams): boolean {
  return p.cylinder !== null && Math.abs(p.cylinder) > 1e-9;
}

export function axisInRange(axis: number | null): boolean {
  return axis !== null && axis >= AXIS_MIN && axis <= AXIS_MAX;
}

export function pdInRange(pd: number | null): boolean {
  return pd !== null && pd >= PD_MIN && pd <= PD_MAX;
}

export function isProgressive(kind: LensKind): boolean {
  return kind === "progressive";
}

/** 校验一组镜片参数。mode=issue 用于处方下达；mode=start 追加开工校验。 */
export function validateParams(
  params: LensParams,
  lensKind: LensKind,
  mode: "issue" | "start"
): {
  issues: FieldIssue[];
  warnings: FieldIssue[];
  missingProgressive: (keyof LensParams)[];
} {
  const issues: FieldIssue[] = [];
  const warnings: FieldIssue[] = [];
  const missingProgressive: (keyof LensParams)[] = [];

  if (params.sphere === null) {
    issues.push(issue("sphere", "球镜必填，单位 D"));
  }

  if (params.cylinder === null) {
    issues.push(issue("cylinder", "柱镜必填，无散光请填 0"));
  }

  // 有柱镜必须填轴位，轴位限 0~180
  if (hasCylinder(params)) {
    if (params.axis === null) {
      issues.push(issue("axis", "有柱镜时必须填写轴位"));
    } else if (!axisInRange(params.axis)) {
      issues.push(issue("axis", `轴位限 ${AXIS_MIN}~${AXIS_MAX} 度`));
    }
  } else if (params.axis !== null && !axisInRange(params.axis)) {
    warnings.push(issue("axis", `轴位超出 ${AXIS_MIN}~${AXIS_MAX} 度，将被忽略`));
  }

  if (params.pd === null) {
    issues.push(issue("pd", "瞳距必填，单位 mm"));
  } else if (!pdInRange(params.pd)) {
    // 越界不是录入错误，但必须待复核
    warnings.push(issue("pd", `瞳距 ${params.pd}mm 超出 ${PD_MIN}~${PD_MAX}mm，处方须待复核`));
  }

  if (isProgressive(lensKind)) {
    if (params.add === null || params.add <= 0) {
      missingProgressive.push("add");
      if (mode === "start") issues.push(issue("add", "渐进片开工前必须补下加光 ADD"));
    }
    if (params.segHeight === null || params.segHeight <= 0) {
      missingProgressive.push("segHeight");
      if (mode === "start") issues.push(issue("segHeight", "渐进片开工前必须补瞳高"));
    }
  }

  return { issues, warnings, missingProgressive };
}

/** 处方表单草稿 → 参数对象，空串归一为 null */
export function draftToParams(draft: PrescriptionDraft): LensParams {
  const num = (raw: string): number | null => {
    const t = raw.trim();
    if (t === "") return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  };
  return {
    sphere: num(draft.sphere),
    cylinder: num(draft.cylinder),
    axis: num(draft.axis),
    pd: num(draft.pd),
    add: num(draft.add),
    segHeight: num(draft.segHeight),
  };
}

/** 处方下达综合判定（含占用冲突）。revisingId 仅用于占用判定时排除自身。 */
export function evaluateIssue(
  state: AppState,
  draft: PrescriptionDraft,
  options: { revisingId?: string } = {}
): {
  params: LensParams;
  issues: FieldIssue[];
  warnings: FieldIssue[];
  occupiedBy?: Prescription;
  canIssue: boolean;
} {
  const params = draftToParams(draft);
  const { issues, warnings } = validateParams(params, draft.lensKind, "issue");

  const patientId = draft.patientId.trim();
  if (!patientId) {
    issues.unshift({ field: "patientId", message: "患者编号必填" });
  }

  // 同一患者同眼别只能有一张待加工处方（修订自身不冲突）
  const occupiedBy = state.prescriptions.find(
    (rx) =>
      rx.status === "pending" &&
      occupationKey(rx.patientId, rx.eye) === occupationKey(patientId, draft.eye) &&
      rx.id !== options.revisingId
  );
  if (occupiedBy) {
    issues.push({
      field: "patientId",
      message: `该患者${draft.eye === "OD" ? "右" : "左"}眼已有待加工处方 ${occupiedBy.id}，不能重复下达`,
    });
  }

  return {
    params,
    issues,
    warnings,
    occupiedBy,
    canIssue: issues.length === 0 && patientId.length > 0,
  };
}

/** 加工开工判定：冻结参数齐全且渐进片附加项不缺 */
export function evaluateStart(order: { frozenParams: LensParams; lensKind: LensKind }) {
  const { issues, missingProgressive } = validateParams(
    order.frozenParams,
    order.lensKind,
    "start"
  );
  return { issues, missingProgressive, canStart: issues.length === 0 };
}

/** 处方是否仍被未完成的加工单占用 */
export function orderBlocksRevision(state: AppState, prescriptionId: string): boolean {
  return state.orders.some(
    (o) => o.prescriptionId === prescriptionId && o.status !== "done"
  );
}

/** 派生：当前所有待加工占用（患者::眼别 → 处方） */
export function selectOccupations(
  state: AppState
): Map<string, Prescription> {
  const map = new Map<string, Prescription>();
  for (const rx of state.prescriptions) {
    if (rx.status === "pending") map.set(occupationKey(rx.patientId, rx.eye), rx);
  }
  return map;
}

/** 派生：某处方的版本链（根 → 最新） */
export function selectVersionChain(
  state: AppState,
  rootId: string
): Prescription[] {
  return state.prescriptions
    .filter((rx) => rx.rootId === rootId)
    .sort((a, b) => a.version - b.version);
}

export function blankDraft(patientId = "", eye: EyeSide = "OD"): PrescriptionDraft {
  return {
    patientId,
    eye,
    lensKind: "single",
    reviseReason: "",
    ...Object.fromEntries(
      Object.keys(EMPTY_PARAMS).map((k) => [k, ""])
    ) as Record<keyof LensParams, string>,
  };
}
