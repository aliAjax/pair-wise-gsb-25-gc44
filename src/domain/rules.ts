// 判定规则：全部为纯函数，输入数据输出结论，不依赖 React/DOM。
import {
  EYE_SIDE_LABEL,
  STATUS_LABEL,
  type AppState,
  type EyeSide,
  type Prescription,
  type PrescriptionStatus,
} from "./types";

export const AXIS_MIN = 0;
export const AXIS_MAX = 180;
export const PD_MIN = 50;
export const PD_MAX = 80;
export const POWER_STEP = 0.25;

/** 占用同患者同眼别“待加工名额”的状态：
 *  待加工、待复核、加工中、已加工均占名额，确保同眼别始终只有一张在制处方。 */
const OCCUPYING_STATUSES: ReadonlySet<PrescriptionStatus> = new Set([
  "pending",
  "review",
  "processing",
  "processed",
]);

export interface RuleIssue {
  field:
    | "patientId"
    | "patientName"
    | "sphere"
    | "cylinder"
    | "axis"
    | "pd"
    | "add"
    | "ph"
    | "revisionReason";
  message: string;
  /** block 阻断下达/开工；warn 仅提示复核 */
  level: "block" | "warn";
}

export interface PrescriptionDraft {
  patientId: string;
  patientName: string;
  eye: EyeSide;
  sphere: number;
  cylinder: number;
  axis: number | null;
  pd: number;
  lensKind: Prescription["lensKind"];
  add: number | null;
  ph: number | null;
  note: string;
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/** 屈光度步进校验：必须为 0.25 的整数倍 */
export function isOnPowerStep(value: number): boolean {
  const steps = Math.round(value / POWER_STEP);
  return Math.abs(steps * POWER_STEP - value) < 1e-6;
}

export function hasAstigmatism(cylinder: number): boolean {
  return Math.abs(cylinder) > 1e-9;
}

export function isPOutOfRange(pd: number): boolean {
  return !isFiniteNumber(pd) || pd < PD_MIN || pd > PD_MAX;
}

/** 处方字段级规则：
 *  1) 有柱镜必须填轴位，轴位 0~180；无柱镜轴位应为空
 *  2) 瞳距超 50~80mm 必须待复核（warn，不阻断下达）
 *  3) 渐进片须补加光与瞳高，缺失阻断开工 */
export function validateDraft(draft: PrescriptionDraft): RuleIssue[] {
  const issues: RuleIssue[] = [];

  if (!draft.patientId.trim()) {
    issues.push({ field: "patientId", message: "必须填写患者编号", level: "block" });
  }
  if (!draft.patientName.trim()) {
    issues.push({ field: "patientName", message: "必须填写患者姓名", level: "block" });
  }

  if (!isFiniteNumber(draft.sphere) || !isOnPowerStep(draft.sphere)) {
    issues.push({
      field: "sphere",
      message: `球镜须为 ${POWER_STEP} 的整数倍`,
      level: "block",
    });
  }

  if (!isFiniteNumber(draft.cylinder) || !isOnPowerStep(draft.cylinder)) {
    issues.push({
      field: "cylinder",
      message: `柱镜须为 ${POWER_STEP} 的整数倍（无散光填 0）`,
      level: "block",
    });
  } else if (hasAstigmatism(draft.cylinder)) {
    if (!isFiniteNumber(draft.axis)) {
      issues.push({
        field: "axis",
        message: "有柱镜必须填写轴位",
        level: "block",
      });
    } else if (draft.axis < AXIS_MIN || draft.axis > AXIS_MAX) {
      issues.push({
        field: "axis",
        message: `轴位限 ${AXIS_MIN}~${AXIS_MAX} 度`,
        level: "block",
      });
    }
  }

  if (!isFiniteNumber(draft.pd)) {
    issues.push({ field: "pd", message: "必须填写瞳距", level: "block" });
  } else if (isPOutOfRange(draft.pd)) {
    issues.push({
      field: "pd",
      message: `瞳距 ${draft.pd}mm 超出 ${PD_MIN}~${PD_MAX}mm，必须待复核`,
      level: "warn",
    });
  }

  if (draft.lensKind === "progressive") {
    if (!isFiniteNumber(draft.add)) {
      issues.push({ field: "add", message: "渐进片必须补加光 ADD", level: "block" });
    } else if (!isOnPowerStep(draft.add) || draft.add <= 0) {
      issues.push({
        field: "add",
        message: "加光须为大于 0 的 0.25 整倍数",
        level: "block",
      });
    }
    if (!isFiniteNumber(draft.ph)) {
      issues.push({ field: "ph", message: "渐进片必须补瞳高 PH", level: "block" });
    } else if (draft.ph <= 0) {
      issues.push({ field: "ph", message: "瞳高须大于 0", level: "block" });
    }
  }

  return issues;
}

export function blockingIssues(issues: RuleIssue[]): RuleIssue[] {
  return issues.filter((issue) => issue.level === "block");
}

/** 下达/修订阶段的阻断项：球柱镜、轴位等必须齐全；
 *  渐进片加光/瞳高允许“先下达、开工前补录”，故不在此拦截，
 *  仅由 canStartJob 执行“缺失不得开工”。 */
export function issueBlockingIssues(issues: RuleIssue[]): RuleIssue[] {
  return issues.filter(
    (issue) => issue.level === "block" && issue.field !== "add" && issue.field !== "ph"
  );
}

/** 同患者同眼别是否已有占用名额的处方（草稿除外） */
export function findOccupant(
  state: AppState,
  patientId: string,
  eye: EyeSide,
  excludeId?: string
): Prescription | undefined {
  return state.prescriptions.find(
    (p) =>
      p.patientId === patientId.trim() &&
      p.eye === eye &&
      OCCUPYING_STATUSES.has(p.status) &&
      p.id !== excludeId
  );
}

/** 开工前置：处方可被加工单引用的条件
 *  - 状态为待加工（待复核/加工中/已加工均不可直接开工）
 *  - 无阻断性字段问题（渐进片加光、瞳高不得缺失） */
export function canStartJob(
  prescription: Prescription
): { ok: boolean; reason?: string } {
  if (prescription.status === "review") {
    return { ok: false, reason: "瞳距异常待复核，复核通过后方可开工" };
  }
  if (prescription.status !== "pending") {
    return { ok: false, reason: "仅待加工处方可以开工" };
  }
  const issues = blockingIssues(validateDraft(prescription));
  if (issues.length > 0) {
    return { ok: false, reason: issues.map((i) => i.message).join("；") };
  }
  return { ok: true };
}

/** 已加工处方是否允许修订：仅 processed 可修订，且必须填写原因 */
export function canRevise(
  prescription: Prescription,
  reason: string
): { ok: boolean; reason?: string } {
  if (prescription.status !== "processed") {
    return { ok: false, reason: "只有已加工处方可以新建修订" };
  }
  if (!reason.trim()) {
    return { ok: false, reason: "修订必须填写原因" };
  }
  return { ok: true };
}

/** 待复核处方复核确认：仅瞳距超限的 review 处方，复核后转为待加工 */
export function canApproveReview(prescription: Prescription) {
  if (prescription.status !== "review") {
    return { ok: false, reason: "仅待复核处方可以复核确认" };
  }
  const issues = blockingIssues(validateDraft(prescription));
  if (issues.length > 0) {
    return { ok: false, reason: issues.map((i) => i.message).join("；") };
  }
  return { ok: true };
}

/** 版本链：返回同一 rootId 的全部版本，按 version 升序 */
export function versionChain(state: AppState, rootId: string): Prescription[] {
  return state.prescriptions
    .filter((p) => p.rootId === rootId)
    .sort((a, b) => a.version - b.version);
}

const SNAPSHOT_FIELDS = [
  "sphere",
  "cylinder",
  "axis",
  "pd",
  "lensKind",
  "add",
  "ph",
] as const;

/** 加工单引用后参数冻结：当前处方与加工单快照的屈光参数必须完全一致 */
export function isSnapshotFrozen(
  prescription: Prescription,
  job: AppState["jobs"][number]
): boolean {
  if (prescription.id !== job.snapshot.id) return false;
  return SNAPSHOT_FIELDS.every(
    (field) =>
      JSON.stringify(prescription[field]) === JSON.stringify(job.snapshot[field])
  );
}

/** 刷新/加载后一致性核验：处方、占用、加工单、版本链之间的不变量。
 *  返回问题描述列表，空数组表示完全一致。 */
export function checkConsistency(state: AppState): string[] {
  const problems: string[] = [];
  const byId = new Map(state.prescriptions.map((p) => [p.id, p]));

  // 1. 同一患者同眼别至多一张占用名额的处方
  const occupied = new Map<string, Prescription>();
  for (const p of state.prescriptions) {
    if (!OCCUPYING_STATUSES.has(p.status)) continue;
    const key = `${p.patientId}|${p.eye}`;
    const prev = occupied.get(key);
    if (prev) {
      problems.push(
        `${p.patientId} ${EYE_SIDE_LABEL[p.eye]} 同时存在两张占用处方：${prev.id} 与 ${p.id}`
      );
    } else {
      occupied.set(key, p);
    }
  }

  // 2. 处方与加工单互相引用、状态对应、快照参数冻结
  for (const p of state.prescriptions) {
    if ((p.status === "processing" || p.status === "processed") && !p.jobId) {
      problems.push(`处方 ${p.id} 状态为${STATUS_LABEL[p.status]}但缺少加工单引用`);
    }
    if (p.status === "review" && !isPOutOfRange(p.pd)) {
      problems.push(`处方 ${p.id} 标记待复核但瞳距 ${p.pd}mm 在 50~80mm 正常区间`);
    }
    if (p.status === "pending" && isPOutOfRange(p.pd)) {
      problems.push(`处方 ${p.id} 瞳距 ${p.pd}mm 超限却处于待加工，应待复核`);
    }
    // 待加工/待复核允许渐进片暂缺加光瞳高（开工前补录）；
    // 一旦进入加工，开工闸门 canStartJob 已保证参数齐全。
    const blocks =
      p.status === "processing" || p.status === "processed"
        ? blockingIssues(validateDraft(p))
        : p.status === "pending" || p.status === "review"
          ? issueBlockingIssues(validateDraft(p))
          : [];
    if (blocks.length > 0) {
      problems.push(`处方 ${p.id} 存在阻断性缺陷：${blocks.map((b) => b.message).join("；")}`);
    }
  }

  for (const job of state.jobs) {
    const rx = byId.get(job.snapshot.id);
    if (!rx) {
      problems.push(`加工单 ${job.id} 引用的处方 ${job.snapshot.id} 已丢失`);
      continue;
    }
    if (rx.jobId !== job.id) {
      problems.push(`加工单 ${job.id} 与处方 ${rx.id} 的引用关系断裂`);
    }
    for (const field of SNAPSHOT_FIELDS) {
      if (JSON.stringify(rx[field]) !== JSON.stringify(job.snapshot[field])) {
        problems.push(
          `加工单 ${job.id} 冻结快照的${field}与处方 ${rx.id} 不一致（参数被改动）`
        );
      }
    }
    if (job.status === "queued" && rx.status !== "processing") {
      problems.push(`加工单 ${job.id} 在制但处方 ${rx.id} 不是加工中状态`);
    }
    // 已完工处方保持已加工；若之后被修订则转为已修订（旧值仍由快照保存），两者皆合法
    if (job.status === "done" && rx.status !== "processed" && rx.status !== "superseded") {
      problems.push(`加工单 ${job.id} 已完成但处方 ${rx.id} 状态异常（应为已加工或已修订）`);
    }
    if (job.status === "queued" && job.finishedAt !== null) {
      problems.push(`加工单 ${job.id} 在制却带有完成时间`);
    }
    if (job.status === "done" && job.finishedAt === null) {
      problems.push(`加工单 ${job.id} 已完成但缺少完成时间`);
    }
  }

  // 3. 版本链：supersedes 关系闭合，版本号连续递增
  for (const p of state.prescriptions) {
    if (p.supersedesId) {
      const parent = byId.get(p.supersedesId);
      if (!parent) {
        problems.push(`处方 ${p.id} 的上一版本 ${p.supersedesId} 缺失，版本链断裂`);
      } else {
        if (parent.rootId !== p.rootId) {
          problems.push(`处方 ${p.id} 与上一版本 ${parent.id} 不属于同一版本链`);
        }
        if (parent.status !== "superseded") {
          problems.push(`处方 ${parent.id} 已被修订但状态不是“已修订”`);
        }
        if (p.version !== parent.version + 1) {
          problems.push(
            `版本链 ${p.rootId} 版本号不连续：v${parent.version} → v${p.version}`
          );
        }
        if (!p.revisionReason?.trim()) {
          problems.push(`处方 ${p.id} 是修订版本但缺少修订原因`);
        }
      }
    }
  }

  return problems;
}
