import { describe, expect, it } from "vitest";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { buildReport2ChapterCopies } from "@features/report/server/report2ChapterCopies";

// Mark, review 02.10 (Notion): "Left is what is live right now. The right shows how Report
// 2.0 looked like on mobile. Please adapt". The 2.0 rows each draw a slider, and Spark
// Seeker's drew none: its config carries the order and roles but `reward_meters: null`,
// and Sensual Connector's carries the order alone. A config with an order skipped the
// complete fallback in `data/report2-reward.ts`, so those two had no bars (and Sensual
// Connector no "— the lead" either). Now each missing field is completed by the
// designer's own model, which that file documents.
const unlockedAll = () => true;

describe("Reward System config — every archetype draws its four sliders", () => {
  it.each(KNOWN_ARCHETYPES)("%s ships four chemicals, four roles and four meters", (name) => {
    const { rewardConfig } = buildReport2ChapterCopies(name, unlockedAll);
    expect(rewardConfig).not.toBeNull();
    expect(rewardConfig!.order).toHaveLength(4);
    expect(rewardConfig!.roles).toHaveLength(4);
    expect(rewardConfig!.meters).toHaveLength(4);
  });

  it("completes Spark Seeker's meters from the ladder, keeping its own order and roles", () => {
    const { rewardConfig } = buildReport2ChapterCopies("Spark Seeker", unlockedAll);
    expect(rewardConfig).toEqual({
      order: ["dopamine", "adrenaline", "oxytocin", "endorphins"],
      roles: ["lead", "support", "amplifier", "settler"],
      meters: [88, 56, 30, 12],
    });
  });

  it("completes Sensual Connector's roles and meters (adrenaline last: the disruptor)", () => {
    const { rewardConfig } = buildReport2ChapterCopies("Sensual Connector", unlockedAll);
    expect(rewardConfig).toEqual({
      order: ["oxytocin", "endorphins", "dopamine", "adrenaline"],
      roles: ["lead", "support", "amplifier", "disruptor"],
      meters: [88, 56, 30, 12],
    });
  });

  it("leaves a complete config as it is (Spiritual Lover)", () => {
    const { rewardConfig } = buildReport2ChapterCopies("Spiritual Lover", unlockedAll);
    expect(rewardConfig).toEqual({
      order: ["oxytocin", "endorphins", "dopamine", "adrenaline"],
      roles: ["lead", "support", "amplifier", "disruptor"],
      meters: [88, 56, 30, 12],
    });
  });

  it("still ships no config to a locked reader", () => {
    const { rewardConfig } = buildReport2ChapterCopies("Spark Seeker", () => false);
    expect(rewardConfig).toBeNull();
  });
});
