// 一次性冒烟测试：用 vite 自带 esbuild 编译后在 node 跑，不引入测试框架。
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";

const result = await build({
  entryPoints: ["scripts/smoke-src.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
mkdirSync("scripts/.tmp", { recursive: true });
writeFileSync("scripts/.tmp/smoke.mjs", result.outputFiles[0].text);
await import("./.tmp/smoke.mjs");
