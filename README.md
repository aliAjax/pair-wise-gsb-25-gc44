# hxwl-11 处方下达与镜片加工核验台

在「眼科验光记录」基础上扩展的处方下达与镜片加工核验台。数据、判定规则与页面分层，无新增依赖。

## 技术栈

React + Vite + TypeScript + CSS（localStorage 持久化）

## 本地运行

```bash
npm install
npm run dev
```

开发端口：5111

## 业务规则

- 处方按**患者 + 眼别（OD 右 / OS 左）**记录球镜 S、柱镜 C、轴位、瞳距 PD。
- **有柱镜必须填轴位**，轴位限 **0~180°**。
- 瞳距超出 **50~80mm** 不阻断录入，但处方进入**待复核**，复核通过前不能下达加工单。
- 同一患者同一眼别只能有一张**待加工**处方（占用槽位）。
- 加工单引用处方时**冻结参数快照**；处方状态变为「已冻结」，不可再改。
- **渐进片**还须补**下加光 ADD 与瞳高**，缺失时加工单停留「排队中」，补齐并核验通过后方可开工。
- 已加工（已完成）处方不可修改，只能**带原因新建修订**；旧处方标记为「已修订」，旧值与版本链完整保留（rootId / prevId / version）。
- 刷新后处方、占用、加工单、版本链均从同一份状态重新派生；加载时执行一致性自检。

## 目录分层

```
src/
  domain/
    types.ts     领域模型（处方 / 加工单 / 版本链）
    rules.ts     纯函数判定规则（校验、占用、版本链派生）
    reducer.ts   纯状态流转 + 一致性审计
    seed.ts      示例数据
  state/
    useStation.ts  React 绑定（useState + localStorage）
  ui/
    PrescriptionForm.tsx   处方下达 / 待加工编辑
    PrescriptionBoard.tsx  处方台账、占用、版本链
    WorkOrderDesk.tsx      加工核验台（冻结快照 / 补参 / 开工 / 完工）
    RevisionDialog.tsx     带原因修订弹窗
    format.ts              展示格式化
  App.tsx        页面装配
```
