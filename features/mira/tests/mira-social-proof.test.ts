import { describe, expect, it } from "vitest";
import miraConfig from "@features/mira/content/mira-config.json";
import { pickSocialProof, SAMPLE_PROOF, type SocialProof } from "@features/mira/social-proof";

describe("Mira's rating line and quote", () => {
  const real: SocialProof = {
    rating: 4.7,
    people: 212,
    quote: "It helped.",
    name: "Ana",
    photo: null,
  };

  it("never shows the board's sample on the live site", () => {
    expect(pickSocialProof(null, "production")).toBeNull();
  });

  it("shows the sample on staging, previews and locally, so the look can be judged", () => {
    for (const env of ["preview", "development", undefined]) {
      expect(pickSocialProof(null, env)).toEqual(SAMPLE_PROOF);
    }
  });

  it("shows real figures everywhere once they are set", () => {
    expect(pickSocialProof(real, "production")).toEqual(real);
    expect(pickSocialProof(real, "preview")).toEqual(real);
  });

  it("ships with no real figures yet", () => {
    expect((miraConfig as { socialProof?: unknown }).socialProof).toBeNull();
  });
});
