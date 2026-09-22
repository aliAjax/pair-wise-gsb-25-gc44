// 处方下达 / 待加工编辑表单：仅负责采集草稿，阻断判定在 domain/rules。

import { useEffect, useMemo, useState } from "react";
import {
  AppState,
  FieldIssue,
  FormField,
  LensParams,
  Prescription,
  PrescriptionDraft,
} from "../domain/types";
import { AXIS_MAX, AXIS_MIN, PD_MAX, PD_MIN, draftToParams, evaluateIssue, validateParams } from "../domain/rules";
import { eyeLabel, kindLabel } from "./format";

interface Props {
  state: AppState;
  editing: Prescription | null;
  onSubmit: (draft: PrescriptionDraft, editingId: string | null) => void;
  onCancelEdit: () => void;
}

const PARAM_FIELDS: {
  key: keyof LensParams;
  label: string;
  unit: string;
  placeholder: string;
  progressiveOnly?: boolean;
  hint?: string;
}[] = [
  { key: "sphere", label: "球镜 S", unit: "D", placeholder: "如 -2.75" },
  { key: "cylinder", label: "柱镜 C", unit: "D", placeholder: "无散光填 0" },
  { key: "axis", label: "轴位", unit: "°", placeholder: `${AXIS_MIN}~${AXIS_MAX}`, hint: "有柱镜必填" },
  { key: "pd", label: "瞳距 PD", unit: "mm", placeholder: `${PD_MIN}~${PD_MAX}`, hint: "越界须复核" },
  { key: "add", label: "下加光 ADD", unit: "D", placeholder: "如 +1.50", progressiveOnly: true, hint: "渐进片开工前必填" },
  { key: "segHeight", label: "瞳高 H", unit: "mm", placeholder: "如 22", progressiveOnly: true, hint: "渐进片开工前必填" },
];

function rxToDraft(rx: Prescription): PrescriptionDraft {
  const p = rx.params;
  const str = (v: number | null) => (v === null ? "" : String(v));
  return {
    patientId: rx.patientId,
    eye: rx.eye,
    lensKind: rx.lensKind,
    reviseReason: "",
    sphere: str(p.sphere),
    cylinder: str(p.cylinder),
    axis: str(p.axis),
    pd: str(p.pd),
    add: str(p.add),
    segHeight: str(p.segHeight),
  };
}

export function PrescriptionForm({ state, editing, onSubmit, onCancelEdit }: Props) {
  const [draft, setDraft] = useState<PrescriptionDraft>(() =>
    editing ? rxToDraft(editing) : {
      patientId: "",
      eye: "OD",
      lensKind: "single",
      reviseReason: "",
      sphere: "", cylinder: "", axis: "", pd: "", add: "", segHeight: "",
    }
  );

  // 仅在编辑目标切换（含退出修改）时同步草稿，普通输入不重置
  const editingId = editing?.id ?? null;
  useEffect(() => {
    setDraft(
      editing
        ? rxToDraft(editing)
        : {
            patientId: "",
            eye: "OD",
            lensKind: "single",
            reviseReason: "",
            sphere: "", cylinder: "", axis: "", pd: "", add: "", segHeight: "",
          }
    );
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const evaluation = useMemo(
    () => evaluateIssue(state, draft, { revisingId: editingId ?? undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, draft, editingId]
  );
  const liveParams = useMemo(() => draftToParams(draft), [draft]);
  const liveCheck = useMemo(
    () => validateParams(liveParams, draft.lensKind, "issue"),
    [liveParams, draft.lensKind]
  );

  const issueMap = new Map<FormField, string>();
  evaluation.issues.forEach((i: FieldIssue) => issueMap.set(i.field, i.message));
  const warnMap = new Map<FormField, string>();
  [...evaluation.warnings, ...liveCheck.warnings].forEach((i) => {
    if (!issueMap.has(i.field)) warnMap.set(i.field, i.message);
  });

  const set = (key: keyof PrescriptionDraft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = () => onSubmit(draft, editingId);

  return (
    <section className="panel form-panel">
      <div className="section-heading">
        <div>
          <p>处方下达</p>
          <h2>{editing ? `修改待加工处方 ${editing.id}` : "新建验光处方"}</h2>
        </div>
        {editing && (
          <button onClick={onCancelEdit}>退出修改</button>
        )}
      </div>

      <div className="form-grid">
        <label className={issueMap.has("patientId") ? "field-error" : ""}>
          <span>患者编号 *</span>
          <input
            value={draft.patientId}
            onChange={set("patientId")}
            placeholder="如 Patient-144"
            disabled={!!editing}
          />
          {issueMap.has("patientId") && <em className="err">{issueMap.get("patientId")}</em>}
        </label>

        <label>
          <span>眼别 *</span>
          <div className="seg">
            {(["OD", "OS"] as const).map((e) => (
              <button
                type="button"
                key={e}
                className={draft.eye === e ? "seg-on" : ""}
                onClick={() => setDraft((d) => ({ ...d, eye: e }))}
              >
                {eyeLabel(e)}
              </button>
            ))}
          </div>
        </label>

        <label>
          <span>镜片类型 *</span>
          <div className="seg">
            {(["single", "progressive"] as const).map((k) => (
              <button
                type="button"
                key={k}
                className={draft.lensKind === k ? "seg-on" : ""}
                onClick={() => setDraft((d) => ({ ...d, lensKind: k }))}
              >
                {kindLabel(k)}
              </button>
            ))}
          </div>
        </label>

        {PARAM_FIELDS.filter((f) => !f.progressiveOnly || draft.lensKind === "progressive").map((f) => (
          <label
            key={f.key}
            className={issueMap.has(f.key) ? "field-error" : warnMap.has(f.key) ? "field-warn" : ""}
          >
            <span>
              {f.label} <i>{f.unit}</i>
              {f.hint && <small>{f.hint}</small>}
            </span>
            <input
              value={draft[f.key]}
              onChange={set(f.key)}
              placeholder={f.placeholder}
              inputMode="decimal"
            />
            {issueMap.has(f.key) && <em className="err">{issueMap.get(f.key)}</em>}
            {!issueMap.has(f.key) && warnMap.has(f.key) && <em className="warn">{warnMap.get(f.key)}</em>}
          </label>
        ))}
      </div>

      <div className="form-footer">
        <div className="form-rules">
          {evaluation.warnings.length > 0 && (
            <span className="badge badge-warn">{evaluation.warnings.length} 项复核提醒</span>
          )}
          {evaluation.issues.length > 0 && (
            <span className="badge badge-err">阻断：{evaluation.issues.length} 项待处理</span>
          )}
          {evaluation.canIssue && (
            <span className="badge badge-ok">规则校验通过，可{editing ? "保存" : "下达"}</span>
          )}
        </div>
        <div className="form-actions">
          {!editing && (
            <button
              onClick={() =>
                setDraft({ patientId: "", eye: "OD", lensKind: "single", reviseReason: "", sphere: "", cylinder: "", axis: "", pd: "", add: "", segHeight: "" })
              }
            >
              清空
            </button>
          )}
          <button className="primary-action" disabled={!evaluation.canIssue} onClick={submit}>
            {editing ? "保存修改" : "下达处方"}
          </button>
        </div>
      </div>
    </section>
  );
}
