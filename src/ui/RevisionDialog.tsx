import { useState } from "react";
import type { Prescription } from "../domain/types";
import type { PrescriptionDraft } from "../domain/rules";
import {
  PrescriptionForm,
  formFromPrescription,
  type FormValues,
} from "./PrescriptionForm";
import { formatPowerLine, formatTime } from "./format";
import { EYE_SIDE_LABEL, LENS_KIND_LABEL } from "../domain/types";

interface Props {
  source: Prescription;
  onClose: () => void;
  onSubmit: (draft: PrescriptionDraft, reason: string) => { ok: boolean; message?: string };
}

/** 已加工处方修订：旧值只读展示并原样保留，必须填写修订原因 */
export function RevisionDialog({ source, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>(formFromPrescription(source));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (draft: PrescriptionDraft) => {
    if (!reason.trim()) {
      setError("修订必须填写原因");
      return;
    }
    const result = onSubmit(draft, reason);
    if (!result.ok) {
      setError(result.message ?? "修订失败");
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p>修订处方 · 旧值原样保留</p>
            <h2>{source.patientId} {source.patientName} · {EYE_SIDE_LABEL[source.eye]} · v{source.version}</h2>
          </div>
          <button type="button" onClick={onClose}>关闭</button>
        </div>

        <div className="old-values">
          <span>旧值（只读归档）</span>
          <strong>{formatPowerLine(source)}</strong>
          <p>
            {LENS_KIND_LABEL[source.lensKind]} · 下达于 {formatTime(source.createdAt)}
            {source.revisionReason ? ` · 上轮修订原因：${source.revisionReason}` : ""}
          </p>
        </div>

        <PrescriptionForm
          values={values}
          onChange={setValues}
          onSubmit={handleSubmit}
          submitLabel={`创建 v${source.version + 1} 修订处方`}
          lockPatient
          reasonSlot={
            <label className={error && !reason.trim() ? "invalid" : ""}>
              <span>修订原因 *</span>
              <input
                value={reason}
                placeholder="如 复查度数变化 / 佩戴不适返工"
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
              />
            </label>
          }
        />
        {error && <p className="banner error">{error}</p>}
      </div>
    </div>
  );
}
