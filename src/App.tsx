import { useMemo, useState } from "react";
import "./styles.css";
import { store, useAppState } from "./ui/useAppState";
import { checkConsistency } from "./domain/rules";
import type { Prescription } from "./domain/types";
import { emptyForm, PrescriptionForm, type FormValues } from "./ui/PrescriptionForm";
import { PrescriptionList } from "./ui/PrescriptionList";
import { JobBoard } from "./ui/JobBoard";
import { RevisionDialog } from "./ui/RevisionDialog";
import { AmendDialog } from "./ui/AmendDialog";

type Tab = "rx" | "jobs";

function Toast({ text, kind }: { text: string; kind: "ok" | "err" }) {
  return <div className={`toast ${kind}`}>{text}</div>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={tone} />
    </article>
  );
}

function App() {
  const state = useAppState();
  const [tab, setTab] = useState<Tab>("rx");
  const [form, setForm] = useState<FormValues>(emptyForm());
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [revising, setRevising] = useState<Prescription | null>(null);
  const [amending, setAmending] = useState<Prescription | null>(null);

  const notify = (text: string, kind: "ok" | "err" = "ok") => {
    setToast({ text, kind });
    window.setTimeout(() => setToast(null), 3200);
  };

  const metrics = useMemo(() => {
    return {
      pending: state.prescriptions.filter((p) => p.status === "pending").length,
      review: state.prescriptions.filter((p) => p.status === "review").length,
      processing: state.prescriptions.filter((p) => p.status === "processing").length,
      processed: state.prescriptions.filter((p) => p.status === "processed").length,
    };
  }, [state]);

  const consistency = useMemo(() => checkConsistency(state), [state]);

  return (
    <main className="app-shell">
      {toast && <Toast text={toast.text} kind={toast.kind} />}
      {revising && (
        <RevisionDialog
          source={revising}
          onClose={() => setRevising(null)}
          onSubmit={(draft, reason) => {
            const result = store.revise(revising.id, draft, reason);
            notify(result.message ?? (result.ok ? "修订完成" : "修订失败"), result.ok ? "ok" : "err");
            if (result.ok) setRevising(null);
            return result;
          }}
        />
      )}
      {amending && (
        <AmendDialog
          source={amending}
          onClose={() => setAmending(null)}
          onSubmit={(id, draft) => {
            const result = store.amendPending(id, draft);
            notify(result.message ?? (result.ok ? "保存成功" : "保存失败"), result.ok ? "ok" : "err");
            if (result.ok) setAmending(null);
            return result;
          }}
        />
      )}

      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-11 · 端口 5111</p>
          <h1>处方下达与镜片加工核验台</h1>
          <p className="subtitle">
            按患者与眼别管理球镜 / 柱镜 / 轴位 / 瞳距；有柱镜必填轴位（0~180°），
            瞳距超出 50~80mm 自动待复核，同患者同眼别仅一张待加工处方，
            加工单引用即冻结参数；渐进片须补齐加光与瞳高，已加工处方带原因修订并保留全部旧值。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>React + Vite + TypeScript + CSS（无新增依赖）</strong>
          <span>数据 / 规则 / 页面分层：src/domain 与 src/ui</span>
          <button
            onClick={() => {
              store.resetDemo();
              setForm(emptyForm());
              notify("已恢复内置示例数据");
            }}
          >
            重置示例数据
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        <Metric label="待加工处方" value={metrics.pending} tone="status-ok" />
        <Metric label="待复核（瞳距异常）" value={metrics.review} tone="status-watch" />
        <Metric label="加工中（已冻结）" value={metrics.processing} tone="status-danger" />
        <Metric label="已加工（可修订）" value={metrics.processed} tone="status-ok" />
      </section>

      <section className={`consistency-bar ${consistency.length === 0 ? "ok" : "bad"}`}>
        {consistency.length === 0 ? (
          <span>✓ 刷新核验通过：处方、同眼别占用、加工单冻结快照、版本链完全一致（数据持久化于本地浏览器）</span>
        ) : (
          <details>
            <summary>⚠ 发现 {consistency.length} 项一致性问题（点击展开）</summary>
            <ul>
              {consistency.map((problem, i) => (
                <li key={i}>{problem}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="workspace">
        <aside className="panel narrow issue-panel">
          <h2>下达处方</h2>
          <PrescriptionForm
            values={form}
            onChange={setForm}
            submitLabel="下达处方"
            onSubmit={(draft) => {
              const result = store.issue(draft);
              notify(result.message ?? (result.ok ? "下达成功" : "下达失败"), result.ok ? "ok" : "err");
              if (result.ok) setForm(emptyForm());
            }}
          />
        </aside>

        <section className="panel">
          <div className="tab-bar">
            <button
              className={tab === "rx" ? "active" : ""}
              onClick={() => setTab("rx")}
            >
              处方与版本链（{state.prescriptions.length}）
            </button>
            <button
              className={tab === "jobs" ? "active" : ""}
              onClick={() => setTab("jobs")}
            >
              加工单核验（{state.jobs.length}）
            </button>
          </div>

          {tab === "rx" ? (
            <PrescriptionList
              state={state}
              onApprove={(id) => {
                const r = store.approveReview(id);
                notify(r.message ?? "", r.ok ? "ok" : "err");
              }}
              onStart={(id) => {
                const r = store.startJob(id);
                notify(r.message ?? "", r.ok ? "ok" : "err");
              }}
              onAmend={(rx) => setAmending(rx)}
              onRevise={(rx) => setRevising(rx)}
            />
          ) : (
            <JobBoard
              state={state}
              onComplete={(jobId) => {
                const r = store.completeJob(jobId);
                notify(r.message ?? "", r.ok ? "ok" : "err");
              }}
            />
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
