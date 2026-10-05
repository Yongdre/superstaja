import { describe, expect, it } from "vitest";
import { defaultLeagueDataset as data } from "../../data/leagueDataset";
import type { LeagueDataset, TeamDefinition } from "../types";
import { validateLeagueDataset } from "../../data/leagueDataset";
import { importLeagueData } from "../../store/gameStore";
import { createNewSeason, validateSave } from "../gameEngine";

// 입력 JSON은 내부 TeamId 타입보다 넓은 외부 형식입니다.
function inputDataset(renameKeys: boolean, renameIds: boolean) {
  const result = structuredClone(data) as unknown as { teams: Record<string, Omit<TeamDefinition, "id"> & {id: string}> } & Omit<LeagueDataset, "teams">;
  for (const [oldId, newId] of [["ATH", "OAK"], ["AZ", "ARI"]]) {
    const team = result.teams[oldId];
    team.shortName = oldId;
    if (renameIds) team.id = newId;
    if (renameKeys) {
      delete result.teams[oldId];
      result.teams[newId] = team;
    }
  }
  return result;
}

describe("MLB 팀 약칭 JSON 호환", () => {
  it.each([[false,false], [true,false], [false,true], [true,true]])(
    "key 변경 %s / id 변경 %s 모두 인식하고 화면은 OAK·ARI로 표시한다",
    (keys, ids) => {
      const input = inputDataset(keys, ids), original = structuredClone(input);
      const valid = validateLeagueDataset(input);
      expect(valid.teams.ATH).toMatchObject({ id: "ATH", shortName: "OAK" });
      expect(valid.teams.AZ).toMatchObject({ id: "AZ", shortName: "ARI" });
      expect(Object.keys(valid.teams)).toHaveLength(30);
      expect(valid.teams.ATH.hitters[0].id).toBe(data.teams.ATH.hitters[0].id);
      expect(input).toEqual(original);
      expect(validateLeagueDataset(valid)).toEqual(valid);
    },
  );

  it("실제 JSON 가져오기로 새 약칭을 읽고 사용자 지정 팀 이름은 유지한다", async () => {
    const input = inputDataset(true, true);
    input.teams.OAK.shortName = "오클랜드";
    const result = await importLeagueData(new File([JSON.stringify(input)], "league.json", { type: "application/json" }));
    expect(result.teams.ATH.shortName).toBe("오클랜드");
    expect(result.teams.AZ.shortName).toBe("ARI");
  });

  it.each([["ATH", "OAK"], ["AZ", "ARI"]])("%s와 %s를 함께 넣으면 덮어쓰지 않고 중복 오류를 낸다", (oldId, newId) => {
    const input = inputDataset(false, false);
    input.teams[newId] = structuredClone(input.teams[oldId]);
    input.teams[newId].id = newId;
    expect(() => validateLeagueDataset(input)).toThrow("중복");
  });

  it("별칭을 쓰더라도 key와 id가 다른 팀이면 거부한다", () => {
    const input = inputDataset(true, true);
    input.teams.OAK.id = "ARI";
    expect(() => validateLeagueDataset(input)).toThrow("팀 기본 정보");
  });

  it.each(["ATH", "AZ"] as const)("%s 기존 일정·선수 ID·세이브 연결을 유지한다", userTeam => {
    const dataset = validateLeagueDataset(inputDataset(true, true));
    const state = createNewSeason({ userTeam }, dataset);
    expect([state.game!.fixture.away, state.game!.fixture.home]).toContain(userTeam);
    expect(state.game!.lineups[userTeam]).toContain("USER-PLAYER");
    expect(validateSave(JSON.parse(JSON.stringify(state)))).toEqual(state);
    // 이전 버전에서 저장한 약칭도 불러올 때 새 표시로 바뀌며 내부 연결은 그대로입니다.
    state.leagueData.teams[userTeam].shortName = userTeam;
    expect(validateSave(JSON.parse(JSON.stringify(state))).leagueData.teams[userTeam].shortName).toBe(userTeam === "ATH" ? "OAK" : "ARI");
  });
});
