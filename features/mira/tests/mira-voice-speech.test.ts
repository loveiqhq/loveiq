import { describe, expect, it } from "vitest";
import { REPLY_LANGUAGES } from "@features/mira/reply-languages";
import {
  forSpeech,
  isEcho,
  pickVoice,
  readAfterSpeaking,
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

  // Russian and Arabic are reply languages (and any browser language is heard): their words are
  // words too, written with spaces or, in Japanese or Thai, without.
  it.each([
    [
      "Russian",
      "Это нормально. Хочешь следующий шаг?",
      "Подожди, пожалуйста",
      "хочешь следующий шаг",
    ],
    ["Arabic", "هذا طبيعي. هل تريدين الخطوة التالية؟", "انتظري قليلا من فضلك", "الخطوة التالية"],
    [
      "Bosnian",
      "To je normalno. Želiš li sljedeći korak?",
      "Čekaj malo",
      "želiš li sljedeći korak",
    ],
    [
      "Japanese",
      "大丈夫です。次のステップに進みますか？",
      "ちょっと待って",
      "次のステップに進みますか",
    ],
    ["Thai", "ไม่เป็นไร คุณอยากไปขั้นต่อไปไหม", "รอเดี๋ยว", "อยากไปขั้นต่อไปไหม"],
  ])("hears the person cut in, in %s, and still knows her own words", (_, hers, own, echo) => {
    expect(readWhileSpeaking([{ text: own, final: false }], 0, hers)).toEqual({
      floor: 0,
      bargeIn: true,
    });
    expect(readWhileSpeaking([{ text: echo, final: true }], 0, hers)).toEqual({
      floor: 1,
      bargeIn: false,
    });
  });
});

describe("her last words, arriving late just after she stopped (VOI-V5)", () => {
  const said = "That makes sense. Want the next step?";

  it("waits while they settle, then skips them, keeping the person's words after them", () => {
    const late = { text: "want the next step", final: false };
    expect(readAfterSpeaking([late], 0, said)).toEqual({ floor: 0, settling: true });
    const settled = { ...late, final: true };
    const own = { text: "yes please", final: false };
    expect(readAfterSpeaking([settled, own], 0, said)).toEqual({ floor: 1, settling: false });
  });

  it("leaves the person's answer alone, even a one-word one she also said", () => {
    expect(readAfterSpeaking([{ text: "sure go on", final: true }], 0, said)).toEqual({
      floor: 0,
      settling: false,
    });
    expect(
      readAfterSpeaking([{ text: "okay", final: true }], 0, "Okay. Want the next step?")
    ).toEqual({ floor: 0, settling: false });
  });
});

describe("which language and voice", () => {
  // Crisis words are read in the person's own language (server/safety.ts): speech must become
  // text in that language, never English by force.
  it("listens in the language Mira replies in when one is chosen, as a full language tag", () => {
    expect(recognitionLang("de", "en-GB")).toBe("de-DE");
    expect(recognitionLang("pt", "pt-BR")).toBe("pt-PT");
    expect(recognitionLang("en", "de-DE")).toBe("en-US");
    // Serbian is offered, and its crisis words read, in the Latin script.
    expect(recognitionLang("sr", "sr-RS")).toBe("sr-Latn-RS");
  });

  it("otherwise in the browser's own language, else US English", () => {
    expect(recognitionLang(null, "fr-CA")).toBe("fr-CA");
    expect(recognitionLang(null, "pl")).toBe("pl");
    expect(recognitionLang(null, "")).toBe("en-US");
    expect(recognitionLang(null, undefined)).toBe("en-US");
    expect(recognitionLang(null, "not a language")).toBe("en-US");
    expect(recognitionLang("xx", "it-IT")).toBe("it-IT"); // not a reply language
  });

  it("has a language tag for every language Mira can reply in", () => {
    for (const l of REPLY_LANGUAGES) {
      expect(l.speech, l.code).toMatch(new RegExp(`^${l.code}(-[A-Za-z]{4})?-[A-Z]{2}$`));
    }
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

  it("speaks in the listening language, on the device only, or not at all", () => {
    const voices = [
      voice("Samantha", "en-US", true),
      voice("Google Deutsch", "de-DE", false),
      voice("Anna", "de-DE", true),
      voice("Markus", "de_AT", true),
      voice("Goran", "sr-RS", true),
    ];
    expect(pickVoice(voices, "de-DE")?.name).toBe("Anna");
    expect(pickVoice(voices, "de-AT")?.name).toBe("Markus");
    expect(pickVoice(voices, "sr-Latn-RS")?.name).toBe("Goran");
    expect(pickVoice(voices, "pl-PL")).toBeNull(); // no Polish voice here: she answers in writing
    expect(pickVoice([voice("Google Deutsch", "de-DE", false)], "de-DE")).toBeNull();
  });
});
