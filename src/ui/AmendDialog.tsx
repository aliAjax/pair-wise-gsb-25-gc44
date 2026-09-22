import { useState } from "react";
import type { Prescription } from "../domain/types";
import type { PrescriptionDraft } from "../domain/rules";
import {
  PrescriptionForm,
  formFromPrescription,
  type FormValues,
} from "./PrescriptionForm";
import { EYE_SIDE_LABEL } from "../domain/types";

interface Props {
  source: Prescription;
  onClose: () => void;
  onSubmit: (id: string, draft: PrescriptionDraft) => { ok: boolean; message?: string };
}

/** 待加工 / 待复核处方开工前补录：加工单引用前最后一次修改机会，引用后即冻结 */
export function AmendDialog({ source, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>(formFromPrescription(source));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (draft: PrescriptionDraft) => {
    const result = onSubmit(source.id, draft);
    if (!result.ok) setError(result.message ?? "保存失败");
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p>开工前补录 · 引用加工单前可修改</p>
            <h2>
              {source.patientId} {source.patientName} · {EYE_SIDE_LABEL[source.eye]} · v{source.version}
            </h2>
          </div>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        <p className="banner warn">
          此为加工单引用前的最后修改机会；一旦下达加工单，处方参数立即冻结，仅可在完工后带原因修订。
          渐进片请在此补齐加光 ADD 与瞳高 PH。
        </p>
        <PrescriptionForm
          values={values}
          onChange={setValues}
          onSubmit={handleSubmit}
          submitLabel="保存补录参数"
          lockPatient
        />
        {error && <p className="banner error">{error}</p>}
      </div>
    </div>
  );
}
