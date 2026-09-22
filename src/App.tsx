import { useMemo, useState } from "react";
import "./styles.css";
import { useStation } from "./state/useStation";
import { Prescription, PrescriptionDraft } from "./domain/types";
import { selectOccupations } from "./domain/rules";
import { PrescriptionForm } from "./ui/PrescriptionForm";
import { PrescriptionBoard, BoardAction } from "./ui/PrescriptionBoard";
import { WorkOrderDesk, OrderAction } from "./ui/WorkOrderDesk";
import { RevisionDialog } from "./ui/RevisionDialog";

const project = {
  id: "hxwl-11",
  port: 5111,
  title: "处方下达与镜片加工核验台",
  subtitle: "处方按患者 / 眼别管理球镜、柱镜、轴位与瞳距；加工单引用即冻结，渐进片补加光与瞳高后方可开工，已加工处方带原因修订并保留版本链。",
  stack: "React + Vite + TypeScript + CSS（无新增依赖）",
};

function App() {
  const { state, dispatch, toast, setToast, problems, resetDemo } = useStation();
  const [editing, setEditing] = useState<Prescription | null>(null);
  const [revising, setRevising] = useState<Prescription | null>(null);
  const [filterPatient, setFilterPatient] = useState("");

  const occupations = useMemo(() => selectOccupations(state), [state]);
  const metrics = useMemo(() => {
    const pending = state.prescriptions.filter((r) => r.status === "pending").length;
    const review = state.prescriptions.filter((r) => r.reviewRequired).length;
    const queued = state.orders.filter((o) => o.status === "queued").length;
    const processing = state.orders.filter((o) => o.status === "in_progress").length;
    const done = state.orders.filter((o) => o.status === "done").length;
    const families = new Set(state.prescriptions.map((r) => r.rootId)).size;
    return [
      { label: "待加工处方 / 占用槽位", value: `${pending} / ${occupations.size}` },
      { label: "瞳距待复核", value: review },
      { label: "排队 / 加工中", value: `${queued} / ${processing}` },
      { label: "已完成加工单", value: done },
      { label: "处方版本家族", value: families },
    ];
  }, [state, occupations.size]);

  const handleIssue = (draft: PrescriptionDraft, editingId: string | null) => {
    if (editingId) {
      const ok = dispatch({ type: "updatePending", id: editingId, draft });
      if (ok) setEditing(null);
    } else {
      dispatch({ type: "issue", draft });
    }
  };

  const handleBoardAction = (a: BoardAction) => {
    switch (a.kind) {
      case "edit":
        setEditing(a.rx);
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "createOrder":
        dispatch({ type: "createOrder", prescriptionId: a.rx.id });
        break;
      case "resolveReview":
        dispatch({ type: "resolveReview", id: a.rx.id });
        break;
      case "revise":
        setRevising(a.rx);
        break;
    }
  };

  const handleOrderAction = (a: OrderAction) => {
    if (a.kind === "supplement") {
      dispatch({ type: "supplementOrder", orderId: a.orderId, patch: a.patch });
      return;
    }
    if (a.kind === "start") {
      dispatch({ type: "startOrder", orderId: a.orderId });
      return;
    }
    dispatch({ type: "completeOrder", orderId: a.orderId, checkNote: a.checkNote });
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
          <button className="reset-btn" onClick={resetDemo}>恢复示例数据</button>
        </div>
      </section>

      {problems.length > 0 && (
        <section className="audit-banner">
          <strong>一致性自检发现 {problems.length} 个问题：</strong>
          {problems.map((p, i) => (
            <span key={i}>{p}</span>
          ))}
        </section>
      )}

      <section className="metrics-grid metrics-grid-5">
        {metrics.map((m) => (
          <article className="metric-card" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <PrescriptionForm
        state={state}
        editing={editing}
        onSubmit={handleIssue}
        onCancelEdit={() => setEditing(null)}
      />

      <section className="workspace workspace-cols">
        <div className="panel rules-panel">
          <p className="eyebrow">规则</p>
          <h2>核验规则一览</h2>
          <ul className="rule-list">
            <li>同一患者同一眼别，只能有一张<strong>待加工</strong>处方；下达加工单后槽位转为冻结。</li>
            <li>有柱镜（C ≠ 0）必须填轴位，轴位限 <strong>0~180°</strong>。</li>
            <li>瞳距超出 <strong>50~80mm</strong> 不阻断录入，但处方进入<strong>待复核</strong>，复核通过前不能下达加工单。</li>
            <li>加工单引用处方时冻结参数快照；渐进片缺 <strong>ADD / 瞳高</strong> 只能排队，补齐后方可开工。</li>
            <li>已加工处方不可改，只能<strong>带原因新建修订</strong>；旧处方标记为「已修订」，旧值保留在版本链。</li>
          </ul>
          <h3>当前占用</h3>
          <div className="occ-list">
            {[...occupations.entries()].length === 0 && <p className="muted">无占用</p>}
            {[...occupations.entries()].map(([key, rx]) => (
              <span key={key} className={`occ-chip ${rx.reviewRequired ? "occ-review" : ""}`}>
                {key.replace("::", " / ")} → {rx.id}
                {rx.reviewRequired && "（复核中）"}
              </span>
            ))}
          </div>
        </div>

        <div className="board-wrap">
          <div className="patient-filter panel">
            <label>
              <span>按患者编号筛选</span>
              <input
                value={filterPatient}
                onChange={(e) => setFilterPatient(e.target.value)}
                placeholder="输入 Patient- 编号"
              />
            </label>
          </div>
          <PrescriptionBoard
            state={state}
            filterPatient={filterPatient}
            onAction={handleBoardAction}
          />
        </div>
      </section>

      <WorkOrderDesk state={state} onAction={handleOrderAction} />

      <footer className="foot-note">
        数据保存在浏览器 localStorage，刷新页面后处方、占用、加工单与版本链均从同一状态重算。
      </footer>

      {toast && (
        <div
          className={`toast ${toast.ok ? "toast-ok" : "toast-err"}`}
          onClick={() => setToast(null)}
        >
          {toast.ok ? "✓ " : "✕ "}
          {toast.message || (toast.ok ? "操作成功" : "操作被规则阻断")}
        </div>
      )}

      {revising && (
        <RevisionDialog
          state={state}
          source={revising}
          onClose={() => setRevising(null)}
          onConfirm={(sourceId, draft) => {
            const ok = dispatch({ type: "revise", sourceId, draft });
            if (ok) setRevising(null);
          }}
        />
      )}
    </main>
  );
}

export default App;
