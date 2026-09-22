import { seedState } from "./seed";
import type {
  AppState,
  Prescription,
  ProcessingJob,
} from "./types";
import {
  canApproveReview,
  canRevise,
  canStartJob,
  findOccupant,
  isPOutOfRange,
  issueBlockingIssues,
  validateDraft,
  type PrescriptionDraft,
} from "./rules";

const STORAGE_KEY = "hxwl-11-rx-desk-v1";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.prescriptions) && Array.isArray(parsed.jobs)) {
        return parsed;
      }
    }
  } catch {
    // 存储不可用时退回内置示例数据
  }
  return clone(seedState);
}

/**
 * 处方下达与加工状态机：处方 / 占用 / 加工单 / 版本链始终在同一状态里联动变更，
 * 任何动作都返回不可变的新状态，刷新页面后从 localStorage 还原。
 */
export class RxStore {
  private state: AppState;
  private listeners = new Set<() => void>();

  constructor(initial?: AppState) {
    this.state = initial ?? loadState();
  }

  getState = (): AppState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: AppState) {
    this.state = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 忽略持久化失败，内存状态仍然有效
    }
    this.listeners.forEach((listener) => listener());
  }

  resetDemo() {
    this.commit(clone(seedState));
  }

  /** 下达新处方：校验字段与同眼别占用；瞳距超限自动进入待复核 */
  issue(draft: PrescriptionDraft): ActionResult {
    const trimmed: PrescriptionDraft = {
      ...draft,
      patientId: draft.patientId.trim(),
      patientName: draft.patientName.trim(),
    };

    const blocks = issueBlockingIssues(validateDraft(trimmed));
    if (blocks.length > 0) {
      return { ok: false, message: blocks.map((b) => b.message).join("；") };
    }

    const occupant = findOccupant(this.state, trimmed.patientId, trimmed.eye);
    if (occupant) {
      return {
        ok: false,
        message: `该患者${trimmed.eye === "OD" ? "右" : "左"}眼已有${
          occupant.status === "review" ? "待复核" : "在制"
        }处方 ${occupant.id}，不能重复下达`,
      };
    }

    const now = new Date().toISOString();
    const id = nextId("rx");
    const prescription: Prescription = {
      id,
      rootId: `root-${trimmed.patientId}-${trimmed.eye}-${id}`,
      version: 1,
      patientId: trimmed.patientId,
      patientName: trimmed.patientName,
      eye: trimmed.eye,
      sphere: trimmed.sphere,
      cylinder: trimmed.cylinder,
      axis: trimmed.cylinder === 0 ? null : trimmed.axis,
      pd: trimmed.pd,
      lensKind: trimmed.lensKind,
      add: trimmed.lensKind === "progressive" ? trimmed.add : null,
      ph: trimmed.lensKind === "progressive" ? trimmed.ph : null,
      status: isPOutOfRange(trimmed.pd) ? "review" : "pending",
      note: trimmed.note.trim(),
      createdAt: now,
      jobId: null,
      revisionReason: null,
      supersedesId: null,
    };

    this.commit({
      ...this.state,
      prescriptions: [prescription, ...this.state.prescriptions],
    });
    return {
      ok: true,
      message:
        prescription.status === "review"
          ? "处方已下达，瞳距超出 50~80mm，已转待复核"
          : "处方已下达，等待加工",
    };
  }

  /** 复核确认：待复核 → 待加工 */
  approveReview(id: string): ActionResult {
    const target = this.state.prescriptions.find((p) => p.id === id);
    if (!target) return { ok: false, message: "处方不存在" };
    const guard = canApproveReview(target);
    if (!guard.ok) return { ok: false, message: guard.reason };

    this.commit({
      ...this.state,
      prescriptions: this.state.prescriptions.map((p) =>
        p.id === id ? { ...p, status: "pending" } : p
      ),
    });
    return { ok: true, message: "复核通过，处方转入待加工" };
  }

  /** 开工前补录/修改：仅待加工、待复核处方可改（尚未被加工单引用、未冻结）。
   *  典型用途：渐进片下达时缺加光/瞳高，开工前补齐。患者与眼别不可改。 */
  amendPending(id: string, draft: PrescriptionDraft): ActionResult {
    const target = this.state.prescriptions.find((p) => p.id === id);
    if (!target) return { ok: false, message: "处方不存在" };
    if (target.status !== "pending" && target.status !== "review") {
      return { ok: false, message: "处方已被加工单引用，参数冻结，不能直接修改；如需调整请完工后修订" };
    }

    const trimmed: PrescriptionDraft = {
      ...draft,
      patientId: target.patientId,
      patientName: target.patientName,
      eye: target.eye,
    };
    const blocks = issueBlockingIssues(validateDraft(trimmed));
    if (blocks.length > 0) {
      return { ok: false, message: blocks.map((b) => b.message).join("；") };
    }

    this.commit({
      ...this.state,
      prescriptions: this.state.prescriptions.map((p) =>
        p.id === id
          ? {
              ...p,
              sphere: trimmed.sphere,
              cylinder: trimmed.cylinder,
              axis: trimmed.cylinder === 0 ? null : trimmed.axis,
              pd: trimmed.pd,
              lensKind: trimmed.lensKind,
              add: trimmed.lensKind === "progressive" ? trimmed.add : null,
              ph: trimmed.lensKind === "progressive" ? trimmed.ph : null,
              note: trimmed.note.trim(),
              // 修改瞳距后重新判定是否需要复核
              status: isPOutOfRange(trimmed.pd) ? "review" : "pending",
            }
          : p
      ),
    });
    return { ok: true, message: "处方参数已更新，可重新核验后下达加工单" };
  }

  /** 下达加工单：引用处方并冻结参数快照，处方转加工中 */
  startJob(id: string): ActionResult {
    const target = this.state.prescriptions.find((p) => p.id === id);
    if (!target) return { ok: false, message: "处方不存在" };
    const guard = canStartJob(target);
    if (!guard.ok) return { ok: false, message: guard.reason };

    const job: ProcessingJob = {
      id: nextId("job"),
      patientId: target.patientId,
      patientName: target.patientName,
      eye: target.eye,
      snapshot: clone({ ...target, status: "processing" }),
      status: "queued",
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };

    this.commit({
      jobs: [job, ...this.state.jobs],
      prescriptions: this.state.prescriptions.map((p) =>
        p.id === id ? { ...p, status: "processing", jobId: job.id } : p
      ),
    });
    return { ok: true, message: `加工单 ${job.id} 已下达，处方参数已冻结` };
  }

  /** 加工完成：加工单收尾，处方转已加工 */
  completeJob(jobId: string): ActionResult {
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!job) return { ok: false, message: "加工单不存在" };
    if (job.status !== "queued") {
      return { ok: false, message: "加工单已完成" };
    }

    const finishedAt = new Date().toISOString();
    this.commit({
      jobs: this.state.jobs.map((j) =>
        j.id === jobId ? { ...j, status: "done", finishedAt } : j
      ),
      prescriptions: this.state.prescriptions.map((p) =>
        p.id === job.snapshot.id ? { ...p, status: "processed" } : p
      ),
    });
    return { ok: true, message: "加工完成，处方归档为已加工" };
  }

  /** 修订：已加工处方只能带原因新建修订，旧值原样保留为已修订，
   *  新版本接在版本链末端并重新占用同眼别名额。 */
  revise(
    sourceId: string,
    draft: PrescriptionDraft,
    reason: string
  ): ActionResult {
    const source = this.state.prescriptions.find((p) => p.id === sourceId);
    if (!source) return { ok: false, message: "处方不存在" };

    const guard = canRevise(source, reason);
    if (!guard.ok) return { ok: false, message: guard.reason };

    const trimmed: PrescriptionDraft = {
      ...draft,
      patientId: source.patientId,
      patientName: source.patientName,
      eye: source.eye,
    };
    const blocks = issueBlockingIssues(validateDraft(trimmed));
    if (blocks.length > 0) {
      return { ok: false, message: blocks.map((b) => b.message).join("；") };
    }

    const occupant = findOccupant(this.state, source.patientId, source.eye, source.id);
    if (occupant) {
      return { ok: false, message: `同眼别已有在制处方 ${occupant.id}` };
    }

    const chain = this.state.prescriptions
      .filter((p) => p.rootId === source.rootId)
      .sort((a, b) => b.version - a.version);
    const nextVersion = (chain[0]?.version ?? source.version) + 1;
    const now = new Date().toISOString();
    const revised: Prescription = {
      id: nextId("rx"),
      rootId: source.rootId,
      version: nextVersion,
      patientId: source.patientId,
      patientName: source.patientName,
      eye: source.eye,
      sphere: trimmed.sphere,
      cylinder: trimmed.cylinder,
      axis: trimmed.cylinder === 0 ? null : trimmed.axis,
      pd: trimmed.pd,
      lensKind: trimmed.lensKind,
      add: trimmed.lensKind === "progressive" ? trimmed.add : null,
      ph: trimmed.lensKind === "progressive" ? trimmed.ph : null,
      status: isPOutOfRange(trimmed.pd) ? "review" : "pending",
      note: trimmed.note.trim(),
      createdAt: now,
      jobId: null,
      revisionReason: reason.trim(),
      supersedesId: source.id,
    };

    this.commit({
      ...this.state,
      prescriptions: [
        revised,
        ...this.state.prescriptions.map((p) =>
          p.id === source.id ? { ...p, status: "superseded" } : p
        ),
      ],
    });
    return {
      ok: true,
      message:
        revised.status === "review"
          ? `已生成 v${nextVersion} 修订处方，瞳距异常待复核；旧值已保留`
          : `已生成 v${nextVersion} 修订处方，旧值已保留`,
    };
  }
}
