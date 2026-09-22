// 业务不变量冒烟测试（无断言库，手工计数）。
import { reducer, initialState, auditState } from "../src/domain/reducer";
import { seedState } from "../src/domain/seed";
import {
  validateParams,
  evaluateStart,
  selectOccupations,
  selectVersionChain,
  blankDraft,
} from "../src/domain/rules";
import { PrescriptionDraft, LensParams } from "../src/domain/types";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✕ ${name} ${detail}`);
  }
}

const draft = (over: Partial<PrescriptionDraft> = {}): PrescriptionDraft => ({
  ...blankDraft(),
  sphere: "-2.00",
  cylinder: "0",
  pd: "62",
  ...over,
});

const run = (s: any, action: any) => {
  const out = reducer(s, action);
  return { ...out, ok: out.result.ok, message: out.result.message };
};

console.log("1) 轴位 / 柱镜规则");
{
  const noCylNoAxis = validateParams(
    { sphere: -2, cylinder: 0, axis: null, pd: 62, add: null, segHeight: null },
    "single",
    "issue"
  );
  check("无柱镜不填轴位可下达", noCylNoAxis.issues.length === 0);

  const cylNoAxis = validateParams(
    { sphere: -2, cylinder: -0.75, axis: null, pd: 62, add: null, segHeight: null },
    "single",
    "issue"
  );
  check("有柱镜缺轴位被阻断", cylNoAxis.issues.some((i) => i.field === "axis"));

  const axisBad = validateParams(
    { sphere: -2, cylinder: -0.75, axis: 181, pd: 62, add: null, segHeight: null },
    "single",
    "issue"
  );
  check("轴位 181 超出 0~180 被阻断", axisBad.issues.some((i) => i.field === "axis"));

  const axis0 = validateParams(
    { sphere: -2, cylinder: -0.75, axis: 0, pd: 62, add: null, segHeight: null },
    "single",
    "issue"
  );
  check("轴位 0 合法（边界）", axis0.issues.length === 0);

  const axis180 = validateParams(
    { sphere: -2, cylinder: -0.75, axis: 180, pd: 62, add: null, segHeight: null },
    "single",
    "issue"
  );
  check("轴位 180 合法（边界）", axis180.issues.length === 0);
}

console.log("2) 瞳距 50~80 复核规则");
{
  const r1 = run(initialState, { type: "issue", draft: draft({ patientId: "P1", pd: "48" }) });
  check("PD 48 可下达但需复核", r1.ok && r1.state.prescriptions[0].reviewRequired);

  const blocked = run(r1.state, { type: "createOrder", prescriptionId: r1.state.prescriptions[0].id });
  check("待复核时不能下达加工单", !blocked.ok);

  const resolved = run(r1.state, { type: "resolveReview", id: r1.state.prescriptions[0].id });
  const nowOk = run(resolved.state, { type: "createOrder", prescriptionId: r1.state.prescriptions[0].id });
  check("复核通过后可下达加工单", nowOk.ok && nowOk.state.orders[0].status === "queued");

  const r2 = run(initialState, { type: "issue", draft: draft({ patientId: "P2", pd: "81" }) });
  check("PD 81 需复核", r2.state.prescriptions[0].reviewRequired);

  const r3 = run(initialState, { type: "issue", draft: draft({ patientId: "P3", pd: "50" }) });
  check("PD 50 边界不复核", r3.ok && !r3.state.prescriptions[0].reviewRequired);
}

console.log("3) 同患者同眼别唯一占用");
{
  const r1 = run(initialState, { type: "issue", draft: draft({ patientId: "P9", eye: "OD" }) });
  const r2 = run(r1.state, { type: "issue", draft: draft({ patientId: "P9", eye: "OD", sphere: "-3" }) });
  check("重复待加工被阻断", !r2.ok);

  const r3 = run(r1.state, { type: "issue", draft: draft({ patientId: "P9", eye: "OS" }) });
  check("同患者另一眼可下达", r3.ok);

  const r4 = run(r3.state, { type: "issue", draft: draft({ patientId: "  P9  ", eye: "OD" }) });
  check("患者编号首尾空白归一后仍冲突（trim）", !r4.ok);

  const r5 = run(r3.state, { type: "issue", draft: draft({ patientId: "p9", eye: "OD" }) });
  check("患者编号大小写敏感（ID 按原样匹配）", r5.ok);
}

console.log("4) 加工单冻结 + 渐进片补参开工");
{
  // 单光：直接 queued -> in_progress
  let s = run(initialState, { type: "issue", draft: draft({ patientId: "P10", eye: "OD" }) }).state;
  const rxId = s.prescriptions[0].id;
  s = run(s, { type: "createOrder", prescriptionId: rxId }).state;
  const woId = s.orders[0].id;
  check("引用后处方冻结", s.prescriptions[0].status === "frozen");
  check("冻结快照是独立副本", s.orders[0].frozenParams !== s.prescriptions[0].params);

  // 渐进片缺 ADD / 瞳高
  const prog = run(s, {
    type: "issue",
    draft: draft({ patientId: "P10", eye: "OS", lensKind: "progressive" }),
  });
  check("渐进片下达时 ADD/瞳高不阻断", prog.ok);
  const progRx = prog.state.prescriptions.find((r: any) => r.eye === "OS")!;
  let s2 = run(prog.state, { type: "createOrder", prescriptionId: progRx.id }).state;
  const progOrder = s2.orders.find((o: any) => o.prescriptionId === progRx.id)!;
  const startBlocked = evaluateStart(progOrder);
  check("缺 ADD/瞳高不得开工", !startBlocked.canStart && startBlocked.missingProgressive.length === 2);

  const badSupp = run(s2, { type: "supplementOrder", orderId: progOrder.id, patch: { add: 0 } });
  check("非正 ADD 被拒", !badSupp.ok);

  s2 = run(s2, { type: "supplementOrder", orderId: progOrder.id, patch: { add: 1.5, segHeight: 22 } }).state;
  const updated = s2.orders.find((o: any) => o.id === progOrder.id)!;
  check("补参写入冻结快照", updated.frozenParams.add === 1.5 && updated.frozenParams.segHeight === 22);
  check("补参后可开工", run(s2, { type: "startOrder", orderId: progOrder.id }).ok);
}

console.log("5) 已加工只能带原因修订，版本链保留旧值");
{
  let s = run(initialState, { type: "issue", draft: draft({ patientId: "P11", eye: "OD" }) }).state;
  s = run(s, { type: "createOrder", prescriptionId: s.prescriptions[0].id }).state;
  s = run(s, { type: "startOrder", orderId: s.orders[0].id }).state;
  s = run(s, { type: "completeOrder", orderId: s.orders[0].id, checkNote: "合格" }).state;
  const old = s.prescriptions[0];
  check("完工后处方 processed", old.status === "processed");

  const noReason = run(s, {
    type: "revise",
    sourceId: old.id,
    draft: draft({ patientId: "P11", eye: "OD", sphere: "-2.5", reviseReason: "  " }),
  });
  check("无原因修订被阻断", !noReason.ok);

  const revise = run(s, {
    type: "revise",
    sourceId: old.id,
    draft: draft({ patientId: "P11", eye: "OD", sphere: "-2.5", reviseReason: "近视加深" }),
  });
  check("带原因修订成功", revise.ok);
  s = revise.state;
  const oldAgain = s.prescriptions.find((r: any) => r.id === old.id)!;
  const newer = s.prescriptions.find((r: any) => r.id !== old.id)!;
  check("旧处方标记 superseded 且旧值保留", oldAgain.status === "superseded" && oldAgain.params.sphere === -2);
  check("新处方为 pending v2 且接回版本链", newer.status === "pending" && newer.version === 2 && newer.prevId === old.id && newer.rootId === old.rootId);
  check("新处方带修订原因", newer.reviseReason === "近视加深");

  const chain = selectVersionChain(s, old.rootId);
  check("版本链可派生 v1→v2", chain.length === 2 && chain[0].version === 1 && chain[1].version === 2);

  // v2 还在加工，旧版不能再发起修订链？实际允许：v1 是 superseded，按钮禁用；reducer 也拒绝 superseded 发起
  const fromOld = run(s, {
    type: "revise",
    sourceId: old.id,
    draft: draft({ patientId: "P11", eye: "OD", sphere: "-3", reviseReason: "x" }),
  });
  check("不能从已修订版本再修订", !fromOld.ok);
}

console.log("6) 待加工处方可直接修改，冻结后不可改");
{
  let s = run(initialState, { type: "issue", draft: draft({ patientId: "P12", eye: "OD", sphere: "-1" }) }).state;
  const id = s.prescriptions[0].id;
  const upd = run(s, { type: "updatePending", id, draft: draft({ patientId: "P12", eye: "OD", sphere: "-1.5" }) });
  check("待加工可改参数", upd.ok && upd.state.prescriptions[0].params.sphere === -1.5);

  s = upd.state;
  s = run(s, { type: "createOrder", prescriptionId: id }).state;
  const frozenUpd = run(s, { type: "updatePending", id, draft: draft({ patientId: "P12", eye: "OD", sphere: "-9" }) });
  check("冻结后不可直接改", !frozenUpd.ok && s.prescriptions[0].params.sphere === -1.5);
}

console.log("7) 刷新一致性：种子数据 + 审计 + 占用派生");
{
  const problems = auditState(seedState);
  check("种子数据审计无问题", problems.length === 0, problems.join("；"));
  const occ = selectOccupations(seedState);
  check("种子占用槽位为 2（P144-OS、P032-OS）", occ.size === 2 && occ.has("Patient-144::OS") && occ.has("Patient-032::OS"));

  // 手工构造冲突状态，审计必须发现
  const broken: any = {
    prescriptions: [
      { ...seedState.prescriptions[0], id: "X1", status: "pending", patientId: "Z", eye: "OD", orderId: null },
      { ...seedState.prescriptions[0], id: "X2", status: "pending", patientId: "Z", eye: "OD", orderId: null },
    ],
    orders: [],
  };
  check("审计能发现重复占用", auditState(broken).some((p) => p.includes("占用冲突")));
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
