import { useSyncExternalStore } from "react";
import { RxStore } from "../domain/store";
import type { AppState } from "../domain/types";

// 全应用唯一仓库实例；领域逻辑与 React 仅通过此 hook 接触。
export const store = new RxStore();

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
