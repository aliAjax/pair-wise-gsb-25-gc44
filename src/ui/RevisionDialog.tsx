// 修订弹窗：已加工处方只能带原因新建修订，旧值保留在版本链中。

import { useMemo, useState } from "react";
import { AppState, LensParams, Prescription, PrescriptionDraft } from "../domain/types";
import { evaluateIssue } from "../domain/rules";

interface Props {
  state: AppState;
  source: Prescription;
  onConfirm: (sourceId: string, draft: PrescriptionDraft) => void;
  onClose: () => void;
}

function rxToDraft(rx: Prescription, reason: string): PrescriptionDraft {
  const str = (v: number | null) => (v === null ? "" : String(v));
  const p = rx.params;
  return {
    patientId: rx.patientId,
    eye: rx.eye,
    lensKind: rx.lensKind,
    reviseReason: reason,
    sphere: str(p.sphere),
    cylinder: str(p.cylinder),
    axis: str(p.axis),
    pd: str(p.pd),
    add: str(p.add),
    segHeight: str(p.segHeight),
  };
}

const PARAM_LABEL: { key: keyof LensParams; label: string }[] = [
  { key: "sphere", label: "球镜 S (D)" },
  { key: "cylinder", label: "柱镜 C (D)" },
  { key: "axis", label: "轴位 (°)" },
  { key: "pd", label: "瞳距 (mm)" },
  { key: "add", label: "下加光 ADD (D)" },
  { key: "segHeight", label: "瞳高 (mm)" },
];

export function RevisionDialog({ state, source, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<PrescriptionDraft>(() => rxToDraft(source, ""));

  const evaluation = useMemo(
    () => evaluateIssue(state, { ...draft, reviseReason: reason }),
    [state, draft, reason]
  );

  // 旧版状态为 processed/superseded，不占 pending 槽位，修订版可正常占用该患者该眼别。
  const setNum = (key: keyof LensParams) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p>修订处方</p>
            <h2>基于 {source.id}（v{source.version}）新建版本</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <p className="modal-tip">
          旧处方参数将原样保留在版本链中，不可修改；修订版进入待加工并重新占用该患者该眼别。
        </p>

        <label className={reason.trim() ? "" : "field-error"}>
          <span>修订原因 *</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="如：三个月复查散光轴位变化"
          />
          {!reason.trim() && <em className="err">缺失原因不得新建修订</em>}
        </label>

        <div className="revise-grid">
          {PARAM_LABEL.filter(
            (f) => source.lensKind === "progressive" || (f.key !== "add" && f.key !== "segHeight")
          ).map((f) => {
            const oldVal = source.params[f.key];
            return (
              <label key={f.key}>
                <span>
                  {f.label} <small>旧值：{oldVal === null ? "—" : oldVal}</small>
                </span>
                <input value={draft[f.key]} onChange={setNum(f.key)} inputMode="decimal" />
              </label>
            );
          })}
        </div>

        {evaluation.issues.length > 0 && (
          <ul className="issue-list">
            {evaluation.issues.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        )}

        <div className="form-footer">
          <span className="muted">
            新版本号：v{source.version + 1} · {source.patientId} ·{" "}
            {source.eye === "OD" ? "右眼" : "左眼"}
          </span>
          <div className="form-actions">
            <button onClick={onClose}>取消</button>
            <button
              className="primary-action"
              disabled={!evaluation.canIssue || !reason.trim()}
              onClick={() => onConfirm(source.id, { ...draft, reviseReason: reason })}
            >
              确认修订
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
