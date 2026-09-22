// 状态流转（纯函数 reducer）：所有处方/加工单变更都先过 rules 判定。
// 不变量：
//  1. 同一患者同眼别至多一张 pending 处方；
//  2. 加工单持有引用时刻的参数冻结快照；
//  3. 渐进片缺 ADD/瞳高只能排队，不能开工；
//  4. 已加工(superseded/processed)处方不可改，修订一律新建版本并保留旧值；
//  5. 任意刷新后从同一 AppState 即可重算占用、加工单与版本链。

import {
  AppState,
  LensParams,
  Prescription,
  PrescriptionDraft,
  WorkOrder,
  occupationKey,
} from "./types";
import {
  evaluateIssue,
  evaluateStart,
  orderBlocksRevision,
  pdInRange,
} from "./rules";

export const initialState: AppState = { prescriptions: [], orders: [] };

let seq = 0;
function nextId(prefix: string, now: number): string {
  seq += 1;
  return `${prefix}-${now.toString(36)}-${seq.toString(36)}`;
}

export type Action =
  | { type: "issue"; draft: PrescriptionDraft }
  | { type: "updatePending"; id: string; draft: PrescriptionDraft }
  | { type: "resolveReview"; id: string }
  | { type: "createOrder"; prescriptionId: string }
  | { type: "supplementOrder"; orderId: string; patch: Partial<Pick<LensParams, "add" | "segHeight">> }
  | { type: "startOrder"; orderId: string }
  | { type: "completeOrder"; orderId: string; checkNote: string }
  | { type: "revise"; sourceId: string; draft: PrescriptionDraft };

export interface ActionResult {
  ok: boolean;
  message: string;
}

function fail(message: string): ActionResult {
  return { ok: false, message };
}

const ok: ActionResult = { ok: true, message: "" };

export function reducer(state: AppState, action: Action): {
  state: AppState;
  result: ActionResult;
} {
  const now = Date.now();

  switch (action.type) {
    case "issue": {
      const evaluation = evaluateIssue(state, action.draft);
      if (!evaluation.canIssue) {
        return { state, result: fail(evaluation.issues.map((i) => i.message).join("；")) };
      }
      const rx: Prescription = {
        id: nextId("RX", now),
        patientId: action.draft.patientId.trim(),
        eye: action.draft.eye,
        lensKind: action.draft.lensKind,
        params: evaluation.params,
        status: "pending",
        reviewRequired: !pdInRange(evaluation.params.pd),
        rootId: "",
        prevId: null,
        version: 1,
        orderId: null,
        createdAt: now,
        updatedAt: now,
      };
      rx.rootId = rx.id;
      return {
        state: { ...state, prescriptions: [...state.prescriptions, rx] },
        result: { ok: true, message: `处方 ${rx.id} 已下达` },
      };
    }

    case "updatePending": {
      const target = state.prescriptions.find((r) => r.id === action.id);
      if (!target) return { state, result: fail("处方不存在") };
      if (target.status !== "pending") return { state, result: fail("非待加工处方不可直接修改，请走修订") };
      // 占用判定排除自身；这是参数修改而非修订，不要求修订原因
      const evaluation = evaluateIssue(state, action.draft, { revisingId: target.id });
      if (!evaluation.canIssue) {
        return { state, result: fail(evaluation.issues.map((i) => i.message).join("；")) };
      }
      const updated: Prescription = {
        ...target,
        patientId: action.draft.patientId.trim(),
        eye: action.draft.eye,
        lensKind: action.draft.lensKind,
        params: evaluation.params,
        reviewRequired: !pdInRange(evaluation.params.pd),
        updatedAt: now,
      };
      return {
        state: {
          ...state,
          prescriptions: state.prescriptions.map((r) => (r.id === target.id ? updated : r)),
        },
        result: { ok: true, message: "处方已更新" },
      };
    }

    case "resolveReview": {
      const target = state.prescriptions.find((r) => r.id === action.id);
      if (!target || !target.reviewRequired) return { state, result: fail("无需复核") };
      return {
        state: {
          ...state,
          prescriptions: state.prescriptions.map((r) =>
            r.id === target.id ? { ...r, reviewRequired: false, updatedAt: now } : r
          ),
        },
        result: { ok: true, message: "瞳距复核通过，解除复核标记" },
      };
    }

    case "createOrder": {
      const rx = state.prescriptions.find((r) => r.id === action.prescriptionId);
      if (!rx) return { state, result: fail("处方不存在") };
      if (rx.status !== "pending") return { state, result: fail("仅待加工处方可下达加工单") };
      if (rx.reviewRequired) return { state, result: fail("瞳距待复核，不能下达加工单") };

      const order: WorkOrder = {
        id: nextId("WO", now),
        prescriptionId: rx.id,
        patientId: rx.patientId,
        eye: rx.eye,
        lensKind: rx.lensKind,
        // 引用即冻结：快照独立于处方存档
        frozenParams: structuredCloneSafe(rx.params),
        status: "queued",
        checkNote: "",
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      };
      return {
        state: {
          prescriptions: state.prescriptions.map((r) =>
            r.id === rx.id ? { ...r, status: "frozen", orderId: order.id, updatedAt: now } : r
          ),
          orders: [...state.orders, order],
        },
        result: { ok: true, message: `加工单 ${order.id} 已建立并冻结参数` },
      };
    }

    case "supplementOrder": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return { state, result: fail("加工单不存在") };
      if (order.status !== "queued") return { state, result: fail("仅排队中的加工单可补参数") };
      if (order.lensKind !== "progressive") return { state, result: fail("仅渐进片需要补加光/瞳高") };

      const patch: Partial<Pick<LensParams, "add" | "segHeight">> = {};
      for (const key of ["add", "segHeight"] as const) {
        const v = action.patch[key];
        if (v === undefined) continue;
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
          return { state, result: fail(key === "add" ? "下加光须为正数（D）" : "瞳高须为正数（mm）") };
        }
        patch[key] = v;
      }
      const next = state.orders.map((o) =>
        o.id === order.id
          ? { ...o, frozenParams: { ...o.frozenParams, ...patch } }
          : o
      );
      return {
        state: { ...state, orders: next },
        result: { ok: true, message: "附加参数已补入冻结快照" },
      };
    }

    case "startOrder": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return { state, result: fail("加工单不存在") };
      if (order.status !== "queued") return { state, result: fail("仅排队中的加工单可开工") };
      const check = evaluateStart(order);
      if (!check.canStart) {
        return { state, result: fail(check.issues.map((i) => i.message).join("；")) };
      }
      return {
        state: {
          ...state,
          orders: state.orders.map((o) =>
            o.id === order.id ? { ...o, status: "in_progress", startedAt: now } : o
          ),
        },
        result: { ok: true, message: `加工单 ${order.id} 开工` },
      };
    }

    case "completeOrder": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return { state, result: fail("加工单不存在") };
      if (order.status !== "in_progress") return { state, result: fail("仅加工中的单据可完成核验") };
      return {
        state: {
          prescriptions: state.prescriptions.map((r) =>
            r.id === order.prescriptionId ? { ...r, status: "processed", updatedAt: now } : r
          ),
          orders: state.orders.map((o) =>
            o.id === order.id
              ? { ...o, status: "done", checkNote: action.checkNote, finishedAt: now }
              : o
          ),
        },
        result: { ok: true, message: `加工单 ${order.id} 已完成核验，处方归档` },
      };
    }

    case "revise": {
      const source = state.prescriptions.find((r) => r.id === action.sourceId);
      if (!source) return { state, result: fail("原处方不存在") };
      if (source.status !== "processed" && source.status !== "superseded") {
        return { state, result: fail("仅已加工处方允许修订；待加工处方可直接修改") };
      }
      if (orderBlocksRevision(state, source.id)) {
        return { state, result: fail("该处方仍有未完成加工单，不能修订") };
      }
      const evaluation = evaluateIssue(state, action.draft);
      if (!evaluation.canIssue) {
        return { state, result: fail(evaluation.issues.map((i) => i.message).join("；")) };
      }
      const reason = (action.draft.reviseReason ?? "").trim();
      if (!reason) return { state, result: fail("修订必须填写原因") };

      const rx: Prescription = {
        id: nextId("RX", now),
        patientId: source.patientId,
        eye: source.eye,
        lensKind: action.draft.lensKind,
        params: evaluation.params,
        status: "pending",
        reviewRequired: !pdInRange(evaluation.params.pd),
        reviseReason: reason,
        rootId: source.rootId,
        prevId: source.id,
        version: source.version + 1,
        orderId: null,
        createdAt: now,
        updatedAt: now,
      };
      return {
        state: {
          ...state,
          prescriptions: [
            ...state.prescriptions.map((r) =>
              r.id === source.id && r.status === "processed"
                ? { ...r, status: "superseded" as const, updatedAt: now }
                : r
            ),
            rx,
          ],
        },
        result: { ok: true, message: `已按原因「${reason}」生成修订版本 v${rx.version}` },
      };
    }

    default:
      return { state, result: fail("未知操作") };
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 一致性自检：刷新/加载数据后校验不变量 */
export function auditState(state: AppState): string[] {
  const problems: string[] = [];
  const occupied = new Map<string, string>();
  for (const rx of state.prescriptions) {
    if (rx.status === "pending") {
      const key = occupationKey(rx.patientId, rx.eye);
      const prev = occupied.get(key);
      if (prev) problems.push(`占用冲突：${key} 同时被 ${prev} 与 ${rx.id} 待加工`);
      occupied.set(key, rx.id);
    }
    if (rx.status === "frozen" || rx.status === "processed") {
      const order = state.orders.find((o) => o.id === rx.orderId);
      if (!order) problems.push(`处方 ${rx.id} 缺少加工单引用`);
    }
  }
  for (const order of state.orders) {
    const rx = state.prescriptions.find((r) => r.id === order.prescriptionId);
    if (!rx) {
      problems.push(`加工单 ${order.id} 引用的处方不存在`);
      continue;
    }
    if (order.status === "done" && rx.status !== "processed" && rx.status !== "superseded") {
      problems.push(`加工单 ${order.id} 已完成但处方未归档`);
    }
  }
  return problems;
}
