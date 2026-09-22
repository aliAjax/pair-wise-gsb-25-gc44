import { useMemo, useState } from "react";
import type { EyeSide, LensKind, Prescription } from "../domain/types";
import {
  AXIS_MAX,
  AXIS_MIN,
  PD_MAX,
  PD_MIN,
  validateDraft,
  type PrescriptionDraft,
  type RuleIssue,
} from "../domain/rules";

export interface FormValues {
  patientId: string;
  patientName: string;
  eye: EyeSide;
  sphere: string;
  cylinder: string;
  axis: string;
  pd: string;
  lensKind: LensKind;
  add: string;
  ph: string;
  note: string;
}

export function emptyForm(): FormValues {
  return {
    patientId: "",
    patientName: "",
    eye: "OD",
    sphere: "",
    cylinder: "0",
    axis: "",
    pd: "",
    lensKind: "single",
    add: "",
    ph: "",
    note: "",
  };
}

export function formFromPrescription(rx: Prescription): FormValues {
  return {
    patientId: rx.patientId,
    patientName: rx.patientName,
    eye: rx.eye,
    sphere: String(rx.sphere),
    cylinder: String(rx.cylinder),
    axis: rx.axis === null ? "" : String(rx.axis),
    pd: String(rx.pd),
    lensKind: rx.lensKind,
    add: rx.add === null ? "" : String(rx.add),
    ph: rx.ph === null ? "" : String(rx.ph),
    note: rx.note,
  };
}

function toDraft(values: FormValues): PrescriptionDraft {
  return {
    patientId: values.patientId,
    patientName: values.patientName,
    eye: values.eye,
    sphere: parseFloat(values.sphere),
    cylinder: parseFloat(values.cylinder),
    axis: values.axis.trim() === "" ? null : parseInt(values.axis, 10),
    pd: parseFloat(values.pd),
    lensKind: values.lensKind,
    add: values.add.trim() === "" ? null : parseFloat(values.add),
    ph: values.ph.trim() === "" ? null : parseFloat(values.ph),
    note: values.note,
  };
}

const FIELD_LABELS: Record<RuleIssue["field"], string> = {
  patientId: "patientId",
  patientName: "patientName",
  sphere: "sphere",
  cylinder: "cylinder",
  axis: "axis",
  pd: "pd",
  add: "add",
  ph: "ph",
  revisionReason: "revisionReason",
};

interface Props {
  values: FormValues;
  onChange: (next: FormValues) => void;
  onSubmit: (draft: PrescriptionDraft) => void;
  submitLabel: string;
  /** 修订模式下患者与眼别锁定为原处方 */
  lockPatient?: boolean;
  reasonSlot?: React.ReactNode;
}

export function PrescriptionForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  lockPatient = false,
  reasonSlot,
}: Props) {
  const [submitted, setSubmitted] = useState(false);

  const issues = useMemo(() => validateDraft(toDraft(values)), [values]);
  const blockMap = new Map<string, RuleIssue>();
  const warnMap = new Map<string, RuleIssue>();
  for (const issue of issues) {
    if (issue.level === "block") blockMap.set(FIELD_LABELS[issue.field], issue);
    else warnMap.set(FIELD_LABELS[issue.field], issue);
  }
  const hasBlock = blockMap.size > 0;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    onChange({ ...values, [key]: value });

  const showError = (field: RuleIssue["field"]) =>
    submitted && blockMap.get(FIELD_LABELS[field])?.message;
  const warning = (field: RuleIssue["field"]) =>
    warnMap.get(FIELD_LABELS[field])?.message;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!hasBlock) onSubmit(toDraft(values));
  };

  const astigmatic = Math.abs(parseFloat(values.cylinder) || 0) > 1e-9;
  const progressive = values.lensKind === "progressive";

  return (
    <form className="rx-form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <label className={showError("patientId") ? "invalid" : ""}>
          <span>患者编号 *</span>
          <input
            value={values.patientId}
            disabled={lockPatient}
            placeholder="如 Patient-233"
            onChange={(e) => set("patientId", e.target.value)}
          />
          {showError("patientId") && <em className="field-error">{showError("patientId")}</em>}
        </label>
        <label className={showError("patientName") ? "invalid" : ""}>
          <span>患者姓名 *</span>
          <input
            value={values.patientName}
            disabled={lockPatient}
            placeholder="如 周明朗"
            onChange={(e) => set("patientName", e.target.value)}
          />
          {showError("patientName") && <em className="field-error">{showError("patientName")}</em>}
        </label>
      </div>

      <div className="form-row">
        <label>
          <span>眼别 *</span>
          <div className="seg">
            {(["OD", "OS"] as EyeSide[]).map((eye) => (
              <button
                type="button"
                key={eye}
                className={values.eye === eye ? "active" : ""}
                disabled={lockPatient}
                onClick={() => set("eye", eye)}
              >
                {eye === "OD" ? "右眼 OD" : "左眼 OS"}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>镜片品类</span>
          <div className="seg">
            <button
              type="button"
              className={values.lensKind === "single" ? "active" : ""}
              onClick={() => set("lensKind", "single")}
            >
              单光片
            </button>
            <button
              type="button"
              className={values.lensKind === "progressive" ? "active" : ""}
              onClick={() => set("lensKind", "progressive")}
            >
              渐进片
            </button>
          </div>
        </label>
      </div>

      <div className="form-row three">
        <label className={showError("sphere") ? "invalid" : ""}>
          <span>球镜 S (D) *</span>
          <input
            type="number"
            step="0.25"
            value={values.sphere}
            placeholder="-2.75"
            onChange={(e) => set("sphere", e.target.value)}
          />
          {showError("sphere") && <em className="field-error">{showError("sphere")}</em>}
        </label>
        <label className={showError("cylinder") ? "invalid" : ""}>
          <span>柱镜 C (D)</span>
          <input
            type="number"
            step="0.25"
            value={values.cylinder}
            onChange={(e) => set("cylinder", e.target.value)}
          />
          {showError("cylinder") && <em className="field-error">{showError("cylinder")}</em>}
        </label>
        <label
          className={[
            showError("axis") ? "invalid" : "",
            warning("axis") ? "warn" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span>轴位（{AXIS_MIN}~{AXIS_MAX}°）{astigmatic ? " *" : ""}</span>
          <input
            type="number"
            min={AXIS_MIN}
            max={AXIS_MAX}
            step="1"
            value={values.axis}
            disabled={!astigmatic}
            placeholder={astigmatic ? "有柱镜必填" : "无柱镜免填"}
            onChange={(e) => set("axis", e.target.value)}
          />
          {showError("axis") && <em className="field-error">{showError("axis")}</em>}
        </label>
      </div>

      <div className={"form-row " + (progressive ? "three" : "")}>
        <label
          className={[
            showError("pd") ? "invalid" : "",
            warning("pd") ? "warn" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span>瞳距 PD (mm) · 正常 {PD_MIN}~{PD_MAX}</span>
          <input
            type="number"
            step="1"
            value={values.pd}
            placeholder="如 62"
            onChange={(e) => set("pd", e.target.value)}
          />
          {showError("pd") && <em className="field-error">{showError("pd")}</em>}
          {!showError("pd") && warning("pd") && (
            <em className="field-warn">{warning("pd")}</em>
          )}
        </label>
        {progressive && (
          <>
            <label className={showError("add") ? "invalid" : ""}>
              <span>下加光 ADD (D) *</span>
              <input
                type="number"
                step="0.25"
                value={values.add}
                placeholder="渐进片必填，如 +1.50"
                onChange={(e) => set("add", e.target.value)}
              />
              {showError("add") && <em className="field-error">{showError("add")}</em>}
            </label>
            <label className={showError("ph") ? "invalid" : ""}>
              <span>瞳高 PH (mm) *</span>
              <input
                type="number"
                step="1"
                value={values.ph}
                placeholder="渐进片必填"
                onChange={(e) => set("ph", e.target.value)}
              />
              {showError("ph") && <em className="field-error">{showError("ph")}</em>}
            </label>
          </>
        )}
      </div>

      <label>
        <span>备注</span>
        <input
          value={values.note}
          placeholder="可选"
          onChange={(e) => set("note", e.target.value)}
        />
      </label>

      {reasonSlot}

      <button className="primary-action" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
