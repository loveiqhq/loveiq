"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { SESSION_OPENING } from "@features/mira/server/calendar";
import { ANON_FREE_MESSAGES, CONSENT_VERSION, SKIP_ANSWER } from "@features/mira/server/config";
import { BodyCheck } from "./BodyCheck";
import { CoachingStylePanel, type Style } from "./CoachingStylePanel";
import { track } from "./coaches/data";
import { GOAL_STARTER, GoalSuggestion } from "./goals/GoalSuggestion";
import { ANSWER_CHIP, IntakeAnswers } from "./IntakeAnswers";
import { ADULTS_ONLY } from "./kit";
import { Modal, SupportPanel, type SupportCountry } from "./SupportPanel";
import { DISCLAIMER, LegalLinks, MiraCloud, Wordmark } from "./MiraShell";
import { ReviewsWelcome } from "./reviews/PublicReviews";
import { ReviewAsk, THUMBS_FOR_ASK, reviewAskDue } from "./reviews/ReviewAsk";
import { TalkButton, VoiceEnded, VoicePanel } from "./voice/VoicePanel";
import { useVoice } from "./voice/useVoice";
import {
  local,
  miraApi,
  useReloadWhenRestored,
  type LocalTurn,
  type Source,
  type Turn,
} from "./api";

/**
 * Boards 01 (anonymous chat), 01b (free limit reached), 03 (coaching style) and 08a (chats,
 * signed in) as one screen, laid out as Mark's "01 Anonymous chat · minimal (Gemini-style) V2"
 * (21 Nov 2026, after Marcus asked for a less noisy phone version): no frame around the chat, a
 * welcome line in the middle, one pill-shaped composer, Mira's words as plain text and the
 * person's in a grey bubble. On phones the composer sits at the bottom from the start.
 * Since 22 Nov: Talk (voice, ui/voice) beside typing; V2's "trained on 100+ scientific papers &
 * 100M+ words" line (Eman's call, 21 Nov); a rating line only from real ratings (ui/reviews,
 * nothing below the threshold). Kept: the 18+ and sensitive-data consent before the first
 * anonymous message (a short step when it is sent), and the sign-up card once an anonymous
 * person's free message is answered. That card also carries the promise of board "01 Anonymous
 * chat (embed) copy"'s "Keep this chat" card (the chat comes with the account), which could no
 * longer show with one free message and went (round-2 audit CHAT-25, lead decision 2). The
 * composer stays beside it: a crisis message is always answered, any other gets the card again.
 */

/** `live`: written in this page view, so it animates in (a restored chat does not replay). */
type Message = LocalTurn & {
  messageId?: number | null;
  live?: boolean;
  /**
   * A small goal Mira offers with this reply (Challenges & goals), kept with the reply (round-2
   * audit CHAT-9); `goalAdded` once the account's goals hold it (a reopened chat says "Added").
   */
  goal?: string;
  goalAdded?: boolean;
};
type BodyDue = "baseline" | "week4" | null;
type CrisisCountry = SupportCountry;
type ChatSummary = { id: string; title: string; updated_at: string };
/** A stored message as /api/mira/chats/[id] returns it. */
type StoredTurn = Message & {
  id: number;
  rating: number | null;
  ask: string | null;
  goal?: string | null;
};

/** Sanjin's intake invitation: Mira's own message after her first reply, with two reply buttons. */
const isInvitation = (m: Turn) =>
  m.role === "assistant" && m.content === miraConfig.intakeInvitation;
/** A stop rail fired in this chat (the fixed message, or a reply the model marked): no questions
 *  or cards of ours follow it. */
const crisisIn = (turns: LocalTurn[]) =>
  turns.some(
    (t) => t.role === "assistant" && (t.crisis === true || t.content === miraConfig.crisisMessage)
  );
const STYLE_KEYS = miraConfig.styleScales.map((s) => s.key) as Array<keyof Style>;
export { SESSION_OPENING };

/**
 * The NPS question (Marcus's MVP success board) after the 3rd conversation, then at most
 * monthly: once this browser has started 3 chats and Mira has answered twice in this one, never
 * right after a crisis reply. Counts the chat and notes the asking in this browser.
 */
export function npsDue(firstOfChat: boolean, turns: Message[], crisisReply: boolean): boolean {
  const seen = local.nps();
  const now = Date.now();
  const convos = seen.convos + (firstOfChat ? 1 : 0);
  const replies = turns.filter((t) => t.role === "assistant" && !isInvitation(t)).length;
  const due = seen.asked === null || now - seen.asked > 30 * 24 * 60 * 60 * 1000;
  // Never in a chat where a stop rail fired, whether now or earlier in it.
  const crisisInChat = crisisReply || crisisIn(turns);
  const ask = !crisisInChat && convos >= 3 && replies >= 2 && due;
  local.saveNps({ convos, asked: ask ? now : seen.asked });
  return ask;
}

export default function MiraChat({
  signedIn,
  initialChatId,
  starter = null,
  session = false,
}: {
  signedIn: boolean;
  initialChatId: string | null;
  /**
   * The words for `?ask=N` (the guide's "Ask Mira about this") or `?say=<check>`, which the page
   * builds from the id: they wait in the composer while the address still asks for them, and only
   * the person sends them.
   */
  starter?: string | null;
  /**
   * Opened from the weekly session's link: a new chat that Mira opens as the session. With the
   * session's key (app/mira/session), this browser opens each session once: Back can bring the
   * page back from the router's cache, and without "Remember our conversations" there is no
   * stored chat for the page to reopen instead.
   */
  session?: boolean | string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // `retry`: the saved chat didn't load (Try again loads it).
  const [error, setError] = useState<{ text: string; signIn?: boolean; retry?: boolean } | null>(
    null
  );
  // A calm line about the chat itself (it isn't here any more), read out as a status.
  const [notice, setNotice] = useState<string | null>(null);
  // What a screen reader hears from the hidden live line: that Mira is writing, then her new reply
  // (with her invitation), never the person's own words or the buttons and cards (round-2 audit
  // A11Y-11). Set as each send goes, so a turn taken back never reads the reply before it again.
  const [said, setSaid] = useState("");
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [gate, setGate] = useState(false);
  const [consented, setConsented] = useState(signedIn);
  const [tick, setTick] = useState(false);
  // A first message waiting for the consent step: sent once the person agrees.
  const [pending, setPending] = useState<string | null>(null);
  // Until this browser's chat (or the opened one) is loaded, the consent tick and the starter
  // prompts may not belong on screen: they are left out rather than flashed.
  const [ready, setReady] = useState(signedIn && !initialChatId);
  const [style, setStyle] = useState<Style>({});
  // "Mira replies in" (Settings): Talk listens and speaks in it too.
  const [replyLanguage, setReplyLanguage] = useState<string | null>(null);
  // Settings' "Where you're based": "Need support right now?" lists its lines first (SET-9).
  const [country, setCountry] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(initialChatId);
  const [crisis, setCrisis] = useState<CrisisCountry | null>(null);
  // Said they are under 18: nothing of this chat is kept in the browser any more.
  const [minor, setMinor] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  // "Delete this chat" (round-2 audit CHAT-29): its confirm step, open ("ask") or deleting ("busy").
  const [deleting, setDeleting] = useState<"ask" | "busy" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The logo while the sign-up card shows: back to the start without losing the chat the card
  // promises to bring along (a message sent from there goes on in that chat, which comes back).
  const [atStart, setAtStart] = useState(false);
  // The one-time "Make Mira yours" tip on the coaching-style button: null until this browser's
  // record is read after mount, then whether it was shown here before.
  const [tipSeen, setTipSeen] = useState<boolean | null>(null);
  // The NPS question (Marcus's MVP success board): "ask" while open, "thanks" once answered.
  const [nps, setNps] = useState<"ask" | "thanks" | null>(null);
  // The body check (Marcus's MVP success board): due from the account, offered once a page view.
  const [bodyDue, setBodyDue] = useState<BodyDue>(null);
  const [bodyOpen, setBodyOpen] = useState(false);
  const bodyOffered = useRef(false);
  const bodyStarted = useRef(false);
  // The thank-you ask for a rating (reviews/ReviewAsk.tsx): after a 9 or 10, or the third
  // thumbs-up in a chat; never after a referral in this page view.
  const [reviewFrom, setReviewFrom] = useState<"nps" | "thumbs" | null>(null);
  const referred = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  /** The index of the reply that just arrived, for the scroll to its start. */
  const replyAt = useRef<number | null>(null);
  useReloadWhenRestored();
  // Talking to Mira (features/mira/ui/voice): spoken turns go through send like typed ones, and
  // the microphone waits while a panel is open over the chat (the support lines above all).
  const voice = useVoice({
    onTurn: (text, o) => void send(text, { ...o, voice: true }),
    chatId: () => chatId,
    held: supportOpen || crisis !== null || styleOpen,
    replyLanguage,
  });
  const voiceOn = voice.phase !== "off";

  // A voice session's panel goes when the session ends (End, the notice's "Not now", a stop), and
  // the button that had the focus goes with it: focus goes back to Talk, or to the message box
  // when Talk isn't there (round 2, from the voice stream's audit). Not when something else took
  // it meanwhile (a dialog, or the person).
  const hadVoice = useRef(false);
  useEffect(() => {
    if (voiceOn) {
      hadVoice.current = true;
      return;
    }
    if (!hadVoice.current) return;
    hadVoice.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    const talkButton = formRef.current?.querySelector<HTMLButtonElement>(
      'button[type="button"]:not(:disabled)'
    );
    (talkButton ?? inputRef.current)?.focus();
  }, [voiceOn]);

  /**
   * A saved chat, opened by its link (Home, the list, a nudge): on screen; gone (deleted: said so,
   * the address forgets it and a new chat begins); or not loaded (a blip: said so with Try again,
   * and the chat is kept, so what is typed goes on in it). Round-2 audit CHAT-16.
   */
  const openChat = useCallback(async (id: string) => {
    const chat = await miraApi<{ messages: StoredTurn[]; added?: string[] }>(
      `/api/mira/chats/${id}`
    );
    if (chat.ok) {
      setError(null);
      setMessages(
        chat.data.messages.map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources ?? undefined,
          messageId: m.id,
          rated: m.rating === 1 || m.rating === -1 ? m.rating : undefined,
          ask: m.ask ?? undefined,
          ...(m.goal ? { goal: m.goal, goalAdded: chat.data.added?.includes(m.goal) } : {}),
        }))
      );
    } else if (chat.status === 404) {
      setChatId(null);
      window.history.replaceState(null, "", "/mira");
      setNotice("That chat isn't here any more. It may have been deleted.");
    } else {
      setError(
        chat.status === 401
          ? { text: "Please sign in again.", signIn: true }
          : { text: "This chat didn't load. Please try again.", retry: true }
      );
    }
  }, []);

  useEffect(() => {
    void miraApi("/api/mira/event", { body: { type: "track", name: "chat_opened" } });
    if (!signedIn) {
      // Restoring this browser's own chat after mount (localStorage is not readable on the server).
      /* eslint-disable react-hooks/set-state-in-effect */
      const saved = local.chat();
      if (saved) {
        setMessages(saved.turns);
        setFreeLeft(saved.freeLeft);
        if (saved.gate) setGate(true);
      }
      const given = local.consent();
      setConsented(given?.version === CONSENT_VERSION);
      setStyle(local.style() ?? {});
      setTipSeen(local.styleTipSeen());
      setReady(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    setTipSeen(local.styleTipSeen());
    void (async () => {
      const me = await miraApi<{
        chats: ChatSummary[];
        profile: { style: Style; reply_language?: string | null; country?: string | null };
        bodyCheck?: { due: BodyDue };
      }>("/api/mira/me");
      if (me.ok) {
        setChats(me.data.chats);
        setStyle(me.data.profile.style ?? {});
        setReplyLanguage(me.data.profile.reply_language ?? null);
        setCountry(me.data.profile.country ?? null);
        setBodyDue(me.data.bodyCheck?.due ?? null);
      }
      if (initialChatId) await openChat(initialChatId);
      setReady(true);
    })();
  }, [signedIn, initialChatId, openChat]);

  // Only the message list scrolls, never the page: the composer stays where the person typed.
  // A new reply of Mira's is shown from its start, so a long one (or a question with its answer
  // buttons, on a small phone) is read from the top; anything else goes to the bottom.
  useEffect(() => {
    const list = listRef.current;
    if (!list || messages.length === 0) return;
    const reply =
      replyAt.current === null ? null : list.querySelector(`[data-msg="${replyAt.current}"]`);
    replyAt.current = null;
    const top = reply
      ? // Below the list's 20px top fade, so the reply's first line is read at full strength.
        list.scrollTop + reply.getBoundingClientRect().top - list.getBoundingClientRect().top - 24
      : list.scrollHeight;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
    if (typeof list.scrollTo === "function")
      list.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
    else list.scrollTop = top;
  }, [messages.length, sending]); // not on a rating: that rewrites a message, not adds one

  // The anonymous chat lives in this browser, with its sources and ratings, after every change
  // (nothing is written for a first visit until there is something to keep).
  useEffect(() => {
    if (!ready || signedIn || minor || (messages.length === 0 && !local.chat())) return;
    local.saveChat({
      turns: messages.map(({ role, content, sources, rated, ask, crisis, goal }) => ({
        role,
        content,
        sources,
        rated,
        ask,
        crisis,
        goal, // a goal offer survives a reload here too (round-2 audit CHAT-9)
      })),
      freeLeft,
      ...(gate ? { gate: true } : {}),
    });
  }, [ready, signedIn, minor, messages, freeLeft, gate]);

  // A starter from the address waits in the composer, unsent: "Ask Mira to help" on the goals
  // card (?prompt=goal), the guide's "Ask Mira about this" (?ask=N, counted once as guide_ask) and
  // a check's "Talk to Mira" (?say=…). The address then loses it, so neither a reload nor Back
  // (which can bring this page back from the router's cache, starter and all) puts it there
  // again or counts it twice.
  useEffect(() => {
    const url = new URL(window.location.href);
    const asked = url.searchParams;
    const goal = asked.get("prompt") === "goal";
    const practice = asked.get("ask");
    if (!goal && practice === null && !asked.has("say")) return;
    for (const key of ["prompt", "ask", "say"]) asked.delete(key);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    if (goal) {
      setInput(GOAL_STARTER); // eslint-disable-line react-hooks/set-state-in-effect
      inputRef.current?.focus();
    } else if (starter) {
      setInput(starter);
      if (practice !== null) track("guide_ask", practice);
    }
  }, [starter]);

  // The composer grows with what is typed, up to about six lines, then scrolls inside.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`;
  }, [input]);

  async function send(
    text: string,
    opts: { skip?: boolean; agreed?: boolean; voice?: boolean; session?: boolean } = {}
  ) {
    const message = text.trim();
    // Past the free message too: the server answers a crisis message whatever the limits, and
    // gives any other the sign-up card (round-2 audit CHAT-22).
    if (!message || sending) return;
    // A message right after Mira asked an intake question answers it, tapped or typed; a skip
    // doesn't. Only the question's id is sent, for the "how well Mira knows you" figures.
    const last = messages.at(-1);
    const answering = !opts.skip && last?.role === "assistant" ? last.ask : null;
    // An offer nobody started gives way to the conversation; a check in progress stays.
    if (bodyOpen && !bodyStarted.current) setBodyOpen(false);
    setReviewFrom(null); // so does the ask for a rating
    // Nothing reaches Mira before the consent: the message waits for the consent step. Not after
    // an under-18 stop: that browser stays stopped, every message gets the fixed reply (or the
    // crisis lines) and none reaches the model, so nobody under 18 is asked to tick 18+.
    if (!consented && !opts.agreed && !minor) {
      setPending(message);
      return;
    }
    setError(null);
    setNotice(null);
    setAtStart(false); // sent from the start screen: the chat it goes on comes back
    if (showTip) setTipSeen(true);
    const firstOfChat = !chatId && messages.length === 0;
    const history = messages.map(({ role, content }) => ({ role, content })).slice(-24);
    const next: Message[] = [...messages, { role: "user", content: message, live: true }];
    setMessages(next);
    setInput("");
    setSending(true);
    // A spoken turn has the voice panel's own status ("Mira is thinking"), so not this line too.
    setSaid(opts.voice ? "" : "Mira is writing…");
    const res = await miraApi<{
      reply?: string;
      sources?: Source[];
      crisis?: boolean;
      crisisLines?: CrisisCountry;
      chatId?: string | null;
      /** A new chat's title as the server named it (never crisis words: lead decision 5). */
      title?: string;
      messageId?: number | null;
      freeLeft?: number | null;
      gate?: boolean;
      invitation?: string;
      ask?: string;
      goal?: string;
      signIn?: boolean;
      minor?: boolean;
      refer?: boolean;
    }>("/api/mira/chat", {
      body: {
        message,
        consent: true,
        ...(chatId ? { chatId } : {}),
        // Always what the page shows: with "Remember our conversations" off nothing new is stored,
        // so a saved chat needs it too (round-3 R3-CHAT-1); the server reads its own copy while on.
        history,
        // Signed in: a sign-in that ended meanwhile asks for a new one, never goes anonymous.
        ...(signedIn ? { signedIn: true } : { style }),
        ...(answering ? { answering } : {}),
        ...(opts.voice ? { voice: { session: voice.sessionId() ?? undefined } } : {}),
        ...(opts.session ? { session: true } : {}),
      },
    });
    setSending(false);
    if (opts.voice) voice.answered(res); // she says the reply, or listens again
    // Said out loud: not read out by the live line as well (round-3 R3-CHAT-12). A device with no
    // voice for her answers in writing, and that reply is read out.
    const spoken = Boolean(opts.voice) && voice.speaking();
    if (res.data.gate) {
      // Never sent (a crisis message never gets here: the server answers it): the words go back
      // in the box and the page says why, rather than a message left waiting for a reply that
      // can't come (round-3 R3-CHAT-4).
      setMessages(messages);
      setInput(message);
      setSaid("");
      setNotice(NOT_SENT);
      setGate(true);
      setFreeLeft(0);
      return;
    }
    if (!res.ok || !res.data.reply) {
      if (opts.session) local.saveSessionOpened(null); // not opened: a later visit tries again
      setMessages(messages);
      setInput(message);
      setSaid(""); // the alert below says what went wrong
      setError({
        text: res.data.error ?? "Mira couldn't answer just now. Please try again.",
        signIn: res.status === 401 && res.data.signIn === true,
      });
      return;
    }
    const withReply: Message[] = [
      ...next,
      {
        role: "assistant",
        live: true,
        content: res.data.reply,
        sources: res.data.sources,
        messageId: res.data.messageId,
        ask: res.data.ask ?? undefined,
        ...(res.data.crisis ? { crisis: true } : {}),
        ...(res.data.goal ? { goal: res.data.goal } : {}),
      },
      ...(res.data.invitation
        ? [{ role: "assistant" as const, content: res.data.invitation, live: true }]
        : []),
    ];
    replyAt.current = next.length;
    setMessages(withReply);
    setSaid(
      spoken ? "" : `Mira: ${[res.data.reply, res.data.invitation].filter(Boolean).join(" ")}`
    );
    setFreeLeft(res.data.freeLeft ?? freeLeft);
    // The last free message's reply brings the sign-up card. Not beside a crisis reply: the
    // composer stays, and the server answers a crisis message whatever the limits. Nor after an
    // under-18 stop: nobody under 18 is asked to make an account.
    if (res.data.freeLeft === 0 && !res.data.crisis && !res.data.minor) setGate(true);
    if (res.data.crisis && res.data.crisisLines) setCrisis(res.data.crisisLines);
    if (res.data.refer) referred.current = true;
    if (res.data.minor) {
      // Under 18 (rail 15): the reply stays on screen, but this browser forgets the chat and the
      // 18+ tick, and no question of ours follows. An account's chats are gone on the server.
      local.forget();
      setMinor(true);
      setConsented(false);
      setTick(false);
      setChats([]);
      return;
    }
    if (npsDue(firstOfChat, withReply, Boolean(res.data.crisis))) setNps("ask");
    else if (
      bodyDue &&
      !bodyOffered.current &&
      !res.data.crisis &&
      !res.data.invitation &&
      !res.data.ask &&
      !res.data.goal && // one ask at a time: Mira's goal offer goes first (round-2 audit CHAT-4)
      !crisisIn(withReply) &&
      !local.bodyCheckSnoozed()
    ) {
      bodyOffered.current = true;
      setBodyOpen(true);
      void miraApi("/api/mira/event", { body: { type: "track", name: "body_check_offered" } });
    }
    if (res.data.chatId && res.data.chatId !== chatId) {
      setChatId(res.data.chatId);
      setChats((c) => [
        {
          id: res.data.chatId!,
          title: res.data.title ?? message.slice(0, 80),
          updated_at: new Date().toISOString(),
        },
        ...c,
      ]);
      window.history.replaceState(null, "", `/mira?chat=${res.data.chatId}`);
    }
  }

  /** The consent step's "Start chatting": the tick is recorded, then the waiting message goes. */
  function agree() {
    const text = pending;
    if (!tick || text === null) return;
    local.saveConsent({ version: CONSENT_VERSION });
    setConsented(true);
    void miraApi("/api/mira/event", { body: { type: "consent", version: CONSENT_VERSION } });
    setPending(null);
    // "" when Talk opened the step: then the microphone starts, else the waiting message goes.
    if (text === "") voice.start();
    else void send(text, { agreed: true });
  }

  /**
   * The thank-you ask, at a good moment only: signed in, never in a chat with a crisis, after an
   * under-18 stop, a referral or the body check, and at most once in 30 days in this browser.
   */
  function askForReview(from: "nps" | "thumbs"): boolean {
    const ok =
      signedIn &&
      !minor &&
      !referred.current &&
      !bodyOffered.current &&
      !reviewFrom &&
      !crisisIn(messages) &&
      reviewAskDue();
    if (ok) setReviewFrom(from);
    return ok;
  }

  /** Talk: the first-message consent comes first, as for typing ("" marks it as Talk's). */
  function talk() {
    if (consented) voice.start();
    else setPending("");
  }

  /** "Type instead" on a voice problem: back to the composer. */
  function typeInstead() {
    voice.end();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  /** An answer button: answered out loud in voice mode, as typed when the session can't take it. */
  const reply = (text: string, o?: { skip?: boolean }) => {
    if (!voiceOn || !voice.say(text, o)) void send(text, o);
  };

  function answerNps(score: number | null) {
    void miraApi("/api/mira/event", { body: { type: "nps", score } });
    // A 9 or 10: the thanks becomes the ask for a rating, which takes the focus, when the moment
    // is right.
    if (score !== null && score >= 9 && askForReview("nps")) return setNps(null);
    document.getElementById("mira-input")?.focus(); // the pressed button is about to go
    if (score === null) return setNps(null);
    setNps("thanks");
    window.setTimeout(() => setNps(null), 2500);
  }

  async function rate(m: Message, rating: 1 | -1) {
    if (m.role !== "assistant" || m.rated) return;
    const rated = { ...m, rated: rating };
    const swap = (from: Message, to: Message) =>
      setMessages((all) => all.map((x) => (x === from ? to : x)));
    swap(m, rated);
    const res = await miraApi("/api/mira/event", {
      body: {
        type: "rating",
        rating,
        ...(m.messageId ? { messageId: m.messageId } : {}),
        // The thumbs only: a reply's words are never sent (Eman, 21 Nov 2026).
      },
    });
    if (!res.ok) {
      swap(rated, m);
      setError({ text: res.data.error ?? "Your rating didn't go through. Please try again." });
    } else if (
      rating === 1 &&
      !nps &&
      messages.filter((x) => x.rated === 1).length + 1 >= THUMBS_FOR_ASK
    ) {
      askForReview("thumbs"); // the third thumbs-up in this chat
    }
  }

  /** Off while the sign-up card shows, so the chat it promises to bring along isn't wiped. */
  function newChat() {
    if (sending || voiceOn) return; // a reply on its way, or a voice session, belongs to this chat
    voice.dismissEnded();
    setMessages([]);
    setChatId(null);
    setError(null);
    setNotice(null);
    setNps(null);
    window.history.replaceState(null, "", "/mira");
    if (signedIn) return;
    // The free messages are used: a new chat needs the free account too.
    if (freeLeft === 0) {
      setGate(true);
      void miraApi("/api/mira/event", { body: { type: "track", name: "gate_shown" } });
    }
  }

  /**
   * The confirm step's Delete: the open saved chat goes (its messages and voice sessions with it),
   * leaves the list at once, and a new chat begins. One already gone (404) ends the same way.
   */
  async function deleteThisChat() {
    if (!chatId || deleting === "busy") return;
    const id = chatId;
    setDeleting("busy");
    setDeleteError(null);
    const res = await miraApi(`/api/mira/chats/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      setDeleting("ask");
      setDeleteError(res.data.error ?? "That didn't go through. Please try again.");
      return;
    }
    setDeleting(null);
    setChats((all) => all.filter((c) => c.id !== id));
    newChat();
    setNotice("Chat deleted.");
    // The button that opened the step went with the chat: focus goes to the conversation.
    window.setTimeout(() => listRef.current?.focus({ preventScroll: true }), 0);
  }

  /** The logo: back to Mira's start. A new chat, unless that would wipe the one sign-up keeps. */
  function goToStart() {
    if (sending || voiceOn) return;
    if (gate && !signedIn) setAtStart(true);
    else newChat();
  }

  /**
   * The panel's Save: only the scales changed in it, onto the newest saved style, so a change made
   * meanwhile in Settings or another tab isn't undone (round-2 audit SET-3). A point moved back to
   * balanced is sent as 3, so it replaces what was there either way.
   */
  async function saveStyle(next: Style): Promise<string | null> {
    const changed = STYLE_KEYS.filter((k) => (next[k] ?? 3) !== (style[k] ?? 3));
    let saved: Style = style;
    if (signedIn) {
      const me = await miraApi<{ profile: { style: Style | null } }>("/api/mira/me");
      if (me.ok) saved = me.data.profile.style ?? {};
    } else saved = local.style() ?? {};
    const merged: Style = { ...saved };
    for (const k of changed) merged[k] = next[k] ?? 3;
    if (signedIn) {
      const res = await miraApi("/api/mira/me", { method: "PATCH", body: { style: merged } });
      if (res.minor) {
        // Stopped as under 18 meanwhile (another device): no error to try again, the panel goes
        // and the chat says the one refusal (decision 9), as its other asks stop.
        setStyleOpen(false);
        setMinor(true);
        setNotice(ADULTS_ONLY);
        return null;
      }
      if (!res.ok) return res.data.error ?? "Unable to save. Please try again.";
    } else local.saveStyle(merged);
    setStyle(merged);
    setStyleOpen(false);
    void miraApi("/api/mira/event", { body: { type: "track", name: "style_saved" } });
    return null;
  }

  /** The coaching-style panel, from its header button or the tip that points at it. */
  function openStyle() {
    setStyleOpen(true);
    if (!showTip) return;
    setTipSeen(true);
    void miraApi("/api/mira/event", { body: { type: "track", name: "style_tip_opened" } });
  }

  function closeTip() {
    setTipSeen(true);
    document.getElementById("mira-input")?.focus(); // the pressed button is about to go
  }

  const started = messages.length > 0;
  const last = messages.at(-1);
  // The sign-up card, never right under a reply that brought the support lines, nor after an
  // under-18 stop; a later message that needs the account (held back, NOT_SENT) brings it back.
  const lastHadLines = last?.role === "assistant" && last.crisis === true;
  const showGate = gate && !minor && (!lastHadLines || notice === NOT_SENT);

  // A tapped prompt (or the consent step it opened) goes away with the welcome: focus moves to
  // the conversation rather than being lost, without opening a phone's keyboard.
  useEffect(() => {
    if (started && document.activeElement === document.body)
      listRef.current?.focus({ preventScroll: true });
  }, [started]);

  // "Make Mira yours": once per browser, after a reply of Mira's when nothing else asks for the
  // person's attention (no question with answer buttons, card, check, panel or crisis).
  const showTip =
    tipSeen === false &&
    !sending &&
    !gate &&
    !minor &&
    !nps &&
    !reviewFrom &&
    !bodyOpen &&
    !styleOpen &&
    !supportOpen &&
    pending === null &&
    last?.role === "assistant" &&
    !isInvitation(last) &&
    !last.ask &&
    !last.goal &&
    !crisisIn(messages);

  useEffect(() => {
    if (!showTip) return;
    local.saveStyleTipSeen(); // shown once: a reload does not bring it back
    void miraApi("/api/mira/event", { body: { type: "track", name: "style_tip_shown" } });
  }, [showTip]);

  // The weekly session's link: Mira opens the session, once, as soon as the page is up. The
  // address becomes Mira's own, so a reload is a new chat rather than a second opening.
  const sessionOpened = useRef(false);
  useEffect(() => {
    if (!session || !signedIn || sessionOpened.current) return;
    sessionOpened.current = true;
    if (typeof session === "string") {
      if (local.sessionOpened() === session) return;
      local.saveSessionOpened(session);
    }
    window.history.replaceState(null, "", "/mira");
    void send(SESSION_OPENING, { session: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [session, signedIn]);

  const empty = !started || atStart;
  // A saved chat that didn't load is no new chat: no welcome or prompts in its place.
  const unloaded = Boolean(error?.retry);
  // A chat opened by its link loads first: the welcome would only flash before it.
  const showWelcome = empty && (ready || !initialChatId) && !unloaded;
  const showChips = ready && empty && !gate && !unloaded;

  return (
    <div className="bg-white font-sans text-ap-ink selection:bg-ap-lilac">
      {/* Exactly one screen: header, the chat (or the welcome), the composer. Only the messages
          scroll, so the composer stays where the person typed. The legal lines follow below. */}
      <div className="relative flex h-dvh flex-col overflow-hidden">
        <MiraCloud />

        <header className="relative z-[2] flex shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-3 min-[360px]:px-4 sm:px-8 sm:pt-6">
          <Wordmark onHome={goToStart} />
          <div className="flex items-center gap-0.5">
            {/* Only once a chat is under way: the welcome screen is the board's, logo and sign-in. */}
            {started || chatId ? (
              <>
                <span className="relative">
                  <button
                    type="button"
                    onClick={openStyle}
                    disabled={!ready}
                    aria-label="Coaching style"
                    title="How Mira coaches you"
                    className={`${ICON_BUTTON} ${showTip ? "bg-ap-ground ring-2 ring-ap-mist" : ""}`}
                  >
                    <SlidersIcon />
                    <span className="hidden sm:inline">Coaching style</span>
                    {tipSeen === false ? (
                      <span
                        aria-hidden="true"
                        className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#bf66d9] ring-2 ring-white sm:right-0.5 sm:top-0.5"
                      />
                    ) : null}
                  </button>
                  {showTip ? (
                    <div
                      role="note"
                      aria-label="Tip"
                      className="fixed inset-x-3 top-[64px] z-20 rounded-[18px] border border-ap-line bg-white p-4 text-left shadow-[0_18px_40px_-18px_rgba(22,16,33,0.35)] motion-safe:animate-mira-in sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2.5 sm:w-[300px]"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -top-[6px] right-[60px] hidden h-3 w-3 rotate-45 border-l border-t border-ap-line bg-white sm:block"
                      />
                      <p className="font-serif text-[17px] font-semibold">Make Mira yours</p>
                      <p className="mt-1 text-[14px] leading-snug text-ap-body">
                        Choose how she coaches you: softer or more direct, solutions or root causes.
                      </p>
                      <div className="mt-3 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={closeTip}
                          className="min-h-[40px] px-3 text-[14px] font-semibold text-ap-muted"
                        >
                          Not now
                        </button>
                        <button
                          type="button"
                          onClick={openStyle}
                          className="inline-flex min-h-[40px] items-center rounded-full bg-ap-ink px-4 text-[14px] font-bold text-white transition-transform active:scale-[0.98]"
                        >
                          Set it up
                        </button>
                      </div>
                    </div>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={newChat}
                  disabled={sending || gate || voiceOn}
                  aria-label="New chat"
                  title="New chat"
                  className={ICON_BUTTON}
                >
                  <NewChatIcon />
                  <span className="hidden sm:inline">New chat</span>
                </button>
              </>
            ) : null}
            {signedIn ? (
              <Link
                href="/mira/home"
                className="ml-1.5 inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-ap-line bg-white px-4 text-[14px] font-bold"
              >
                Home
              </Link>
            ) : (
              <Link
                href="/mira/start"
                className="ml-1.5 inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full bg-ap-ink px-4 text-[14px] font-bold text-white min-[360px]:px-[18px]"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <div className="relative z-[1] flex min-h-0 flex-1">
          {/* Wide screens, signed in: the chat list, once there is more than one chat to go back
              to (Mark on the canvas, 21 Nov: "only needed once the user has had multiple
              conversations"). Home lists them on every screen size. */}
          {signedIn && chats.length > 1 ? (
            <nav
              aria-label="Your chats"
              className="hidden w-[248px] shrink-0 flex-col gap-0.5 overflow-y-auto py-3 pl-5 pr-2 lg:flex"
            >
              <p className="px-3 pb-1 text-[12px] font-semibold text-ap-muted">Your chats</p>
              {chats.map((c) => (
                <a
                  key={c.id}
                  href={`/mira?chat=${c.id}`}
                  aria-current={c.id === chatId ? "page" : undefined}
                  className={`truncate rounded-xl px-3 py-2 text-[13px] ${c.id === chatId ? "bg-ap-ground font-semibold" : "text-ap-body hover:bg-ap-ground"}`}
                >
                  {c.title}
                </a>
              ))}
            </nav>
          ) : null}

          <main id="main-content" className="flex min-w-0 flex-1 flex-col">
            {/* Wider screens: the welcome, the composer and the prompts sit together in the
                middle (the board); the spacers give way to the chat once it starts. */}
            {empty ? <div aria-hidden="true" className="hidden min-h-0 flex-1 sm:block" /> : null}
            {/* Not a live region (round-2 audit A11Y-11: readers repeated the person's own words
                and read the buttons as text): `said` below announces Mira's new reply. */}
            <div
              ref={listRef}
              role="region"
              aria-label="Conversation"
              tabIndex={-1}
              className={
                empty
                  ? "flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-5 pb-[6dvh] outline-none sm:flex-initial sm:px-6 sm:pb-0"
                  : "min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none [mask-image:linear-gradient(to_bottom,transparent,#000_20px)] [scrollbar-color:rgb(var(--ap-mist))_transparent] [scrollbar-width:thin]"
              }
            >
              {showWelcome ? (
                <div className="mx-auto flex max-w-[760px] flex-col items-center gap-3 py-6 text-center sm:gap-3.5 sm:pb-7 sm:pt-0">
                  <h1 className="text-balance font-serif text-[30px] font-medium leading-[1.2] tracking-[-0.01em] motion-safe:animate-mira-in sm:text-[40px] [@media(max-height:480px)]:text-[24px]">
                    Talk to{" "}
                    <Image
                      src="/images/mira/mira.webp"
                      alt=""
                      width={46}
                      height={46}
                      preload
                      unoptimized
                      className="inline-block h-[34px] w-[34px] rounded-full object-cover align-[-7px] [animation-delay:120ms] motion-safe:animate-mira-pop sm:h-[46px] sm:w-[46px] sm:align-[-10px]"
                    />{" "}
                    <span className={MIRA_INK}>Mira</span> about your body confidence
                  </h1>
                  <p className="max-w-[36ch] text-balance text-[13px] leading-snug text-ap-muted [animation-delay:260ms] motion-safe:animate-mira-in sm:max-w-none sm:text-[14px] [@media(max-height:480px)]:hidden">
                    <SparkIcon />
                    Trained on <b className="font-semibold text-ap-body">
                      100+ scientific papers
                    </b>{" "}
                    &amp; <b className="font-semibold text-ap-body">100M+ words</b> of research on
                    body confidence
                  </p>
                  <ReviewsWelcome place="under" />
                </div>
              ) : null}
              {!empty ? (
                <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 pb-4 pt-5 sm:px-6">
                  <h1 className="sr-only">Your chat with Mira</h1>
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      data-msg={i}
                      className={
                        m.role === "user" ? "flex flex-col items-end" : "flex flex-col gap-2"
                      }
                    >
                      {m.role === "user" ? (
                        <p
                          dir="auto"
                          className={`max-w-[85%] origin-bottom-right whitespace-pre-wrap rounded-[20px] bg-ap-ground px-4 py-2.5 text-[16px] leading-[1.6] [overflow-wrap:anywhere] sm:max-w-[70%] sm:px-[18px] sm:py-3 ${m.live ? "motion-safe:animate-mira-rise" : ""}`}
                        >
                          {m.content}
                        </p>
                      ) : (
                        <p
                          dir="auto"
                          className={`whitespace-pre-wrap text-[16px] leading-[1.65] [overflow-wrap:anywhere] sm:max-w-[88%] ${m.live ? "motion-safe:animate-mira-reply" : ""}`}
                        >
                          {withGuideLinks(m.content)}
                        </p>
                      )}
                      {m.role === "assistant" &&
                      m.ask &&
                      i === messages.length - 1 &&
                      !sending &&
                      !gate ? (
                        <IntakeAnswers
                          questionId={m.ask}
                          onAnswer={(answer) => reply(answer)}
                          onSkip={() => reply(SKIP_ANSWER, { skip: true })}
                        />
                      ) : null}
                      {isInvitation(m) && i === messages.length - 1 && !sending && !gate ? (
                        <div className="flex flex-wrap gap-2">
                          {miraConfig.intakeReplyButtons.map((label) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => reply(label)}
                              className={ANSWER_CHIP}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {m.role === "assistant" && m.goal && !minor ? (
                        <GoalSuggestion text={m.goal} signedIn={signedIn} added={m.goalAdded} />
                      ) : null}
                      {m.role === "assistant" && !isInvitation(m) ? (
                        <div
                          className={`-ml-2 flex flex-wrap items-center text-[12px] text-ap-muted ${m.live ? "[animation-delay:250ms] motion-safe:animate-mira-reply" : ""}`}
                        >
                          <button
                            type="button"
                            aria-label="Helpful"
                            aria-pressed={m.rated === 1}
                            aria-disabled={m.rated === -1 || undefined}
                            onClick={() => rate(m, 1)}
                            className={`${RATE_BUTTON} ${m.rated === 1 ? "text-ap-purple" : ""}`}
                          >
                            <ThumbIcon up />
                          </button>
                          <button
                            type="button"
                            aria-label="Not helpful"
                            aria-pressed={m.rated === -1}
                            aria-disabled={m.rated === 1 || undefined}
                            onClick={() => rate(m, -1)}
                            className={`${RATE_BUTTON} ${m.rated === -1 ? "text-ap-purple" : ""}`}
                          >
                            <ThumbIcon />
                          </button>
                          {m.sources?.length ? (
                            <span className="ml-1.5 [overflow-wrap:anywhere]">
                              Sources:{" "}
                              {m.sources.map((s, j) => (
                                <span key={s.id}>
                                  {j > 0 ? ", " : ""}
                                  {s.link ? (
                                    <a
                                      href={s.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="underline"
                                    >
                                      {s.label}
                                    </a>
                                  ) : (
                                    s.label
                                  )}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {signedIn && voice.ended && voice.ended.chatId === chatId ? (
                    <VoiceEnded voice={voice} />
                  ) : null}
                  {nps ? (
                    <div className={CARD}>
                      {nps === "thanks" ? (
                        <p role="status" className="text-[14px] text-ap-body">
                          Thank you, that helps us a lot.
                        </p>
                      ) : (
                        <fieldset>
                          <legend className="text-[14px] font-semibold">
                            Quick question: how likely are you to recommend Mira to a friend?
                          </legend>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {Array.from({ length: 11 }, (_, n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => answerNps(n)}
                                aria-label={`${n} out of 10`}
                                className="h-10 min-w-[40px] rounded-full border border-ap-line bg-white text-[14px] hover:border-ap-mist hover:bg-ap-ground"
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                          <div className="mt-2 flex justify-between text-[12px] text-ap-muted">
                            <span>0 = not at all likely</span>
                            <span>10 = extremely likely</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => answerNps(null)}
                            className="mt-1 min-h-[44px] text-[13px] text-ap-muted underline"
                          >
                            Not now
                          </button>
                        </fieldset>
                      )}
                    </div>
                  ) : null}
                  {reviewFrom ? (
                    <ReviewAsk from={reviewFrom} onClose={() => setReviewFrom(null)} />
                  ) : null}
                  {bodyOpen && bodyDue ? (
                    <BodyCheck
                      due={bodyDue}
                      onStart={() => {
                        bodyStarted.current = true;
                      }}
                      onClose={(done) => {
                        setBodyOpen(false);
                        bodyStarted.current = false;
                        if (done) setBodyDue(null);
                        else local.snoozeBodyCheck();
                      }}
                    />
                  ) : null}
                  {sending ? (
                    <div className="flex items-center gap-2.5 py-1 motion-safe:animate-mira-reply">
                      <Image
                        src="/images/mira/mira.webp"
                        alt=""
                        width={24}
                        height={24}
                        unoptimized
                        className="h-6 w-6 rounded-full object-cover"
                      />
                      <span aria-hidden="true" className="flex items-center gap-1.5">
                        {[0, 140, 280].map((delay) => (
                          <span
                            key={delay}
                            style={{ animationDelay: `${delay}ms` }}
                            className="h-[7px] w-[7px] rounded-full bg-ap-purple opacity-60 motion-safe:animate-mira-dot"
                          />
                        ))}
                      </span>
                    </div>
                  ) : null}
                  {/* A saved chat can be deleted on its own (Settings deletes them all). Here,
                      at its end, rather than in a header that has no room on a small phone. */}
                  {signedIn && chatId && !sending && !voiceOn ? (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting("ask");
                        }}
                        className="min-h-[44px] px-3 text-[13px] text-ap-muted underline underline-offset-4 hover:text-ap-body"
                      >
                        Delete this chat
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <p aria-live="polite" className="sr-only">
              {said}
            </p>
            <div className="mx-auto w-full max-w-[760px] shrink-0 px-3 pt-1 sm:px-6 sm:pt-0">
              {/* A voice session keeps its panel (and End) while Mira says her last free reply;
                  the sign-up card follows once the session ends, above the composer, which
                  stays: a crisis message is answered whatever the limits. */}
              {voiceOn ? (
                <VoicePanel voice={voice} onType={typeInstead} />
              ) : (
                <>
                  {showGate ? (
                    <div
                      className={`${CARD} mb-2.5 flex flex-col gap-3 shadow-[0_6px_24px_-14px_rgba(22,16,33,0.25)] sm:flex-row sm:items-center sm:gap-4 sm:p-5`}
                    >
                      <div className="flex-1">
                        <p className="font-serif text-[18px] font-semibold">
                          Keep talking with Mira, for free
                        </p>
                        <p className="mt-1 text-[14px] leading-normal text-ap-body">
                          You&apos;ve had your {FREE_LABEL} with Mira. Create a free account to
                          carry on. She&apos;ll remember where you left off, and this chat comes
                          with you.
                        </p>
                      </div>
                      {/* This browser's chat goes into the new account at sign-up. */}
                      <Link
                        href="/mira/start"
                        className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
                      >
                        Create free account
                      </Link>
                    </div>
                  ) : null}
                  <div
                    className={`flex flex-col gap-2.5 sm:gap-3.5 ${empty ? "[animation-delay:360ms] motion-safe:animate-mira-in" : ""}`}
                  >
                    {/* The pill's edge is a field's (A11Y-8): 3:1 or more on the page in both
                        themes, and so is its focused purple (lavender is under 3:1 on white). */}
                    <form
                      ref={formRef}
                      className="flex items-end gap-1.5 rounded-[28px] border border-ap-field bg-white py-1.5 pl-5 pr-1.5 shadow-[0_6px_24px_-14px_rgba(22,16,33,0.25)] transition-colors focus-within:border-ap-purple sm:py-2 sm:pl-6 sm:pr-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send(input);
                      }}
                    >
                      <label htmlFor="mira-input" className="sr-only">
                        Message Mira
                      </label>
                      <textarea
                        id="mira-input"
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter that picks a word in an input method (Japanese, Chinese…) is not a send.
                          const composing = e.nativeEvent.isComposing || e.keyCode === 229;
                          if (e.key === "Enter" && !e.shiftKey && !composing) {
                            e.preventDefault();
                            void send(input);
                          }
                        }}
                        rows={1}
                        maxLength={2000}
                        enterKeyHint="send"
                        placeholder="Ask Mira anything…"
                        className="max-h-[168px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 caret-ap-purple outline-none placeholder:text-ap-muted sm:min-h-[48px] sm:py-3"
                      />
                      {voice.supported && !input.trim() ? (
                        <TalkButton
                          onClick={talk}
                          disabled={sending || !ready}
                          invited={voice.invited}
                        />
                      ) : (
                        <button
                          type="submit"
                          aria-label="Send"
                          disabled={sending || !input.trim()}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ap-ink text-white transition-[background-color,transform] active:scale-95 disabled:cursor-not-allowed disabled:bg-ap-muted disabled:active:scale-100 sm:h-12 sm:w-12"
                        >
                          <svg
                            aria-hidden="true"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 19V5" />
                            <path d="M5 12l7-7 7 7" />
                          </svg>
                        </button>
                      )}
                    </form>
                    {/* Phones: one row above the composer that scrolls sideways. Wider screens: under
                      it, centred, never more than two rows (Mark, 21 Nov). */}
                    {showChips ? (
                      // Phones: a still row that scrolls sideways by hand, and a prompt that gets
                      // the keyboard's focus is scrolled into view. It glided in an endless loop
                      // until round-2 audit A11Y-6 (WCAG 2.2.2: nothing could stop it, and a
                      // focused prompt slid off the screen). Wider screens: the board's two rows.
                      <div className="order-first -mx-3 overflow-x-auto px-3 [mask-image:linear-gradient(to_right,transparent,#000_14px,#000_calc(100%-24px),transparent)] [scrollbar-width:none] sm:order-none sm:mx-0 sm:max-h-[66px] sm:overflow-hidden sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden">
                        <div className="flex w-max gap-1.5 pr-1.5 sm:w-auto sm:flex-wrap sm:justify-center sm:pr-0">
                          {miraConfig.starterChips.map((chip, i) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => send(chip)}
                              style={{ animationDelay: `${440 + Math.min(i, 7) * 45}ms` }}
                              className={CHIP}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
              {/* Never after an under-18 stop (nobody under 18 is pointed at an account), nor
                  right under a reply that brought the support lines, like the card. */}
              {!gate &&
              !minor &&
              !lastHadLines &&
              freeLeft !== null &&
              freeLeft <= 3 &&
              !signedIn ? (
                <p className="mt-2 text-center text-[12px] text-ap-muted">
                  {freeLeft === 0
                    ? "That was your last free message: the next one needs a free account."
                    : `${freeLeft} more free ${freeLeft === 1 ? "message" : "messages"} before you need a free account.`}
                </p>
              ) : null}
              {/* Always there, so a screen reader hears the line when it comes. */}
              <p
                aria-live="polite"
                className="mt-2 text-center text-[13px] text-ap-muted empty:mt-0"
              >
                {notice}
              </p>
              {error ? (
                <div className="mt-2 text-center">
                  <p role="alert" className="text-[13px] text-ap-bad-ink">
                    {error.text}
                    {error.signIn ? (
                      <>
                        {" "}
                        <Link href="/mira/start" className="font-semibold underline">
                          Sign in again
                        </Link>
                      </>
                    ) : null}
                    {error.retry && chatId ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          onClick={() => void openChat(chatId)}
                          className="font-semibold underline"
                        >
                          Try again
                        </button>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ap-muted">
                    If you&apos;re in danger right now, open{" "}
                    <button
                      type="button"
                      onClick={() => setSupportOpen(true)}
                      className="underline"
                    >
                      Need support
                    </button>
                  </p>
                </div>
              ) : null}
            </div>
            {empty ? <div aria-hidden="true" className="hidden min-h-0 flex-1 sm:block" /> : null}
            {showWelcome ? <ReviewsWelcome place="foot" /> : null}
            <p className="shrink-0 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5 text-center text-[12px] leading-snug text-ap-muted sm:pb-5">
              Mira is an AI and can be wrong. She is not a therapist ·{" "}
              <button type="button" onClick={() => setSupportOpen(true)} className="underline">
                Need support right now?
              </button>
            </p>
          </main>
        </div>
      </div>

      <footer className="mx-auto max-w-[760px] px-4 pb-8 pt-4 sm:px-6">
        <p className="text-[12px] leading-relaxed text-ap-muted">{DISCLAIMER}</p>
        <LegalLinks className="mt-4" />
      </footer>

      {pending !== null ? (
        <Modal label="Before your first message" onClose={() => setPending(null)}>
          <h2
            data-autofocus
            tabIndex={-1}
            className="font-serif text-[22px] font-medium outline-none"
          >
            Before your first message
          </h2>
          <div className="mt-3 flex flex-col gap-3 text-[14px] leading-snug text-ap-body">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={tick}
                onChange={(e) => setTick(e.target.checked)}
                className="mt-[2px] h-[18px] w-[18px] shrink-0 accent-ap-purple"
              />
              <span>
                I&apos;m 18 or older, and I agree that Mira may process what I share about my sex
                life and health to coach me, and to count, without my words, how Mira is used and
                whether she helps. Our analytics tools also see what I type.{" "}
                <Link href="/mira/privacy" className="underline">
                  How Mira handles your data
                </Link>
              </span>
            </label>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="min-h-[44px] px-4 text-[15px] font-semibold text-ap-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={agree}
              disabled={!tick}
              className="inline-flex min-h-[44px] items-center rounded-full bg-ap-ink px-5 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:bg-ap-track disabled:text-ap-muted"
            >
              Start chatting
            </button>
          </div>
        </Modal>
      ) : null}
      {deleting ? (
        <Modal label="Delete this chat?" onClose={() => setDeleting(null)}>
          <h2
            data-autofocus
            tabIndex={-1}
            className="font-serif text-[22px] font-medium outline-none"
          >
            Delete this chat?
          </h2>
          <p className="mt-2 text-[14px] leading-snug text-ap-body">
            Its messages, and any voice session in it, are deleted for good. This can&apos;t be
            undone. Your other chats stay.
          </p>
          {deleteError ? (
            <p role="alert" className="mt-3 text-[14px] text-ap-bad-ink">
              {deleteError}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="min-h-[44px] rounded-full border border-ap-line px-5 text-[15px] font-semibold"
            >
              Cancel
            </button>
            {/* Not `disabled` while deleting: focus stays on it (it ignores the second press). */}
            <button
              type="button"
              aria-disabled={deleting === "busy"}
              onClick={() => void deleteThisChat()}
              className="min-h-[44px] rounded-full bg-ap-bad px-5 text-[15px] font-semibold text-white aria-disabled:opacity-50"
            >
              {deleting === "busy" ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      ) : null}
      {styleOpen ? (
        <CoachingStylePanel value={style} onClose={() => setStyleOpen(false)} onSave={saveStyle} />
      ) : null}
      {supportOpen || crisis ? (
        <SupportPanel
          highlight={crisis ?? (country ? { code: country } : null)}
          onClose={() => {
            setSupportOpen(false);
            setCrisis(null);
          }}
        />
      ) : null}
    </div>
  );
}

const MIRA_INK =
  "bg-[linear-gradient(135deg,#fe6839_0%,#bf66d9_43%,#958ef6_100%)] bg-clip-text font-semibold text-transparent";
const CARD = "rounded-[20px] border border-ap-line bg-white/90 p-4";
const CHIP =
  "h-[34px] shrink-0 whitespace-nowrap rounded-full border border-ap-line bg-white px-[13px] text-[13px] font-medium text-ap-body transition-[background-color,border-color,transform] hover:border-ap-mist hover:bg-ap-ground active:scale-[0.97] motion-safe:animate-mira-in sm:h-[30px]";
const FREE_LABEL =
  ANON_FREE_MESSAGES === 1 ? "free message" : `${ANON_FREE_MESSAGES} free messages`;
/** A message after the free one(s), back in the box (R3-CHAT-4). */
const NOT_SENT = "That message wasn't sent: create a free account to send it.";
const ICON_BUTTON =
  "relative inline-flex h-9 w-9 items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-ap-body transition-colors hover:bg-ap-ground disabled:opacity-40 min-[360px]:h-10 min-[360px]:w-10 sm:w-auto sm:px-3";
/** A rating is final: once one thumb is chosen, the other says it's unavailable (CHAT-6). */
const RATE_BUTTON =
  "inline-flex h-9 min-w-[36px] items-center justify-center rounded-full hover:bg-ap-ground hover:text-ap-body aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ap-muted";

/**
 * Mira cites a guide practice by its address, "loveiq.org/mira/guide#practice-1" (prompt.ts): it
 * becomes a link to this site's own guide (staging's on staging), so it can be tapped (round-2
 * audit CHAT-5). Nothing else in her words is ever a link.
 */
const GUIDE_ADDRESS = /(?:https?:\/\/)?(?:www\.)?loveiq\.org(\/mira\/guide(?:#practice-[1-7])?)/g;

function withGuideLinks(text: string): ReactNode {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(GUIDE_ADDRESS)) {
    out.push(
      text.slice(at, m.index),
      <Link key={m.index} href={m[1]!} className="font-semibold text-ap-link underline">
        {m[0]}
      </Link>
    );
    at = m.index + m[0].length;
  }
  return out.length ? [...out, text.slice(at)] : text;
}

function SlidersIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.4 2.6a1 1 0 0 1 3 3l-9 9a2 2 0 0 1-.85.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#bf66d9"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-1.5 inline-block align-[-2px]"
    >
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  );
}

function ThumbIcon({ up = false }: { up?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {up ? (
        <>
          <path d="M7 10v11" />
          <path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4-8a3 3 0 0 1 4 3.9z" />
        </>
      ) : (
        <>
          <path d="M17 14V3" />
          <path d="M9 18.1 10 14H4.2a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 5.6 3H17v11l-4 8a3 3 0 0 1-4-3.9z" />
        </>
      )}
    </svg>
  );
}
