// 镜片加工核验台：冻结快照核对 → 渐进片补 ADD/瞳高 → 开工 → 完成核验。

import { useMemo, useState } from "react";
import { AppState, LensParams, WorkOrder } from "../domain/types";
import { evaluateStart, pdInRange } from "../domain/rules";
import { eyeLabel, fmtD, fmtNum, formatTime, kindLabel, orderStatusMeta } from "./format";

export type OrderAction =
  | { kind: "supplement"; orderId: string; patch: Partial<Pick<LensParams, "add" | "segHeight">> }
  | { kind: "start"; orderId: string }
  | { kind: "complete"; orderId: string; checkNote: string };

interface Props {
  state: AppState;
  onAction: (a: OrderAction) => void;
}

export function WorkOrderDesk({ state, onAction }: Props) {
  const sorted = useMemo(
    () =>
      [...state.orders].sort((a, b) => {
        const rank = { queued: 0, in_progress: 1, done: 2 } as const;
        return rank[a.status] - rank[b.status] || b.createdAt - a.createdAt;
      }),
    [state.orders]
  );

  return (
    <section className="panel desk-panel">
      <div className="section-heading">
        <div>
          <p>加工核验台</p>
          <h2>加工单（{state.orders.length}）· 引用时刻参数已冻结</h2>
        </div>
      </div>

      <div className="order-list">
        {sorted.map((o) => (
          <OrderCard key={o.id} order={o} state={state} onAction={onAction} />
        ))}
        {sorted.length === 0 && <p className="empty-hint">暂无加工单。</p>}
      </div>
    </section>
  );
}

function OrderCard({
  order,
  state,
  onAction,
}: {
  order: WorkOrder;
  state: AppState;
  onAction: (a: OrderAction) => void;
}) {
  const meta = orderStatusMeta[order.status];
  const rx = state.prescriptions.find((r) => r.id === order.prescriptionId);
  const check = evaluateStart(order);
  const [add, setAdd] = useState(order.frozenParams.add === null ? "" : String(order.frozenParams.add));
  const [segH, setSegH] = useState(
    order.frozenParams.segHeight === null ? "" : String(order.frozenParams.segHeight)
  );
  const [note, setNote] = useState(order.checkNote);
  const p = order.frozenParams;
  const pdBad = !pdInRange(p.pd);

  const supplement = () => {
    const patch: Partial<Pick<LensParams, "add" | "segHeight">> = {};
    const a = Number(add);
    const h = Number(segH);
    if (order.frozenParams.add === null) patch.add = a;
    if (order.frozenParams.segHeight === null) patch.segHeight = h;
    onAction({ kind: "supplement", orderId: order.id, patch });
  };

  return (
    <article className={`order-card ${meta.cls}`}>
      <header>
        <div>
          <strong>{order.id}</strong>
          <span className={`rx-status ${meta.cls}`}>{meta.text}</span>
        </div>
        <div className="order-meta">
          {order.patientId} · {eyeLabel(order.eye)} · {kindLabel(order.lensKind)}
        </div>
      </header>

      <div className="order-body">
        <div className="frozen-box">
          <h4>冻结参数快照</h4>
          <dl className="param-grid">
            <div><dt>球镜</dt><dd>{fmtD(p.sphere, "D")}</dd></div>
            <div><dt>柱镜</dt><dd>{fmtD(p.cylinder, "D")}</dd></div>
            <div><dt>轴位</dt><dd>{fmtNum(p.axis, "°")}</dd></div>
            <div>
              <dt>瞳距</dt>
              <dd className={pdBad ? "val-warn" : ""}>{fmtNum(p.pd, "mm")}</dd>
            </div>
            <div><dt>下加光</dt><dd className={order.lensKind === "progressive" && p.add === null ? "val-warn" : ""}>{fmtD(p.add, "D")}</dd></div>
            <div><dt>瞳高</dt><dd className={order.lensKind === "progressive" && p.segHeight === null ? "val-warn" : ""}>{fmtNum(p.segHeight, "mm")}</dd></div>
          </dl>
          <p className="snapshot-hint">
            处方 {order.prescriptionId} 当前状态：{rx ? rx.status : "缺失"} · 快照创建 {formatTime(order.createdAt)}
          </p>
        </div>

        <div className="action-box">
          {order.status === "queued" && order.lensKind === "progressive" && check.missingProgressive.length > 0 && (
            <div className="supplement">
              <h4>开工前补录（渐进片）</h4>
              {check.missingProgressive.includes("add") && (
                <label>
                  <span>下加光 ADD (D)</span>
                  <input value={add} onChange={(e) => setAdd(e.target.value)} inputMode="decimal" placeholder="如 1.50" />
                </label>
              )}
              {check.missingProgressive.includes("segHeight") && (
                <label>
                  <span>瞳高 (mm)</span>
                  <input value={segH} onChange={(e) => setSegH(e.target.value)} inputMode="decimal" placeholder="如 22" />
                </label>
              )}
              <button onClick={supplement}>补入快照</button>
            </div>
          )}

          {order.status === "queued" && (
            <>
              {!check.canStart && (
                <ul className="issue-list">
                  {check.issues.map((i, idx) => (
                    <li key={idx}>{i.message}</li>
                  ))}
                </ul>
              )}
              <button
                className="primary-action"
                disabled={!check.canStart}
                onClick={() => onAction({ kind: "start", orderId: order.id })}
              >
                {check.canStart ? "核验通过，开工" : "缺失参数，不得开工"}
              </button>
            </>
          )}

          {order.status === "in_progress" && (
            <div className="complete-box">
              <h4>完工核验</h4>
              <label>
                <span>核验备注</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：轴位/瞳距核验合格" />
              </label>
              <button
                className="primary-action"
                disabled={!note.trim()}
                onClick={() => onAction({ kind: "complete", orderId: order.id, checkNote: note.trim() })}
              >
                完成核验并归档处方
              </button>
              {order.startedAt && <p className="muted">开工时间：{formatTime(order.startedAt)}</p>}
            </div>
          )}

          {order.status === "done" && (
            <div className="done-box">
              <p>核验备注：{order.checkNote || "—"}</p>
              <p className="muted">
                开工 {order.startedAt ? formatTime(order.startedAt) : "—"} · 完工{" "}
                {order.finishedAt ? formatTime(order.finishedAt) : "—"}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
