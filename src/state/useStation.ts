// React 绑定层：useState 承接纯 reducer 输出 + localStorage 持久化 + 一致性自检。
// 页面只与该 hook 交互，不直接触碰判定规则。

import { useMemo, useState } from "react";
import { AppState } from "../domain/types";
import { Action, ActionResult, auditState, reducer } from "../domain/reducer";
import { seedState } from "../domain/seed";

const STORAGE_KEY = "lens-station-state-v1";

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.prescriptions) && Array.isArray(parsed.orders)) {
        return parsed;
      }
    }
  } catch {
    // 存储损坏时回落实例数据
  }
  return seedState;
}

export function useStation() {
  const [state, setState] = useState<AppState>(loadState);
  const [toast, setToast] = useState<ActionResult | null>(null);

  // 每次变更后落盘：刷新后处方、占用、加工单、版本链从同一份数据重算
  const persist = (next: AppState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 隐私模式等场景降级为内存态
    }
  };

  const dispatch = (action: Action): boolean => {
    const { state: next, result } = reducer(state, action);
    if (result.ok) {
      persist(next);
      setState(next);
    }
    setToast(result);
    return result.ok;
  };

  const resetDemo = () => {
    persist(seedState);
    setState(seedState);
    setToast({ ok: true, message: "已恢复示例数据" });
  };

  const problems = useMemo(() => auditState(state), [state]);

  return { state, dispatch, toast, setToast, problems, resetDemo };
}
