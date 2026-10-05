import { beforeAll, describe, expect, it } from "vitest";
import { resolveConfig } from "vite";

describe("통합 타자 게임의 React 공유", () => {
  let resolveModule: ReturnType<Awaited<ReturnType<typeof resolveConfig>>["createResolver"]>;
  let root: string;
  beforeAll(async () => {
    const config = await resolveConfig({ configFile: "vite.config.ts" }, "build");
    root = config.root;
    resolveModule = config.createResolver();
  });
  it.each(["react", "react/jsx-runtime", "react-dom/client"])("KBO·MLB가 같은 %s 모듈을 사용한다", async (name) => {
    const kbo = await resolveModule(name, `${root}/src/main.tsx`);
    const mlb = await resolveModule(name, `${root}/_mlb/src/App.tsx`);
    expect(kbo).toBeTruthy();
    expect(mlb).toBe(kbo);
  });
});
