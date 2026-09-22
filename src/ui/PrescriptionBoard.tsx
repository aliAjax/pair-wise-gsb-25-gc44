// 处方看板：按患者分组展示处方、占用状态、版本链与可用操作。

import { useMemo, useState } from "react";
import {
  AppState,
  Prescription,
  occupationKey,
} from "../domain/types";
import {
  selectOccupations,
  selectVersionChain,
} from "../domain/rules";
import { eyeShort, fmtD, fmtNum, formatTime, kindLabel, rxStatusMeta } from "./format";

export type BoardAction =
  | { kind: "edit"; rx: Prescription }
  | { kind: "createOrder"; rx: Prescription }
  | { kind: "resolveReview"; rx: Prescription }
  | { kind: "revise"; rx: Prescription };

interface Props {
  state: AppState;
  filterPatient: string;
  onAction: (a: BoardAction) => void;
}

type StatusFilter = "all" | "pending" | "frozen" | "processed";

export function PrescriptionBoard({ state, filterPatient, onAction }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const occupations = useMemo(() => selectOccupations(state), [state]);

  const groups = useMemo(() => {
    const map = new Map<string, Prescription[]>();
    for (const rx of state.prescriptions) {
      const list = map.get(rx.patientId) ?? [];
      list.push(rx);
      map.set(rx.patientId, list);
    }
    return [...map.entries()]
      .filter(([pid]) => pid.toLowerCase().includes(filterPatient.trim().toLowerCase()))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [state.prescriptions, filterPatient]);

  const visible = (rx: Prescription) =>
    statusFilter === "all" ||
    rx.status === statusFilter ||
    (statusFilter === "processed" && (rx.status === "processed" || rx.status === "superseded"));

  return (
    <section className="panel board-panel">
      <div className="section-heading">
        <div>
          <p>处方台账</p>
          <h2>按患者与眼别（{state.prescriptions.length} 张，占用槽位 {occupations.size} 个）</h2>
        </div>
        <div className="filter-tabs">
          {(
            [
              ["all", "全部"],
              ["pending", "待加工"],
              ["frozen", "已冻结"],
              ["processed", "已加工/修订"],
            ] as [StatusFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={statusFilter === key ? "tab-on" : ""}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="empty-hint">没有匹配的患者。</p>}

      <div className="patient-groups">
        {groups.map(([pid, list]) => {
          const shown = list.filter(visible);
          if (shown.length === 0) return null;
          return (
            <article key={pid} className="patient-group">
              <h3>
                {pid}
                <span className="group-sub">
                  右眼占用：
                  {occupations.has(occupationKey(pid, "OD"))
                    ? occupations.get(occupationKey(pid, "OD"))!.id
                    : "空"}
                  {" · "}左眼占用：
                  {occupations.has(occupationKey(pid, "OS"))
                    ? occupations.get(occupationKey(pid, "OS"))!.id
                    : "空"}
                </span>
              </h3>
              <div className="rx-cards">
                {[...shown]
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((rx) => (
                    <RxCard key={rx.id} rx={rx} state={state} onAction={onAction} />
                  ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RxCard({
  rx,
  state,
  onAction,
}: {
  rx: Prescription;
  state: AppState;
  onAction: (a: BoardAction) => void;
}) {
  const meta = rxStatusMeta[rx.status];
  const chain = selectVersionChain(state, rx.rootId);
  const isChainHead = chain.length > 1 && rx.id === chain[chain.length - 1].id;
  const p = rx.params;

  return (
    <div className={`rx-card ${meta.cls}`}>
      <header>
        <div>
          <strong>{rx.id}</strong>
          <span className={`rx-status ${meta.cls}`}>{meta.text}</span>
          {rx.reviewRequired && <span className="rx-status st-review">瞳距待复核</span>}
        </div>
        <span className="rx-eye">{eyeShort(rx.eye)}眼</span>
      </header>

      <p className="rx-kind">
        {kindLabel(rx.lensKind)} · v{rx.version} · {formatTime(rx.createdAt)}
      </p>

      <dl className="param-grid">
        <div><dt>球镜</dt><dd>{fmtD(p.sphere, "D")}</dd></div>
        <div><dt>柱镜</dt><dd>{fmtD(p.cylinder, "D")}</dd></div>
        <div><dt>轴位</dt><dd>{fmtNum(p.axis, "°")}</dd></div>
        <div><dt>瞳距</dt><dd className={p.pd !== null && (p.pd < 50 || p.pd > 80) ? "val-warn" : ""}>{fmtNum(p.pd, "mm")}</dd></div>
        {rx.lensKind === "progressive" && (
          <>
            <div><dt>下加光</dt><dd>{fmtD(p.add, "D")}</dd></div>
            <div><dt>瞳高</dt><dd>{fmtNum(p.segHeight, "mm")}</dd></div>
          </>
        )}
      </dl>

      {rx.reviseReason && <p className="revise-reason">修订原因：{rx.reviseReason}</p>}
      {rx.orderId && <p className="order-ref">加工单：{rx.orderId}</p>}

      {isChainHead && (
        <div className="chain">
          <span>版本链：</span>
          {chain.map((c, i) => (
            <span key={c.id} className="chain-node">
              {i > 0 && " ← "}
              <span className={c.id === rx.id ? "chain-now" : ""}>
                {c.id} v{c.version}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="rx-actions">
        {rx.status === "pending" && (
          <>
            <button onClick={() => onAction({ kind: "edit", rx })}>修改参数</button>
            <button
              className="primary-action"
              disabled={rx.reviewRequired}
              title={rx.reviewRequired ? "瞳距复核通过后才能下达加工单" : ""}
              onClick={() => onAction({ kind: "createOrder", rx })}
            >
              下达加工单
            </button>
            {rx.reviewRequired && (
              <button onClick={() => onAction({ kind: "resolveReview", rx })}>复核通过</button>
            )}
          </>
        )}
        {(rx.status === "processed" || rx.status === "superseded") && (
          <button
            onClick={() => onAction({ kind: "revise", rx })}
            disabled={rx.status !== "processed"}
            title={rx.status === "superseded" ? "请从最新已加工版本发起修订" : ""}
          >
            带原因修订
          </button>
        )}
        {rx.status === "frozen" && <span className="muted">参数已随加工单冻结</span>}
      </div>
    </div>
  );
}
