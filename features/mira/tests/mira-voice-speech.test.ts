import { describe, expect, it } from "vitest";
import {
  forSpeech,
  isEcho,
  pickVoice,
  readWhileSpeaking,
  recognitionLang,
  sentences,
} from "@features/mira/ui/voice/speech";

/** Talking to Mira (features/mira/ui/voice): the text rules around the browser's speech services. */

describe("what Mira says out loud", () => {
  it("drops the app's markers, links, web addresses, markdown and emoji, keeping the words", () => {
    const reply = [
      "**That makes sense.** Wanting the lights off is a way of feeling safe 🙂",
      "- Try practice 2, the body scan.",
      "It's in the guide at loveiq.org/mira/guide#practice-2.",
      "See [the guide](https://www.loveiq.org/mira/guide) or https://example.com/x?y=1 too.",
      "[[ASK:onset]]",
    ].join("\n");
    // A line that ends without a full stop still ends: she pauses there.
    expect(forSpeech(reply)).toBe(
      "That makes sense. Wanting the lights off is a way of feeling safe. Try practice 2, the body scan. It's in the guide. See the guide too."
    );
  });

  it("keeps a numbered step's number and ordinary punctuation", () => {
    expect(forSpeech("1. Breathe in.\n2. Notice your hands — slowly.")).toBe(
      "1. Breathe in. 2. Notice your hands — slowly."
    );
  });

  it("splits a reply into sentences, so a long one never stalls and the caption can follow her", () => {
    expect(
      sentences("That makes sense. Why now? Let’s try one small thing! And then rest… Okay")
    ).toEqual([
      "That makes sense.",
      "Why now?",
      "Let’s try one small thing!",
      "And then rest…",
      "Okay",
    ]);
  });

  it("keeps a very short piece with the sentence after it", () => {
    expect(sentences("Okay. So what happens when the lights are on?")).toEqual([
      "Okay. So what happens when the lights are on?",
    ]);
  });
});

describe("barge-in: telling the person from Mira's own voice in the speakers", () => {
  const said =
    "Wanting the lights off is a way of feeling safe, and there's nothing wrong with that.";

  it("treats her own words coming back, even slightly misheard, as an echo", () => {
    expect(isEcho("wanting the light off is a way of feeling", said)).toBe(true);
  });

  it("treats the person's own words as theirs", () => {
    expect(isEcho("sorry can I say something about my partner", said)).toBe(false);
  });

  it("skips settled echoes and stops Mira only for two or more words of the person's own", () => {
    const echo = { text: "wanting the lights off", final: true };
    const one = { text: "hmm", final: false };
    const own = { text: "wait I don't think so", final: false };
    expect(readWhileSpeaking([echo, one], 0, said)).toEqual({ floor: 1, bargeIn: false });
    expect(readWhileSpeaking([echo, own], 0, said)).toEqual({ floor: 1, bargeIn: true });
    // An earlier floor is kept: results before it belong to an earlier turn.
    expect(readWhileSpeaking([own, echo], 1, said)).toEqual({ floor: 2, bargeIn: false });
  });
});

describe("which language and voice", () => {
  it("listens in the browser's English, or US English (Mira replies in English only for now)", () => {
    expect(recognitionLang(["de-DE", "en-GB", "en-US"])).toBe("en-GB");
    expect(recognitionLang(["en"])).toBe("en-US");
    expect(recognitionLang(["de-DE"])).toBe("en-US");
  });

  const voice = (name: string, lang: string, localService: boolean) =>
    ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

  it("uses only voices on the device, preferring the listening language and a calm, natural one", () => {
    const voices = [
      voice("Google UK English Female", "en-GB", false),
      voice("Daniel", "en-GB", true),
      voice("Samantha", "en-US", true),
      voice("Serena (Premium)", "en-GB", true),
      voice("Anna", "de-DE", true),
    ];
    expect(pickVoice(voices, "en-GB")?.name).toBe("Serena (Premium)");
    expect(pickVoice(voices, "en-US")?.name).toBe("Samantha");
  });

  it("has no voice when the device has none of its own (a cloud voice would send her words away)", () => {
    expect(pickVoice([voice("Google US English", "en-US", false)], "en-US")).toBeNull();
    expect(pickVoice([voice("Anna", "de-DE", true)], "en-US")).toBeNull();
  });
});
