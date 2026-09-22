import { useState } from "react";
import type { AppState, Prescription } from "../domain/types";
import {
  EYE_SIDE_LABEL,
  LENS_KIND_LABEL,
  STATUS_LABEL,
} from "../domain/types";
import { isSnapshotFrozen, canStartJob } from "../domain/rules";
import { formatPowerLine, formatTime } from "./format";

interface Props {
  state: AppState;
  onApprove: (id: string) => void;
  onStart: (id: string) => void;
  onAmend: (rx: Prescription) => void;
  onRevise: (rx: Prescription) => void;
}

const STATUS_CLASS: Record<Prescription["status"], string> = {
  pending: "st-pending",
  review: "st-review",
  processing: "st-processing",
  processed: "st-processed",
  superseded: "st-superseded",
};

function freezeHint(state: AppState, rx: Prescription): string | null {
  if (!rx.jobId) return null;
  const job = state.jobs.find((j) => j.id === rx.jobId);
  if (!job) return "加工单缺失";
  return isSnapshotFrozen(rx, job)
    ? `参数已按加工单 ${job.id} 冻结，与快照一致`
    : `冻结异常：与加工单 ${job.id} 快照不一致`;
}

function RxCard({
  rx,
  state,
  archived,
  onApprove,
  onStart,
  onAmend,
  onRevise,
}: {
  rx: Prescription;
  state: AppState;
  archived: boolean;
} & Omit<Props, "state">) {
  const frozen = freezeHint(state, rx);
  const startGuard = canStartJob(rx);

  return (
    <article className={`rx-card ${STATUS_CLASS[rx.status]} ${archived ? "archived" : ""}`}>
      <header className="rx-head">
        <div>
          <h3>
            {rx.patientId} · {rx.patientName}
            <span className="eye-tag">{EYE_SIDE_LABEL[rx.eye]}</span>
            <span className="ver-tag">v{rx.version}</span>
          </h3>
          <p className="rx-meta">
            {LENS_KIND_LABEL[rx.lensKind]} · {formatTime(rx.createdAt)}
            {rx.revisionReason && <em className="reason-tag">修订原因：{rx.revisionReason}</em>}
          </p>
        </div>
        <span className={`status-pill ${STATUS_CLASS[rx.status]}`}>
          {STATUS_LABEL[rx.status]}
        </span>
      </header>

      <p className="power-line">{formatPowerLine(rx)}</p>
      {rx.note && <p className="rx-note">备注：{rx.note}</p>}
      {rx.status === "review" && (
        <p className="banner warn">瞳距超出 50~80mm 正常区间，必须复核确认后才能开工</p>
      )}
      {frozen && (
        <p className={`banner ${frozen.includes("异常") || frozen.includes("缺失") ? "error" : "frozen"}`}>
          🔒 {frozen}
        </p>
      )}

      {!archived && (
        <footer className="rx-actions">
          {rx.status === "pending" && (
            <>
              <button onClick={() => onAmend(rx)}>开工前补录/修改</button>
              <button className="primary-action" onClick={() => onStart(rx.id)}>
                下达加工单（冻结参数）
              </button>
            </>
          )}
          {!startGuard.ok && rx.status === "pending" && (
            <em className="field-error">⛔ {startGuard.reason}</em>
          )}
          {rx.status === "review" && (
            <>
              <button onClick={() => onAmend(rx)}>修改瞳距/参数</button>
              <button className="primary-action" onClick={() => onApprove(rx.id)}>
                复核通过，转待加工
              </button>
            </>
          )}
          {rx.status === "processed" && (
            <button onClick={() => onRevise(rx)}>带原因新建修订</button>
          )}
          {rx.status === "processing" && (
            <span className="hint-text">
              处方参数冻结中，加工完成后可修订
            </span>
          )}
        </footer>
      )}
    </article>
  );
}

export function PrescriptionList({ state, onApprove, onStart, onAmend, onRevise }: Props) {
  const [openChains, setOpenChains] = useState<Set<string>>(new Set());

  // 按版本链（患者 + 眼别）归组，最新组排前；组内新版本在前
  const groups = new Map<string, Prescription[]>();
  for (const rx of state.prescriptions) {
    const list = groups.get(rx.rootId) ?? [];
    list.push(rx);
    groups.set(rx.rootId, list);
  }
  const chains = [...groups.values()]
    .map((list) => list.sort((a, b) => b.version - a.version))
    .sort(
      (a, b) =>
        new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime()
    );

  const toggleChain = (rootId: string) => {
    setOpenChains((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  if (chains.length === 0) {
    return <p className="empty-tip">暂无处方，先在左侧下达一张。</p>;
  }

  return (
    <div className="rx-list">
      {chains.map((chain) => {
        const [current, ...history] = chain;
        const open = openChains.has(current.rootId);
        return (
          <div key={current.rootId} className="chain-group">
            <RxCard
              rx={current}
              state={state}
              archived={false}
              onApprove={onApprove}
              onStart={onStart}
              onAmend={onAmend}
              onRevise={onRevise}
            />
            {history.length > 0 && (
              <>
                <button
                  type="button"
                  className="chain-toggle"
                  onClick={() => toggleChain(current.rootId)}
                >
                  {open ? "收起版本链" : `查看版本链（${history.length} 个历史版本）`}
                </button>
                {open &&
                  history.map((rx) => (
                    <RxCard
                      key={rx.id}
                      rx={rx}
                      state={state}
                      archived
                      onApprove={onApprove}
                      onStart={onStart}
                      onAmend={onAmend}
                      onRevise={onRevise}
                    />
                  ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
