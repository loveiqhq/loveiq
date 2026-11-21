"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { ANON_FREE_MESSAGES, CONSENT_VERSION } from "@features/mira/server/config";
import { BodyCheck } from "./BodyCheck";
import { CoachingStylePanel, type Style } from "./CoachingStylePanel";
import { GOAL_STARTER, GoalSuggestion } from "./goals/GoalSuggestion";
import { ANSWER_CHIP, IntakeAnswers } from "./IntakeAnswers";
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
 * Decisions kept from 18 Nov: typing only (no voice yet), no invented numbers or quotes on the
 * page (so V2's "trained on 100M+ words" line and its review score are not shown), the 18+ and
 * sensitive-data consent before the first anonymous message (now a short step when it is sent),
 * and the sign-up card once an anonymous person's free message is answered. Board "01
 * Anonymous chat (embed) copy": the "Keep this chat" card after Mira's first reply.
 */

/** `live`: written in this page view, so it animates in (a restored chat does not replay). */
type Message = LocalTurn & {
  messageId?: number | null;
  live?: boolean;
  /** A small goal Mira offers with this reply (Challenges & goals); this page view only. */
  goal?: string;
};
type BodyDue = "baseline" | "week4" | null;
type CrisisCountry = SupportCountry;
type ChatSummary = { id: string; title: string; updated_at: string };

/** Sanjin's intake invitation: Mira's own message after her first reply, with two reply buttons. */
const isInvitation = (m: Turn) =>
  m.role === "assistant" && m.content === miraConfig.intakeInvitation;
/** A stop rail fired in this chat (the fixed message, or a reply the model marked): no questions
 *  or cards of ours follow it. */
const crisisIn = (turns: LocalTurn[]) =>
  turns.some(
    (t) => t.role === "assistant" && (t.crisis === true || t.content === miraConfig.crisisMessage)
  );
const SKIP_ANSWER = "I’d rather skip this one.";

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
}: {
  signedIn: boolean;
  initialChatId: string | null;
  /** The guide's "Ask Mira about this": the composer starts with it; only the person sends it. */
  starter?: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(starter ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; signIn?: boolean } | null>(null);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [gate, setGate] = useState(false);
  const [consented, setConsented] = useState(signedIn);
  const [tick, setTick] = useState(false);
  // A first message waiting for the consent step: sent once the person agrees.
  const [pending, setPending] = useState<string | null>(null);
  // "Not now" on the "Keep this chat" card: away for this chat (kept with it in this browser).
  const [keepOff, setKeepOff] = useState(false);
  const keepLogged = useRef(false);
  // Until this browser's chat (or the opened one) is loaded, the consent tick and the starter
  // prompts may not belong on screen: they are left out rather than flashed.
  const [ready, setReady] = useState(signedIn && !initialChatId);
  const [style, setStyle] = useState<Style>({});
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(initialChatId);
  const [crisis, setCrisis] = useState<CrisisCountry | null>(null);
  // Said they are under 18: nothing of this chat is kept in the browser any more.
  const [minor, setMinor] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  // The logo while the sign-up card shows: back to the start without losing the chat the card
  // promises to bring along (no message can be sent from there, so nothing mixes).
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
  /** The index of the reply that just arrived, for the scroll to its start. */
  const replyAt = useRef<number | null>(null);
  useReloadWhenRestored();
  // Talking to Mira (features/mira/ui/voice): spoken turns go through send like typed ones, and
  // the microphone waits while a panel is open over the chat (the support lines above all).
  const voice = useVoice({
    onTurn: (text, o) => void send(text, { ...o, voice: true }),
    chatId: () => chatId,
    held: supportOpen || crisis !== null || styleOpen,
  });
  const voiceOn = voice.phase !== "off";

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
        if (saved.keepOff) setKeepOff(true);
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
        profile: { style: Style };
        bodyCheck?: { due: BodyDue };
      }>("/api/mira/me");
      if (me.ok) {
        setChats(me.data.chats);
        setStyle(me.data.profile.style ?? {});
        setBodyDue(me.data.bodyCheck?.due ?? null);
      }
      if (initialChatId) {
        const chat = await miraApi<{
          messages: Array<Message & { id: number; rating: number | null; ask: string | null }>;
        }>(`/api/mira/chats/${initialChatId}`);
        if (chat.ok) {
          setMessages(
            chat.data.messages.map((m) => ({
              role: m.role,
              content: m.content,
              sources: m.sources ?? undefined,
              messageId: m.id,
              rated: m.rating === 1 || m.rating === -1 ? m.rating : undefined,
              ask: m.ask ?? undefined,
            }))
          );
        } else {
          setChatId(null);
        }
      }
      setReady(true);
    })();
  }, [signedIn, initialChatId]);

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
      turns: messages.map(({ role, content, sources, rated, ask, crisis }) => ({
        role,
        content,
        sources,
        rated,
        ask,
        crisis,
      })),
      freeLeft,
      ...(gate ? { gate: true } : {}),
      ...(keepOff ? { keepOff: true } : {}),
    });
  }, [ready, signedIn, minor, messages, freeLeft, gate, keepOff]);

  // "Ask Mira to help" on the goals card (/mira?prompt=goal): the question waits in the
  // composer, unsent, and the address loses the parameter so a reload doesn't bring it back.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("prompt") !== "goal") return;
    window.history.replaceState(null, "", "/mira");
    setInput(GOAL_STARTER); // eslint-disable-line react-hooks/set-state-in-effect
    inputRef.current?.focus();
  }, []);

  // The composer grows with what is typed, up to about six lines, then scrolls inside.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`;
  }, [input]);

  async function send(
    text: string,
    opts: { skip?: boolean; agreed?: boolean; voice?: boolean } = {}
  ) {
    const message = text.trim();
    if (!message || sending || gate) return;
    // A message right after Mira asked an intake question answers it, tapped or typed; a skip
    // doesn't. Only the question's id is sent, for the "how well Mira knows you" figures.
    const last = messages.at(-1);
    const answering = !opts.skip && last?.role === "assistant" ? last.ask : null;
    // An offer nobody started gives way to the conversation; a check in progress stays.
    if (bodyOpen && !bodyStarted.current) setBodyOpen(false);
    setReviewFrom(null); // so does the ask for a rating
    // Nothing reaches Mira before the consent: the message waits for the consent step.
    if (!consented && !opts.agreed) {
      setPending(message);
      return;
    }
    setError(null);
    if (showTip) setTipSeen(true);
    const firstOfChat = !chatId && messages.length === 0;
    const history = messages.map(({ role, content }) => ({ role, content })).slice(-24);
    const next: Message[] = [...messages, { role: "user", content: message, live: true }];
    setMessages(next);
    setInput("");
    setSending(true);
    const res = await miraApi<{
      reply?: string;
      sources?: Source[];
      crisis?: boolean;
      crisisLines?: CrisisCountry;
      chatId?: string | null;
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
        ...(chatId ? { chatId } : { history }),
        ...(signedIn ? {} : { style }),
        ...(answering ? { answering } : {}),
        ...(opts.voice ? { voice: { session: voice.sessionId() ?? undefined } } : {}),
      },
    });
    setSending(false);
    if (opts.voice) voice.answered(res); // she says the reply, or listens again
    if (res.data.gate) {
      setGate(true);
      setFreeLeft(0);
      return;
    }
    if (!res.ok || !res.data.reply) {
      setMessages(messages);
      setInput(message);
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
    setFreeLeft(res.data.freeLeft ?? freeLeft);
    // The last free message's reply brings the sign-up card. Not beside a crisis reply: the
    // composer stays, and the server answers a crisis message whatever the limits.
    if (res.data.freeLeft === 0 && !res.data.crisis) setGate(true);
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
        { id: res.data.chatId!, title: message.slice(0, 80), updated_at: new Date().toISOString() },
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

  /** An answer button: answered out loud in voice mode, as typed otherwise. */
  const reply = (text: string, o?: { skip?: boolean }) =>
    voiceOn ? voice.say(text, o) : void send(text, o);

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
    setMessages([]);
    setChatId(null);
    setError(null);
    setNps(null);
    setKeepOff(false); // a new chat may be kept again
    keepLogged.current = false;
    window.history.replaceState(null, "", "/mira");
    if (signedIn) return;
    // The free messages are used: a new chat needs the free account too.
    if (freeLeft === 0) {
      setGate(true);
      void miraApi("/api/mira/event", { body: { type: "track", name: "gate_shown" } });
    }
  }

  /** The logo: back to Mira's start. A new chat, unless that would wipe the one sign-up keeps. */
  function goToStart() {
    if (sending || voiceOn) return;
    if (gate && !signedIn) setAtStart(true);
    else newChat();
  }

  async function saveStyle(next: Style): Promise<string | null> {
    if (signedIn) {
      const res = await miraApi("/api/mira/me", { method: "PATCH", body: { style: next } });
      if (!res.ok) return res.data.error ?? "Unable to save. Please try again.";
    } else local.saveStyle(next);
    setStyle(next);
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
  // "Keep this chat" (board 01 copy): once Mira has replied to an anonymous person, but never
  // beside her intake invitation (it comes first; the card follows the next reply), the NPS
  // question or a crisis in this chat, and not while a reply is on its way.
  const showKeep =
    !signedIn &&
    ready &&
    !gate &&
    !keepOff &&
    !sending &&
    !nps &&
    last?.role === "assistant" &&
    !isInvitation(last) &&
    !last.ask &&
    !last.goal && // Mira's goal offer goes first; its sign-up path keeps the chat too
    !minor &&
    !crisisIn(messages);

  // A tapped prompt (or the consent step it opened) goes away with the welcome: focus moves to
  // the conversation rather than being lost, without opening a phone's keyboard.
  useEffect(() => {
    if (started && document.activeElement === document.body)
      listRef.current?.focus({ preventScroll: true });
  }, [started]);

  useEffect(() => {
    if (!showKeep || keepLogged.current) return;
    keepLogged.current = true; // once a chat, per page view
    void miraApi("/api/mira/event", { body: { type: "track", name: "keep_card_shown" } });
  }, [showKeep]);

  // "Make Mira yours": once per browser, after a reply of Mira's when nothing else asks for the
  // person's attention (no question with answer buttons, card, check, panel or crisis).
  const showTip =
    tipSeen === false &&
    !showKeep && // one ask at a time: the "Keep this chat" card goes first
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

  function keepNotNow() {
    setKeepOff(true);
    void miraApi("/api/mira/event", { body: { type: "track", name: "keep_card_not_now" } });
    document.getElementById("mira-input")?.focus(); // the pressed button is about to go
  }

  const empty = !started || atStart;
  // A chat opened by its link loads first: the welcome would only flash before it.
  const showWelcome = empty && (ready || !initialChatId);
  const showChips = ready && empty && !gate;

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
                    className={`${ICON_BUTTON} ${showTip ? "bg-ap-ground ring-2 ring-[#e7d8f8]" : ""}`}
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
              <p className="px-3 pb-1 text-[12px] font-semibold text-ap-quiet">Your chats</p>
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

          <main className="flex min-w-0 flex-1 flex-col">
            {/* Wider screens: the welcome, the composer and the prompts sit together in the
                middle (the board); the spacers give way to the chat once it starts. */}
            {empty ? <div aria-hidden="true" className="hidden min-h-0 flex-1 sm:block" /> : null}
            <div
              ref={listRef}
              aria-live="polite"
              tabIndex={-1}
              className={
                empty
                  ? "flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-5 pb-[6dvh] outline-none sm:flex-initial sm:px-6 sm:pb-0"
                  : "min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none [mask-image:linear-gradient(to_bottom,transparent,#000_20px)] [scrollbar-color:#ddd7e6_transparent] [scrollbar-width:thin]"
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
                          {m.content}
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
                        <GoalSuggestion text={m.goal} signedIn={signedIn} />
                      ) : null}
                      {m.role === "assistant" && !isInvitation(m) ? (
                        <div
                          className={`-ml-2 flex flex-wrap items-center text-[12px] text-ap-muted ${m.live ? "[animation-delay:250ms] motion-safe:animate-mira-reply" : ""}`}
                        >
                          <button
                            type="button"
                            aria-label="Helpful"
                            aria-pressed={m.rated === 1}
                            onClick={() => rate(m, 1)}
                            className={`${RATE_BUTTON} ${m.rated === 1 ? "text-ap-purple" : ""}`}
                          >
                            <ThumbIcon up />
                          </button>
                          <button
                            type="button"
                            aria-label="Not helpful"
                            aria-pressed={m.rated === -1}
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
                  {showKeep ? (
                    <div
                      className={`${CARD} flex flex-col gap-3 motion-safe:animate-mira-reply sm:flex-row sm:items-center sm:gap-4`}
                    >
                      <p className="flex-1 text-[14px] leading-normal text-ap-body">
                        Would you like Mira to remember this conversation next time? Sign in and she
                        can also gently tailor things to your LoveIQ result.
                      </p>
                      <div className="flex shrink-0 items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={keepNotNow}
                          className="min-h-[44px] px-3.5 text-[14px] font-semibold text-ap-muted"
                        >
                          Not now
                        </button>
                        {/* This browser's chat goes into the new account at sign-up. */}
                        <Link
                          href="/mira/start"
                          onClick={() =>
                            void miraApi("/api/mira/event", {
                              body: { type: "track", name: "keep_card_keep" },
                            })
                          }
                          className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
                        >
                          Keep this chat
                        </Link>
                      </div>
                    </div>
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
                                className="h-10 min-w-[40px] rounded-full border border-ap-line bg-white text-[14px] hover:border-[#d9d4e2] hover:bg-ap-ground"
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
                      <span className="sr-only">Mira is writing…</span>
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
                </div>
              ) : null}
            </div>

            <div className="mx-auto w-full max-w-[760px] shrink-0 px-3 pt-1 sm:px-6 sm:pt-0">
              {/* A voice session keeps its panel (and End) while Mira says her last free reply;
                  the sign-up card follows once the session ends. */}
              {voiceOn ? (
                <VoicePanel voice={voice} onType={typeInstead} />
              ) : gate ? (
                <div
                  className={`${CARD} flex flex-col gap-3 shadow-[0_6px_24px_-14px_rgba(22,16,33,0.25)] sm:flex-row sm:items-center sm:gap-4 sm:p-5`}
                >
                  <div className="flex-1">
                    <p className="font-serif text-[18px] font-semibold">
                      Keep talking with Mira, for free
                    </p>
                    <p className="mt-1 text-[14px] leading-normal text-ap-body">
                      You&apos;ve had your {FREE_LABEL} with Mira. Create a free account to carry
                      on. She&apos;ll remember where you left off, and this chat comes with you.
                    </p>
                  </div>
                  <Link
                    href="/mira/start"
                    className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
                  >
                    Create free account
                  </Link>
                </div>
              ) : (
                <div
                  className={`flex flex-col gap-2.5 sm:gap-3.5 ${empty ? "[animation-delay:360ms] motion-safe:animate-mira-in" : ""}`}
                >
                  <form
                    className="flex items-end gap-1.5 rounded-[28px] border border-ap-line bg-white py-1.5 pl-5 pr-1.5 shadow-[0_6px_24px_-14px_rgba(22,16,33,0.25)] transition-colors focus-within:border-ap-lavender sm:py-2 sm:pl-6 sm:pr-2"
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
                    // Phones: the prompts glide in a loop, a transform animation run by the
                    // compositor (smooth, never in steps); a touch or hover holds them, so a tap
                    // lands where it was aimed. Reduced motion: still, and the row scrolls by hand.
                    // Wider screens: the board's two still rows.
                    <div className="group order-first -mx-3 overflow-hidden px-3 [mask-image:linear-gradient(to_right,transparent,#000_14px,#000_calc(100%-24px),transparent)] [scrollbar-width:none] motion-reduce:overflow-x-auto sm:order-none sm:mx-0 sm:max-h-[66px] sm:overflow-hidden sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex w-max group-hover:[animation-play-state:paused] group-active:[animation-play-state:paused] max-sm:will-change-transform max-sm:motion-safe:animate-mira-marquee sm:w-auto sm:flex-wrap sm:justify-center sm:gap-1.5">
                        <span className="flex shrink-0 gap-1.5 pr-1.5 sm:contents">
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
                        </span>
                        {/* The second run that closes the loop: hidden from assistive tech and the
                            tab order; never shown on wider screens or with reduced motion. */}
                        <span
                          aria-hidden="true"
                          className="flex shrink-0 gap-1.5 pr-1.5 motion-reduce:hidden sm:hidden"
                        >
                          {miraConfig.starterChips.map((chip, i) => (
                            <button
                              key={chip}
                              type="button"
                              tabIndex={-1}
                              onClick={() => send(chip)}
                              style={{ animationDelay: `${440 + Math.min(i, 7) * 45}ms` }}
                              className={CHIP}
                            >
                              {chip}
                            </button>
                          ))}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              {!gate && freeLeft !== null && freeLeft <= 3 && !signedIn ? (
                <p className="mt-2 text-center text-[12px] text-ap-muted">
                  {freeLeft === 0
                    ? "That was your last free message: the next one needs a free account."
                    : `${freeLeft} more free ${freeLeft === 1 ? "message" : "messages"} before you need a free account.`}
                </p>
              ) : null}
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

      <div className="mx-auto max-w-[760px] px-4 pb-8 pt-4 sm:px-6">
        <p className="text-[12px] leading-relaxed text-ap-muted">{DISCLAIMER}</p>
        <LegalLinks className="mt-4" />
      </div>

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
                className="mt-[2px] h-[18px] w-[18px] shrink-0 accent-[#795fc8]"
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
      {styleOpen ? (
        <CoachingStylePanel value={style} onClose={() => setStyleOpen(false)} onSave={saveStyle} />
      ) : null}
      {supportOpen || crisis ? (
        <SupportPanel
          highlight={crisis}
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
  "h-[34px] shrink-0 whitespace-nowrap rounded-full border border-ap-line bg-white px-[13px] text-[13px] font-medium text-ap-body transition-[background-color,border-color,transform] hover:border-[#d9d4e2] hover:bg-ap-ground active:scale-[0.97] motion-safe:animate-mira-in sm:h-[30px]";
const FREE_LABEL =
  ANON_FREE_MESSAGES === 1 ? "free message" : `${ANON_FREE_MESSAGES} free messages`;
const ICON_BUTTON =
  "relative inline-flex h-9 w-9 items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-ap-body transition-colors hover:bg-ap-ground disabled:opacity-40 min-[360px]:h-10 min-[360px]:w-10 sm:w-auto sm:px-3";
const RATE_BUTTON =
  "inline-flex h-9 min-w-[36px] items-center justify-center rounded-full hover:bg-ap-ground hover:text-ap-body";

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
