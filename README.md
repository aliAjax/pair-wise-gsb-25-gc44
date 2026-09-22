# hxwl-11 处方下达与镜片加工核验台

由「眼科验光记录」扩展而来：处方下达、镜片加工冻结核验、已加工处方修订一体化。

## 技术栈

React + Vite + TypeScript + CSS（未新增任何依赖）

## 本地运行

```bash
npm install
npm run dev
```

开发端口：5111

## 分层结构（数据 / 判定规则 / 页面分开）

```
src/domain/            # 领域层，零 UI 依赖
  types.ts             # 数据模型：处方、加工单、状态枚举
  rules.ts             # 判定规则（纯函数）与一致性核验
  store.ts             # 状态机：下达/复核/补录/开工/完工/修订
  seed.ts              # 内置示例数据
src/ui/                # 页面层，只负责渲染与交互
  useAppState.ts       # React 绑定（useSyncExternalStore）
  PrescriptionForm.tsx # 下达/补录/修订共用表单
  PrescriptionList.tsx # 处方与版本链列表
  JobBoard.tsx         # 加工单与冻结快照核验台
  RevisionDialog.tsx   # 已加工处方带原因修订
  AmendDialog.tsx      # 开工前补录（渐进片加光/瞳高）
scripts/smoke.ts       # 领域规则与状态机冒烟测试（36 项）
```

冒烟测试（仅依赖 vite 自带的 esbuild，无需安装包）：

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke.mjs && node /tmp/smoke.mjs
```

## 业务规则

- 处方按**患者 + 眼别（OD 右眼 / OS 左眼）**记录球镜 S、柱镜 C、轴位 A、瞳距 PD。
- 有柱镜必须填轴位，轴位限 **0~180 度**；无柱镜轴位留空。
- 瞳距超出 **50~80mm** 自动进入**待复核**，复核通过后才可开工（待复核仍占用名额）。
- 同一患者同一眼别**至多一张在制处方**（待加工/待复核/加工中/已加工均占名额）。
- 加工单引用处方时冻结参数快照，处方转「加工中」，参数不可再改。
- 渐进片须补**加光 ADD 与瞳高 PH**，缺失不得开工；可在开工前补录。
- 已加工处方只能**带修订原因**新建下一版本，旧值原样保留（superseded），版本链按 rootId 串联。
- 页面顶部常驻**一致性核验条**：校验同眼别占用、处方↔加工单互引、冻结快照一致性、版本链闭合；
  状态持久化于 localStorage，刷新后处方、占用、加工单与版本链保持一致。
