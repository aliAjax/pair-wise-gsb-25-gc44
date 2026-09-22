import assert from "node:assert";
import { RxStore } from "../src/domain/store";
import { seedState } from "../src/domain/seed";
import {
  checkConsistency,
  issueBlockingIssues,
  validateDraft,
} from "../src/domain/rules";
import type { PrescriptionDraft } from "../src/domain/rules";
import type { AppState, Prescription } from "../src/domain/types";

let passed = 0;
const ok = (name: string, cond: boolean, extra?: string) => {
  assert.ok(cond, `${name}${extra ? " :: " + extra : ""}`);
  passed++;
  console.log(`  ✓ ${name}`);
};

const draft = (over: Partial<PrescriptionDraft> = {}): PrescriptionDraft => ({
  patientId: "P-1",
  patientName: "测试者",
  eye: "OD",
  sphere: -2.0,
  cylinder: 0,
  axis: null,
  pd: 62,
  lensKind: "single",
  add: null,
  ph: null,
  note: "",
  ...over,
});

const fresh = (): RxStore => {
  const s: AppState = JSON.parse(JSON.stringify({ prescriptions: [], jobs: [] }));
  return new RxStore(s);
};

console.log("1. 字段规则");
ok("无柱镜不要求轴位", validateDraft(draft()).every((i) => i.field !== "axis"));
ok("有柱镜缺轴位阻断", validateDraft(draft({ cylinder: -1 })).some((i) => i.field === "axis" && i.level === "block"));
ok("轴位 181 阻断", validateDraft(draft({ cylinder: -1, axis: 181 })).some((i) => i.field === "axis"));
ok("轴位 0 合法", !validateDraft(draft({ cylinder: -1, axis: 0 })).some((i) => i.field === "axis"));
ok("瞳距 49 警告不阻断", (() => {
  const issues = validateDraft(draft({ pd: 49 }));
  return issues.some((i) => i.field === "pd" && i.level === "warn") && !issues.some((i) => i.level === "block");
})());
ok("瞳距 80 合法", !validateDraft(draft({ pd: 80 })).length);
ok("渐进片缺加光/瞳高：下达不阻断、开工阻断", (() => {
  const issues = validateDraft(draft({ lensKind: "progressive", add: null, ph: null }));
  const atIssue = issueBlockingIssues(issues);
  return (
    issues.some((i) => i.field === "add") &&
    issues.some((i) => i.field === "ph") &&
    atIssue.length === 0
  );
})());
ok("渐进片补齐后通过", !validateDraft(draft({ lensKind: "progressive", add: 1.5, ph: 22 })).length);
ok("球镜步进 0.25 校验", validateDraft(draft({ sphere: -2.1 })).some((i) => i.field === "sphere"));

console.log("2. 下达与占用");
let store = fresh();
let r = store.issue(draft());
ok("正常下达成功", r.ok, r.message);
ok("首单进入待加工", store.getState().prescriptions[0].status === "pending");
r = store.issue(draft());
ok("同患者同眼别重复下达被拒", !r.ok);
r = store.issue(draft({ eye: "OS" }));
ok("同患者另一眼可下达", r.ok);
store = fresh();
store.issue(draft({ pd: 82 }));
ok("瞳距超限自动待复核", store.getState().prescriptions[0].status === "review");
r = store.issue(draft({ pd: 60 }));
ok("待复核仍占用名额", !r.ok);
r = store.startJob(store.getState().prescriptions[0].id);
ok("待复核不能开工", !r.ok);
r = store.approveReview(store.getState().prescriptions[0].id);
ok("复核通过", r.ok && store.getState().prescriptions[0].status === "pending");
r = store.startJob(store.getState().prescriptions[0].id);
ok("复核后可开工", r.ok, r.message);

console.log("2b. 渐进片缺瞳高：下达→开工阻断→补录→放行");
store = fresh();
r = store.issue(draft({ lensKind: "progressive", add: 1.5, ph: null }));
ok("缺瞳高可下达", r.ok, r.message);
const progId = store.getState().prescriptions[0].id;
r = store.startJob(progId);
ok("缺瞳高不得开工", !r.ok);
r = store.amendPending(progId, draft({ lensKind: "progressive", add: 1.5, ph: 21 }));
ok("补录瞳高成功", r.ok, r.message);
r = store.startJob(progId);
ok("补录后可开工", r.ok, r.message);
r = store.amendPending(progId, draft({ lensKind: "progressive", add: 1.5, ph: 21 }));
ok("冻结后禁止补录", !r.ok);

console.log("3. 加工冻结");
const processingId = store.getState().prescriptions[0].id;
const jobId = store.getState().prescriptions[0].jobId!;
ok("开工后处方加工中", store.getState().prescriptions[0].status === "processing");
r = store.startJob(processingId);
ok("加工中不可重复开工", !r.ok);
// 模拟外部篡改：状态机没有提供修改参数的入口，直接验证不变量能发现篡改
const tampered: AppState = JSON.parse(JSON.stringify(store.getState()));
(tampered.prescriptions[0] as Prescription).sphere = -9;
ok("一致性核验能发现快照被改", checkConsistency(tampered).some((m) => m.includes("sphere")));
r = store.completeJob(jobId);
ok("完工后处方已加工", r.ok && store.getState().prescriptions[0].status === "processed");
r = store.completeJob(jobId);
ok("加工单不可重复完工", !r.ok);

console.log("4. 修订与版本链");
r = store.revise(processingId, draft({ sphere: -2.25 }), "");
ok("修订缺原因被拒", !r.ok);
r = store.revise(processingId, draft({ sphere: -2.25 }), "复查度数变化");
ok("带原因修订成功", r.ok, r.message);
const list = store.getState().prescriptions;
ok("旧版保留并标记已修订", list.find((p) => p.id === processingId)!.status === "superseded");
const rev = list.find((p) => p.id !== processingId && p.eye === "OD")!;
ok("新版本号 v2", rev.version === 2);
ok("新版本关联旧版", rev.supersedesId === processingId && rev.revisionReason === "复查度数变化");
ok("同 rootId 版本链", rev.rootId === list.find((p) => p.id === processingId)!.rootId);
r = store.issue(draft({ patientId: "P-1", eye: "OD", pd: 60 }));
ok("修订后同眼别仍不可重复占用", !r.ok);

console.log("5. 种子数据一致性");
const seedProblems = checkConsistency(seedState);
ok("种子数据零一致性问题", seedProblems.length === 0, seedProblems.join(" | "));

console.log(`\n全部 ${passed} 项通过`);
