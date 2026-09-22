import type { AppState, ProcessingJob } from "../domain/types";
import { EYE_SIDE_LABEL, LENS_KIND_LABEL } from "../domain/types";
import { isSnapshotFrozen } from "../domain/rules";
import { formatPowerLine, formatTime } from "./format";

interface Props {
  state: AppState;
  onComplete: (jobId: string) => void;
}

function JobCard({
  job,
  state,
  onComplete,
}: {
  job: ProcessingJob;
  state: AppState;
  onComplete: (jobId: string) => void;
}) {
  const live = state.prescriptions.find((p) => p.id === job.snapshot.id);
  const frozen = live ? isSnapshotFrozen(live, job) : false;

  return (
    <article className={`job-card ${job.status}`}>
      <header className="rx-head">
        <div>
          <h3>
            {job.id}
            <span className="eye-tag">{EYE_SIDE_LABEL[job.eye]}</span>
          </h3>
          <p className="rx-meta">
            {job.patientId} · {job.patientName} · 引用处方 v{job.snapshot.version}
          </p>
        </div>
        <span className={`status-pill ${job.status === "done" ? "st-processed" : "st-processing"}`}>
          {job.status === "queued" ? "加工中" : "已完工"}
        </span>
      </header>

      <div className="snapshot-box">
        <span>冻结参数快照 · {LENS_KIND_LABEL[job.snapshot.lensKind]}</span>
        <strong>{formatPowerLine(job.snapshot)}</strong>
        <p>
          下达 {formatTime(job.createdAt)} · 完工 {formatTime(job.finishedAt)}
        </p>
      </div>

      <p className={`banner ${frozen ? "frozen" : "error"}`}>
        {frozen
          ? "🔒 快照与现处方参数一致，冻结有效"
          : "⚠ 快照与现处方不一致，冻结可能被破坏"}
      </p>

      {job.status === "queued" && (
        <footer className="rx-actions">
          <button className="primary-action" onClick={() => onComplete(job.id)}>
            核验完工
          </button>
        </footer>
      )}
    </article>
  );
}

export function JobBoard({ state, onComplete }: Props) {
  const jobs = [...state.jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="job-list">
      {jobs.length === 0 && <p className="empty-tip">尚无加工单。</p>}
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} state={state} onComplete={onComplete} />
      ))}
    </div>
  );
}
