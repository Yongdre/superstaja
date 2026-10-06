import { describe, expect, it } from "vitest";
import { build } from "vite";
import { defaultPitcherDataset } from "../data";
import { defaultPitcherDatasetOption, loadPitcherDataset, pitcherDatasetOptionsFor } from "../datasetLoader";

describe("모바일 첫 진입의 선수 데이터 로딩", () => {
  it.each(["KBO", "MLB"] as const)("%s에서 선택한 시즌 하나만 읽어 기존 선수 능력치를 유지한다", async (league) => {
    const option = defaultPitcherDatasetOption(league);
    const pending = loadPitcherDataset(option.id);
    expect(loadPitcherDataset(option.id)).toBe(pending);
    expect(await pending).toEqual(defaultPitcherDataset(league));
    expect(pitcherDatasetOptionsFor(league).every((item) => item.league === league)).toBe(true);
  });
  it("존재하지 않는 시즌은 로딩 상태에 머무르지 않고 오류를 반환한다", async () => {
    await expect(loadPitcherDataset("없는 시즌")).rejects.toThrow("선택한 시즌 데이터가 없습니다");
  });
  it("배포된 투수 진입 코드가 모든 시즌 JSON을 미리 내려받지 않는다", async () => {
    const result = await build({ configFile: "vite.config.ts", logLevel: "silent", build: { write: false } });
    const files = (Array.isArray(result) ? result : [result]).flatMap((output) => "output" in output ? output.output : []);
    const chunks = files.filter((file) => file.type === "chunk");
    const entry = chunks.find((file) => file.isEntry && file.name === "pitcher")!;
    expect(entry).toBeTruthy();
    const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const visited = new Set<string>();
    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);
      const chunk = byName.get(name)!;
      expect(Object.keys(chunk.modules).some((id) => /\/data\/seasons\/.*\.json$/.test(id.replaceAll("\\", "/")))).toBe(false);
      chunk.imports.forEach(visit);
    };
    visit(entry.fileName);
    expect(visited.size).toBeGreaterThan(0);
  }, 20000);
});
