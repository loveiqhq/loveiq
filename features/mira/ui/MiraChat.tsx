"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { ANON_FREE_MESSAGES, CONSENT_VERSION } from "@features/mira/server/config";
import { BodyCheck } from "./BodyCheck";
import { CoachingStylePanel, type Style } from "./CoachingStylePanel";
import { IntakeAnswers } from "./IntakeAnswers";
import { SupportPanel, type SupportCountry } from "./SupportPanel";
import { DISCLAIMER, GradientButton, MiraFrame } from "./MiraShell";
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
 * signed in) as one screen. Decisions taken for Friday (18 Nov): typing only (spoken Talk comes
 * after), no invented numbers or quotes on the page, an 18+ and sensitive-data tick before the
 * first anonymous message, and the sign-up card once an anonymous person's 10 free messages are
 * answered (the 11th needs the free account). Board "01 Anonymous chat (embed) copy": the "Keep
 * this chat" card after Mira's first reply to an anonymous person.
 */

type Message = LocalTurn & { messageId?: number | null };
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
}: {
  signedIn: boolean;
  initialChatId: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; signIn?: boolean } | null>(null);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [gate, setGate] = useState(false);
  const [consented, setConsented] = useState(signedIn);
  const [tick, setTick] = useState(false);
  // "Mira's team may read replies I rate": the optional box, then the choice it recorded.
  const [share, setShare] = useState(false);
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
  // The NPS question (Marcus's MVP success board): "ask" while open, "thanks" once answered.
  const [nps, setNps] = useState<"ask" | "thanks" | null>(null);
  // The body check (Marcus's MVP success board): due from the account, offered once a page view.
  const [bodyDue, setBodyDue] = useState<BodyDue>(null);
  const [bodyOpen, setBodyOpen] = useState(false);
  const bodyOffered = useRef(false);
  const bodyStarted = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** The index of the reply that just arrived, for the scroll to its start. */
  const replyAt = useRef<number | null>(null);
  useReloadWhenRestored();

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
      setShare(given?.version === CONSENT_VERSION && given.shareRated === true);
      setStyle(local.style() ?? {});
      setReady(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
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
    if (reply) {
      list.scrollTop += reply.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
    } else list.scrollTop = list.scrollHeight;
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

  async function send(text: string, opts: { skip?: boolean } = {}) {
    const message = text.trim();
    if (!message || sending || gate) return;
    // A message right after Mira asked an intake question answers it, tapped or typed; a skip
    // doesn't. Only the question's id is sent, for the "how well Mira knows you" figures.
    const last = messages.at(-1);
    const answering = !opts.skip && last?.role === "assistant" ? last.ask : null;
    // An offer nobody started gives way to the conversation; a check in progress stays.
    if (bodyOpen && !bodyStarted.current) setBodyOpen(false);
    if (!consented) {
      if (!tick) return;
      local.saveConsent({ version: CONSENT_VERSION, shareRated: share });
      setConsented(true);
      void miraApi("/api/mira/event", {
        body: { type: "consent", version: CONSENT_VERSION, shareRated: share },
      });
    }
    setError(null);
    const firstOfChat = !chatId && messages.length === 0;
    const history = messages.map(({ role, content }) => ({ role, content })).slice(-24);
    const next: Message[] = [...messages, { role: "user", content: message }];
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
      signIn?: boolean;
      minor?: boolean;
    }>("/api/mira/chat", {
      body: {
        message,
        consent: true,
        ...(chatId ? { chatId } : { history }),
        ...(signedIn ? {} : { style }),
        ...(answering ? { answering } : {}),
      },
    });
    setSending(false);
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
        content: res.data.reply,
        sources: res.data.sources,
        messageId: res.data.messageId,
        ask: res.data.ask ?? undefined,
        ...(res.data.crisis ? { crisis: true } : {}),
      },
      ...(res.data.invitation
        ? [{ role: "assistant" as const, content: res.data.invitation }]
        : []),
    ];
    replyAt.current = next.length;
    setMessages(withReply);
    setFreeLeft(res.data.freeLeft ?? freeLeft);
    // The last free message's reply brings the sign-up card. Not beside a crisis reply: the
    // composer stays, and the server answers a crisis message whatever the limits.
    if (res.data.freeLeft === 0 && !res.data.crisis) setGate(true);
    if (res.data.crisis && res.data.crisisLines) setCrisis(res.data.crisisLines);
    if (res.data.minor) {
      // Under 18 (rail 15): the reply stays on screen, but this browser forgets the chat and the
      // 18+ tick, and no question of ours follows. An account's chats are gone on the server.
      local.forget();
      setMinor(true);
      setConsented(false);
      setTick(false);
      setShare(false);
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

  function answerNps(score: number | null) {
    void miraApi("/api/mira/event", { body: { type: "nps", score } });
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
        // The reply's words go along only when this browser ticked "Mira's team may read
        // replies I rate"; otherwise the thumbs only. A signed-in rating never sends them.
        ...(!signedIn && share ? { reply: m.content.slice(0, 4000) } : {}),
      },
    });
    if (!res.ok) {
      swap(rated, m);
      setError({ text: res.data.error ?? "Your rating didn't go through. Please try again." });
    }
  }

  /** Off while the sign-up card shows, so the chat it promises to bring along isn't wiped. */
  function newChat() {
    if (sending) return; // a reply on its way belongs to this chat
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

  async function saveStyle(next: Style): Promise<string | null> {
    if (signedIn) {
      const res = await miraApi("/api/mira/me", { method: "PATCH", body: { style: next } });
      if (!res.ok) return res.data.error ?? "Unable to save. Please try again.";
    } else local.saveStyle(next);
    setStyle(next);
    setStyleOpen(false);
    return null;
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
    !minor &&
    !crisisIn(messages);

  useEffect(() => {
    if (!showKeep || keepLogged.current) return;
    keepLogged.current = true; // once a chat, per page view
    void miraApi("/api/mira/event", { body: { type: "track", name: "keep_card_shown" } });
  }, [showKeep]);

  function keepNotNow() {
    setKeepOff(true);
    void miraApi("/api/mira/event", { body: { type: "track", name: "keep_card_not_now" } });
    document.getElementById("mira-input")?.focus(); // the pressed button is about to go
  }

  return (
    <MiraFrame
      right={
        signedIn ? (
          <Link href="/mira/home" className="text-[14px] font-semibold text-ap-plum">
            Home
          </Link>
        ) : (
          <Link href="/mira/start" className="text-[14px] font-semibold text-ap-plum">
            Sign in
          </Link>
        )
      }
    >
      <section className="mb-4 max-w-[720px] sm:mb-6 sm:mt-2">
        <h1 className="font-serif text-[26px] font-medium leading-[1.15] sm:text-[44px] [@media(max-height:760px)]:text-[22px]">
          Talk to <span className="text-[#d05976]">Mira</span> about your body confidence
        </h1>
        {/* On very short screens the message box comes first; the composer repeats "not a therapist". */}
        <p className="mt-2 text-[14px] leading-relaxed text-ap-body sm:mt-3 sm:text-[16px] [@media(max-height:760px)]:hidden">
          Her answers draw on research about body confidence. Mira is an AI coach, not a therapist.
        </p>
      </section>

      {/* As tall as the screen below the heading, so the composer is always in view; the
          messages scroll inside. The minimum keeps a first visit's consent tick and composer whole. */}
      <div className="flex h-[calc(100dvh-200px)] min-h-[400px] overflow-hidden sm:h-[calc(100dvh-280px)] sm:min-h-[min(520px,100dvh)] rounded-[27px] border border-ap-line bg-white shadow-[0_22px_54px_-20px_rgba(103,60,120,0.3)]">
        <aside className="hidden w-[260px] shrink-0 flex-col gap-3 border-r border-ap-line bg-[#faf9fc] p-4 lg:flex">
          <button
            type="button"
            onClick={newChat}
            disabled={sending || gate}
            className="min-h-[44px] rounded-full border border-ap-purple text-[14px] font-semibold text-[#561dbd] disabled:opacity-50"
          >
            + New chat
          </button>
          {signedIn ? (
            <nav aria-label="Your chats" className="flex flex-col gap-1 overflow-y-auto">
              {chats.length === 0 ? (
                <p className="px-2 text-[13px] text-ap-muted">Your chats will show here.</p>
              ) : null}
              {chats.map((c) => (
                <a
                  key={c.id}
                  href={`/mira?chat=${c.id}`}
                  className={`truncate rounded-lg px-3 py-2 text-[13px] ${c.id === chatId ? "bg-ap-lilac font-semibold" : "text-ap-body hover:bg-ap-track"}`}
                >
                  {c.title}
                </a>
              ))}
            </nav>
          ) : (
            <div className="mt-auto rounded-2xl border border-[#e6b65c99] bg-[#fdf3dc] p-4 text-[13px] text-ap-body">
              <p className="font-bold text-ap-ink">Get more from Mira</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
                <li>Your chats saved</li>
                <li>Answers that build on your story</li>
                <li>Coaching based on your test result</li>
              </ul>
              <Link
                href="/mira/start"
                className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-full bg-black text-[13px] font-bold text-white"
              >
                Create free account
              </Link>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* The sidebar's actions on phones and tablets, where the sidebar is hidden. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ap-line bg-[#faf9fc] px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={newChat}
              disabled={sending || gate}
              className="min-h-[44px] rounded-full border border-ap-purple px-3 text-[14px] font-semibold text-[#561dbd] disabled:opacity-50"
            >
              New chat
            </button>
            {signedIn ? (
              <Link
                href="/mira/home"
                className="inline-flex min-h-[44px] items-center px-2 text-[14px] font-semibold text-ap-plum"
              >
                Your chats
              </Link>
            ) : (
              <Link
                href="/mira/start"
                className="inline-flex min-h-[44px] items-center rounded-full bg-black px-3 text-[13px] font-bold text-white"
              >
                Create free account
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3 bg-ap-lilac px-5 py-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#fe6839] to-[#bf66d9] font-serif text-[18px] font-bold text-white"
            >
              M
            </span>
            <div className="flex-1">
              <p className="font-serif text-[18px] font-semibold leading-tight">Mira</p>
              {/* One line on phones, where every line of the chat's height counts. */}
              <p className="text-[12px] text-ap-muted">
                <span className="sm:hidden">AI coach · Beta</span>
                <span className="hidden sm:inline">AI coach · Body confidence · Beta</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStyleOpen(true)}
              disabled={!ready}
              className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-ap-plum hover:bg-white disabled:opacity-50"
            >
              How Mira coaches you
            </button>
          </div>

          <div
            ref={listRef}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scroll-smooth px-4 py-5 sm:px-6"
            aria-live="polite"
          >
            <Bubble role="assistant" text={miraConfig.openingMessage} />
            {ready && !started && !gate ? (
              <div aria-live="off" className="flex flex-wrap gap-2 pl-1">
                {miraConfig.starterChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={!consented && !tick}
                    onClick={() => send(chip)}
                    className="min-h-[40px] rounded-full border border-ap-mist px-4 text-left text-[13px] text-[#561dbd] hover:border-ap-purple disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div key={i} data-msg={i} className="flex flex-col gap-1">
                <Bubble role={m.role} text={m.content} />
                {m.role === "assistant" &&
                m.ask &&
                i === messages.length - 1 &&
                !sending &&
                !gate ? (
                  <IntakeAnswers
                    questionId={m.ask}
                    onAnswer={(answer) => void send(answer)}
                    onSkip={() => void send(SKIP_ANSWER, { skip: true })}
                  />
                ) : null}
                {isInvitation(m) && i === messages.length - 1 && !sending && !gate ? (
                  <div className="flex flex-wrap gap-2 pl-1">
                    {miraConfig.intakeReplyButtons.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => send(label)}
                        className="min-h-[40px] rounded-full border border-ap-mist px-4 text-[13px] text-[#561dbd] hover:border-ap-purple"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {m.role === "assistant" && !isInvitation(m) ? (
                  <div className="flex flex-wrap items-center gap-3 pl-1 text-[12px] text-ap-muted">
                    {m.sources?.length ? (
                      <span className="[overflow-wrap:anywhere]">
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
                    <button
                      type="button"
                      aria-label="Helpful"
                      aria-pressed={m.rated === 1}
                      onClick={() => rate(m, 1)}
                      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center ${m.rated === 1 ? "text-ap-purple" : ""}`}
                    >
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M7 10v11" />
                        <path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4-8a3 3 0 0 1 4 3.9z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Not helpful"
                      aria-pressed={m.rated === -1}
                      onClick={() => rate(m, -1)}
                      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center ${m.rated === -1 ? "text-ap-purple" : ""}`}
                    >
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 14V3" />
                        <path d="M9 18.1 10 14H4.2a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 5.6 3H17v11l-4 8a3 3 0 0 1-4-3.9z" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {showKeep ? (
              <div className="mt-1.5 flex flex-col gap-3 rounded-[20px] bg-ap-lilac px-5 py-[18px] sm:flex-row sm:items-center sm:gap-4">
                <div className="flex flex-1 items-start gap-3 sm:items-center sm:gap-4">
                  <svg
                    aria-hidden="true"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-ap-purple"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className="text-[15px] leading-normal text-ap-body">
                    Would you like Mira to remember this conversation next time? Sign in and she can
                    also gently tailor things to your LoveIQ result.
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={keepNotNow}
                    className="min-h-[44px] px-3.5 text-[14px] font-semibold text-ap-plum"
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
                    className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] to-[#958ef6] px-5 text-[14px] font-bold text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)]"
                  >
                    Keep this chat
                  </Link>
                </div>
              </div>
            ) : null}
            {nps ? (
              <div className="rounded-2xl border border-ap-line bg-[#faf9fc] p-4">
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
                          className="min-h-[44px] min-w-[44px] rounded-full border border-ap-line bg-white text-[14px] hover:border-ap-purple"
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
            {sending ? <p className="pl-1 text-[13px] text-ap-muted">Mira is writing…</p> : null}
          </div>

          <div className="border-t border-ap-line px-4 py-4 sm:px-6">
            {gate ? (
              <div className="flex flex-col gap-3 rounded-2xl bg-ap-lilac p-5 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="font-serif text-[20px] font-semibold">
                    Keep talking with Mira, for free
                  </p>
                  <p className="mt-1 text-[14px] text-ap-body">
                    You&apos;ve had your {ANON_FREE_MESSAGES} free messages with Mira. Create a free
                    account to carry on. She&apos;ll remember where you left off, and this chat
                    comes with you.
                  </p>
                </div>
                <Link
                  href="/mira/start"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-black px-6 text-[15px] font-bold text-white"
                >
                  Create free account
                </Link>
              </div>
            ) : (
              <>
                {ready && !consented ? (
                  <div className="mb-3 flex flex-col gap-2 text-[13px] leading-snug text-ap-body [@media(max-height:760px)]:mb-2 [@media(max-height:760px)]:gap-1 [@media(max-height:760px)]:text-[12px]">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={tick}
                        onChange={(e) => setTick(e.target.checked)}
                        className="mt-[2px] h-4 w-4 accent-[#795fc8]"
                      />
                      <span>
                        I&apos;m 18 or older, and I agree that Mira may process what I share about
                        my sex life and health to coach me, and to count, without my words, how Mira
                        is used and whether she helps. Our analytics tools also see what I type.{" "}
                        <Link href="/mira/privacy" className="underline">
                          How Mira handles your data
                        </Link>
                      </span>
                    </label>
                    {/* Optional and unticked: only with it does a rated reply keep its words. */}
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={share}
                        onChange={(e) => setShare(e.target.checked)}
                        className="mt-[2px] h-4 w-4 accent-[#795fc8]"
                      />
                      <span>Mira&apos;s team may read replies I rate, to improve Mira.</span>
                    </label>
                  </div>
                ) : null}
                <form
                  className="flex gap-2"
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
                    placeholder="Type how it feels, in your own words…"
                    className="min-h-[72px] flex-1 resize-none rounded-3xl sm:min-h-[48px] border border-ap-line px-4 py-3 text-[16px] outline-none focus:border-ap-purple"
                  />
                  <GradientButton
                    type="submit"
                    disabled={sending || !input.trim() || (!consented && !tick)}
                  >
                    Send
                  </GradientButton>
                </form>
                {freeLeft !== null && freeLeft <= 3 && !signedIn ? (
                  <p className="mt-2 text-[12px] text-ap-muted">
                    {freeLeft === 0
                      ? "That was your last free message: the next one needs a free account."
                      : `${freeLeft} more free ${freeLeft === 1 ? "message" : "messages"} before you need a free account.`}
                  </p>
                ) : null}
              </>
            )}
            {error ? (
              <>
                <p role="alert" className="mt-2 text-[13px] text-ap-bad-ink">
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
                <p className="mt-1 text-[12px] text-ap-muted">
                  If you&apos;re in danger right now, open{" "}
                  <button type="button" onClick={() => setSupportOpen(true)} className="underline">
                    Need support
                  </button>
                </p>
              </>
            ) : null}
            <p className="mt-3 text-center text-[12px] text-ap-muted">
              Mira is an AI and can be wrong. She is not a therapist ·{" "}
              <button type="button" onClick={() => setSupportOpen(true)} className="underline">
                Need support right now?
              </button>
            </p>
          </div>
        </div>
      </div>

      <p className="mt-6 max-w-[760px] text-[12px] leading-relaxed text-ap-muted">{DISCLAIMER}</p>

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
    </MiraFrame>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  return role === "user" ? (
    <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-3xl bg-ap-purple px-4 py-3 text-[15px] leading-relaxed text-white [overflow-wrap:anywhere]">
      {text}
    </div>
  ) : (
    <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-[#f4f2f7] px-4 py-3 text-[15px] leading-relaxed text-ap-ink [overflow-wrap:anywhere]">
      {text}
    </div>
  );
}
