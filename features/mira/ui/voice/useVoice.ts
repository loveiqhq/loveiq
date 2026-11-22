"use client";

import { useEffect, useRef, useState } from "react";
import { VOICE_NOTICE_VERSION } from "../../server/config";
import { local, miraApi } from "../api";
import {
  chooseMode,
  forSpeech,
  pickVoice,
  readAfterSpeaking,
  readWhileSpeaking,
  recognitionLang,
  recognizerClass,
  sentences,
  type RecognitionMode,
  type Recognizer,
  type RecognizerClass,
} from "./speech";

/**
 * A voice session with Mira, as a turn-taking loop: the person talks (the browser's recognizer,
 * speech.ts), a pause ends their turn, the turn goes to the chat like a typed message (the
 * caller's `onTurn`), and her reply is read aloud by a voice on the device while the recognizer
 * listens for the person to cut in (barge-in), except in Apple's WebKit, where listening during
 * speech can mute the speech: there a tap on her photo stops her. The chat answers through
 * `answered`. Nothing here sends audio anywhere; the session's end is counted and, signed in,
 * kept as words (POST /api/mira/recordings).
 */

export type VoicePhase =
  "off" | "preparing" | "notice" | "listening" | "thinking" | "speaking" | "paused" | "error";
export type VoiceTrouble = "blocked" | "no-mic" | "network" | "unavailable" | "failed";
/** Why the microphone is off: the person muted it, a panel is open over the chat, or they left. */
export type PauseReason = "muted" | "held" | "away";

/** The chat route's answer to a spoken turn, as far as voice cares (MiraChat's send). */
export type VoiceAnswer = {
  ok: boolean;
  data: {
    reply?: string;
    invitation?: string;
    crisis?: boolean;
    minor?: boolean;
    gate?: boolean;
    freeLeft?: number | null;
    /** The chat the turn went into: a new chat gets its id with its first answer. */
    chatId?: string | null;
  };
};

export type SavedSession = {
  id: string;
  seconds: number;
  you: number | null;
  keyPoints: string[] | null;
};
/** Where an ended session went; shown in the chat it happened in (`chatId`). */
export type VoiceEnded = { chatId: string | null } & (
  | { status: "saving" }
  | { status: "saved"; recording: SavedSession }
  /** `memoryOff`: "Remember our conversations" is why, not words missing from the chat. */
  | { status: "not-kept"; memoryOff: boolean }
  | { status: "failed" }
  /** Refused as under 18 (the account was stopped meanwhile): the one refusal (decision 9). */
  | { status: "minor" }
);

type SessionEnd = {
  session: string;
  chatId: string | null;
  startedAt: string;
  /** End, or when the person left it paused: a later save (Try again) doesn't move it. */
  endedAt: string;
  mode: RecognitionMode;
  turns: number;
};

/** The silence after the person's words that ends their turn: patient, people pause on this. */
export const TURN_PAUSE_MS = 1600;
/**
 * How long after she stops her own words may still come back from the recognizer (VOI-V5).
 * ponytail: a fixed window, not measured on real devices; tune it here if Chrome is later.
 */
const ECHO_TAIL_MS = 1500;
/** A turn the chat never answers (the route gives up long before) is let go after this. */
const THINKING_LIMIT_MS = 90_000;

export type Voice = ReturnType<typeof useVoice>;

export function useVoice(options: {
  /** Sends the person's turn to the chat; the chat calls `answered` with the reply. */
  onTurn: (text: string, opts?: { skip?: boolean }) => void;
  chatId: () => string | null;
  /** A panel is open over the chat (support lines, coaching style): the microphone waits. */
  held: boolean;
  /** The language Mira replies in, chosen in Settings (null: none chosen, or signed out). */
  replyLanguage: string | null;
}) {
  const [phase, setPhaseState] = useState<VoicePhase>("off");
  const [heard, setHeard] = useState("");
  const [saying, setSaying] = useState("");
  const [trouble, setTrouble] = useState<VoiceTrouble | null>(null);
  const [pause, setPause] = useState<PauseReason | null>(null);
  const [mode, setMode] = useState<RecognitionMode | null>(null);
  /** Getting ready waits on the browser fetching its speech recognition for the device. */
  const [downloading, setDownloading] = useState(false);
  const [ended, setEnded] = useState<VoiceEnded | null>(null);
  /** The device has no voice of its own: her replies stay in writing. */
  const [voiceless, setVoiceless] = useState(false);
  const [supported, setSupported] = useState(false);
  /** Opened from "Start a voice session" (/mira?talk=1): Talk asks to be tapped. */
  const [invited, setInvited] = useState(false);
  /** Listens while she speaks, so the person can cut in (not in Apple's WebKit: see above). */
  const [duplex, setDuplex] = useState(true);

  // The loop's own state, read by the recognizer's and the voice's callbacks.
  const m = useRef({
    phase: "off" as VoicePhase,
    Recognizer: null as RecognizerClass | null,
    rec: null as Recognizer | null,
    lang: "en-US",
    duplex: true,
    mode: "service" as RecognitionMode,
    /** Results before this index belong to an earlier turn, or were her echo. */
    floor: 0,
    seen: 0,
    heard: "",
    said: "",
    /** Until then, her words heard late are skipped (readAfterSpeaking). */
    echoUntil: 0,
    speech: 0,
    /**
     * The session is over once her reply is said: "end" (no free message left), or "forget"
     * (an under-18 stop, which ends it at once and keeps nothing).
     */
    after: null as "end" | "forget" | null,
    muted: false,
    held: false,
    /** When leaving the tab paused the session; until Resume, that is when it ended. */
    awaySince: null as number | null,
    session: null as string | null,
    chatId: null as string | null,
    /** Ended while a turn was on its way: saved when its answer brings the chat's id. */
    saveOnAnswer: false,
    startedAt: new Date(),
    turns: 0,
    started: 0,
    quickEnds: 0,
    last: null as SessionEnd | null,
    timers: {} as Record<
      "turn" | "thinking" | "watchdog",
      ReturnType<typeof setTimeout> | undefined
    >,
  }).current;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    // After mount: the server can't know the browser. Not offered at all where it can't listen.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSupported(recognizerClass() !== null);
    setInvited(new URLSearchParams(window.location.search).has("talk"));
    m.duplex = !/^Apple/.test(navigator.vendor ?? "");
    setDuplex(m.duplex);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [m]);

  const set = (next: VoicePhase) => {
    m.phase = next;
    setPhaseState(next);
  };
  const clear = (name: keyof typeof m.timers) => clearTimeout(m.timers[name]);

  function micOff() {
    clear("turn");
    const rec = m.rec;
    m.rec = null;
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = null;
    try {
      rec.abort();
    } catch {
      // Already stopped.
    }
  }

  /** A fresh recognizer each time, so an old one's late events can never reach this turn. */
  function micOn() {
    if (m.rec || m.muted || m.held || !m.Recognizer) return;
    const rec = new m.Recognizer();
    rec.lang = m.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    if (m.mode === "device") rec.processLocally = true;
    rec.onresult = (e) => {
      if (m.rec === rec) heardSome(e.results);
    };
    rec.onerror = (e) => {
      if (m.rec === rec) failed(e.error);
    };
    rec.onend = () => {
      if (m.rec === rec) stoppedListening();
    };
    m.rec = rec;
    m.floor = 0;
    m.seen = 0;
    m.started = Date.now();
    try {
      rec.start();
    } catch {
      m.rec = null;
      fail("failed");
    }
  }

  function heardSome(list: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>) {
    const results = Array.from(list, (r) => ({ text: r[0]?.transcript ?? "", final: r.isFinal }));
    m.seen = results.length;
    if (m.held) return; // a panel is open over the chat: nothing heard now is a turn
    if (m.phase === "speaking") {
      const read = readWhileSpeaking(results, m.floor, m.said);
      m.floor = read.floor;
      if (!read.bargeIn) return;
      hush(); // the person cut in: she stops, they have the floor
      if (m.after) return end(); // unless that was her last word: the session is over
      set("listening");
    }
    if (m.phase !== "listening") return;
    if (Date.now() < m.echoUntil) {
      const late = readAfterSpeaking(results, m.floor, m.said);
      m.floor = late.floor;
      if (late.settling) return; // her words, still settling: not the person's turn
    }
    const text = results
      .slice(m.floor)
      .map((r) => r.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    m.heard = text;
    setHeard(text);
    clear("turn");
    if (text) m.timers.turn = setTimeout(finishTurn, TURN_PAUSE_MS);
  }

  /** The browser stops listening after a while of silence, and after each phrase on some phones. */
  function stoppedListening() {
    m.rec = null;
    if (m.phase === "listening" && m.heard) return finishTurn(); // that phrase was the turn
    if (m.phase !== "listening" && m.phase !== "speaking") return;
    m.quickEnds = Date.now() - m.started < 1000 ? m.quickEnds + 1 : 0;
    if (m.quickEnds >= 3) return fail("failed"); // it stops as soon as it starts
    micOn();
  }

  function failed(code: string) {
    if (code === "no-speech" || code === "aborted") return; // silence, or our own stop
    fail(
      code === "not-allowed"
        ? "blocked"
        : code === "service-not-allowed" || code === "language-not-supported"
          ? "unavailable"
          : code === "audio-capture"
            ? "no-mic"
            : code === "network"
              ? "network"
              : "failed"
    );
  }

  function fail(kind: VoiceTrouble) {
    micOff();
    hush();
    clear("thinking");
    setTrouble(kind);
    set("error");
  }

  function finishTurn(text = m.heard, opts?: { skip?: boolean }) {
    clear("turn");
    if (!text.trim() || (m.phase !== "listening" && m.phase !== "paused")) return;
    micOff();
    m.heard = "";
    setHeard("");
    m.turns += 1;
    set("thinking");
    m.timers.thinking = setTimeout(() => answered({ ok: false, data: {} }), THINKING_LIMIT_MS);
    latest.current.onTurn(text.trim(), opts);
  }

  /**
   * The chat's answer to the person's turn: she says it, then listens again, or the session ends.
   * The stops come first, whatever the session is doing (paused, ended while the turn was on its
   * way): no microphone, Resume or new turn can follow them.
   */
  function answered(res: VoiceAnswer) {
    clear("thinking");
    const d = res.data;
    if (d.chatId) m.chatId = d.chatId;
    if (d.minor) {
      // Under 18 (rail 15): the session ends at once, and nothing of it is sent or kept, not even
      // a save End asked for while this turn was on its way (Mira's routes refuse them anyway).
      // Message G is in the chat.
      m.after = "forget";
      setEnded(null);
      return end();
    }
    if (m.saveOnAnswer && m.last) {
      m.saveOnAnswer = false;
      m.last.chatId = m.chatId;
      return void save();
    }
    // No free message was left, or this reply used the last one: no turn can follow, so the
    // session ends and the sign-up card takes over (after she says the reply, if she can).
    const last = (d.gate && !d.reply) || (d.freeLeft === 0 && !d.crisis);
    if (m.phase !== "thinking") return last ? end() : undefined; // left meanwhile: it's on screen
    if (d.gate && !d.reply) return end();
    if (!res.ok || !d.reply) return listen(); // the chat shows what went wrong; they can say it again
    m.after = last ? "end" : null;
    speak([d.reply, d.invitation].filter(Boolean).join("\n\n"));
  }

  function speak(reply: string) {
    const parts = sentences(forSpeech(reply));
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    const voice = synth ? pickVoice(synth.getVoices(), m.lang) : null;
    setVoiceless(!voice);
    if (!synth || !voice || parts.length === 0) return afterSpeaking();
    m.said = parts.join(" ");
    set("speaking");
    if (m.duplex) micOn(); // to hear the person cut in
    const speech = ++m.speech;
    const say = (i: number) => {
      if (speech !== m.speech) return;
      if (i >= parts.length) return afterSpeaking();
      const u = new SpeechSynthesisUtterance(parts[i]);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.96;
      let done = false;
      const next = () => {
        if (done) return;
        done = true;
        clear("watchdog");
        say(i + 1);
      };
      u.onend = next;
      u.onerror = next;
      setSaying(parts[i]!);
      // Some browsers never say an utterance has ended: move on after its time.
      m.timers.watchdog = setTimeout(next, 2500 + parts[i]!.split(/\s+/).length * 550);
      synth.speak(u);
    };
    synth.cancel();
    say(0);
  }

  /** Stops her voice, and anything queued after it. */
  function hush() {
    m.speech++;
    clear("watchdog");
    setSaying("");
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Nothing to stop.
    }
  }

  function afterSpeaking() {
    setSaying("");
    if (m.phase === "speaking") m.echoUntil = Date.now() + ECHO_TAIL_MS; // she did speak
    listen(); // which ends the session after her last reply
  }

  /** The person's turn again: listening, unless the microphone is paused or the session is over. */
  function listen() {
    if (m.after) return end(); // her last reply was said (or cut short): no turn follows it
    m.floor = m.seen; // what was heard while she spoke was her own voice
    m.heard = "";
    setHeard("");
    if (m.muted || m.held) {
      micOff();
      setPause(m.muted ? "muted" : "held");
      return set("paused");
    }
    set("listening");
    micOn();
  }

  /** Talk: from the tap itself, which the browser needs before it listens or speaks. */
  function start() {
    const Recognizer = recognizerClass();
    if (!Recognizer || m.phase !== "off") return;
    unlockSpeech();
    window.speechSynthesis?.getVoices(); // Chrome loads its voices on the first ask
    Object.assign(m, {
      Recognizer,
      lang: recognitionLang(latest.current.replyLanguage, navigator.language),
      session: crypto.randomUUID(),
      chatId: latest.current.chatId(),
      saveOnAnswer: false,
      startedAt: new Date(),
      turns: 0,
      muted: false,
      awaySince: null,
      after: null,
      quickEnds: 0,
    });
    setEnded(null);
    setTrouble(null);
    setPause(null);
    setInvited(false);
    setDownloading(false);
    set("preparing");
    const go = (chosen: RecognitionMode) => {
      if (m.phase !== "preparing") return; // ended while it got ready
      m.mode = chosen;
      setMode(chosen);
      if (chosen === "service" && !local.voiceNoticeSeen()) return set("notice");
      listen();
    };
    // Safari has no on-device check: it starts within the tap.
    if (typeof Recognizer.available !== "function") go("service");
    else void chooseMode(Recognizer, m.lang, () => setDownloading(true)).then(go);
  }

  /**
   * The notice's "Start talking", its tick given: kept in this browser and recorded with the
   * wording's version, then the browser's service listens.
   */
  function agree() {
    if (m.phase !== "notice") return;
    local.saveVoiceNoticeSeen();
    void miraApi("/api/mira/event", {
      body: { type: "voice_notice", version: VOICE_NOTICE_VERSION },
    });
    listen();
  }

  function toggleMute() {
    if (m.muted || m.phase === "paused" || m.phase === "error") return resume();
    m.muted = true;
    setPause("muted"); // while she speaks too: she finishes, and the microphone stays off
    micOff();
    if (m.phase === "listening") listen(); // to paused
  }

  function resume() {
    m.muted = false;
    m.awaySince = null;
    setPause(null);
    setTrouble(null);
    if (m.phase === "paused" || m.phase === "error") listen();
    else if (m.phase === "speaking" && m.duplex) micOn(); // listening for the person to cut in
  }

  /** Her photo: "I'm done" while the person talks, "stop" while she speaks, "go on" when paused. */
  function tap() {
    if (m.phase === "listening" && m.heard) return finishTurn();
    if (m.phase === "speaking") {
      hush();
      return afterSpeaking();
    }
    if (m.phase === "paused") resume();
  }

  /**
   * A tapped answer button in voice mode: the person's turn, answered out loud. False when the
   * session can't take a turn now (its notice, getting ready, a microphone problem): the chat
   * sends it as typed instead.
   */
  function say(text: string, opts?: { skip?: boolean }): boolean {
    if (m.phase !== "speaking" && m.phase !== "listening" && m.phase !== "paused") return false;
    if (m.phase === "speaking") hush();
    set("listening");
    finishTurn(text, opts);
    return true;
  }

  /** End: the microphone and her voice stop; a session with turns is counted, and kept if it can. */
  function end(keepalive = false) {
    if (m.phase === "off") return;
    const waiting = m.phase === "thinking";
    micOff();
    hush();
    clear("thinking");
    set("off");
    setHeard("");
    setPause(null);
    setTrouble(null);
    const session = m.session;
    m.session = null;
    if (session && m.turns > 0 && m.after !== "forget") {
      m.last = {
        session,
        chatId: m.chatId,
        startedAt: m.startedAt.toISOString(),
        endedAt: new Date(m.awaySince ?? Date.now()).toISOString(),
        mode: m.mode,
        turns: m.turns,
      };
      // The turn on its way may be the one that makes the chat: wait for its answer.
      if (waiting && !keepalive) {
        m.saveOnAnswer = true;
        setEnded({ chatId: null, status: "saving" });
      } else void save(keepalive);
    }
  }

  async function save(keepalive = false) {
    const body = m.last;
    if (!body) return;
    const chatId = body.chatId;
    if (!keepalive) setEnded({ chatId, status: "saving" });
    const res = await miraApi<{ kept?: boolean; recording?: SavedSession; reason?: string }>(
      "/api/mira/recordings",
      { body, keepalive }
    );
    // Gone by now (a new chat, or another session): its card isn't brought back.
    if (keepalive || m.last !== body) return;
    setEnded(
      res.ok && res.data.kept && res.data.recording
        ? { chatId, status: "saved", recording: res.data.recording }
        : res.ok
          ? { chatId, status: "not-kept", memoryOff: res.data.reason === "memory_off" }
          : res.minor
            ? { chatId, status: "minor" }
            : { chatId, status: "failed" }
    );
  }

  // A panel over the chat (support lines, coaching style) pauses the microphone at once, and
  // her voice may finish; Resume goes on.
  useEffect(() => {
    m.held = options.held;
    if (!options.held || m.phase === "off") return;
    micOff();
    if (m.phase !== "listening") return;
    setPause("held");
    set("paused");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop's own functions
  }, [options.held]);

  useEffect(() => {
    // Leaving the tab stops the microphone and her voice; closing it ends the session (a turn still
    // on its way then can't name a new chat, so that session is counted, not kept).
    const away = () => {
      // Only what is live: the notice (and getting ready) wait as they are, so Resume can never
      // start the browser's service without the notice's tick.
      const live = m.phase === "listening" || m.phase === "speaking" || m.phase === "thinking";
      if (document.visibilityState !== "hidden" || !live) return;
      if (m.after) return end(); // leaving during her last reply: the session is over, no Resume
      micOff();
      hush();
      clear("thinking");
      m.awaySince = Date.now();
      setPause("away");
      set("paused");
    };
    const leave = () => end(true);
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", leave);
      // Leaving the chat inside the app (a link) ends the session too.
      if (m.phase !== "off") leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop's own functions
  }, []);

  return {
    supported,
    invited,
    duplex,
    phase,
    heard,
    saying,
    trouble,
    pause,
    mode,
    downloading,
    ended,
    voiceless,
    /** The session a spoken turn belongs to, sent with it so a kept chat tags its messages. */
    sessionId: () => m.session,
    /** Saying a reply out loud right now (read at once after `answered`, before a render). */
    speaking: () => m.phase === "speaking",
    start,
    agree,
    answered,
    say,
    toggleMute,
    resume,
    tap,
    end: () => end(),
    retrySave: () => void save(),
    /** A new chat: the last session's end card stays with the chat it happened in. */
    dismissEnded: () => {
      m.last = null;
      setEnded(null);
    },
  };
}

/** iOS lets a page speak only after speech began inside a tap: a silent word does it. */
function unlockSpeech() {
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    // No speech synthesis: she answers in writing.
  }
}
