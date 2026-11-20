"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { CoachingStylePanel, type Style } from "./CoachingStylePanel";
import { SupportPanel } from "./SupportPanel";
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
 * first anonymous message, and the sign-up card when an anonymous person starts an 11th
 * conversation (Marcus's 10 free conversations).
 */

type Message = LocalTurn & { messageId?: number | null };
type CrisisCountry = {
  code: string;
  name: string;
  lines: { name: string; phone?: string; url?: string; hours?: string }[];
  emergency?: string;
};
type ChatSummary = { id: string; title: string; updated_at: string };

const CONSENT_VERSION = "mira-2026-11-18";
/** Sanjin's intake invitation: Mira's own message after her first reply, with two reply buttons. */
const isInvitation = (m: Turn) =>
  m.role === "assistant" && m.content === miraConfig.intakeInvitation;

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
  const ask = !crisisReply && convos >= 3 && replies >= 2 && due;
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
  // Until this browser's chat (or the opened one) is loaded, the consent tick and the starter
  // prompts may not belong on screen: they are left out rather than flashed.
  const [ready, setReady] = useState(signedIn && !initialChatId);
  const [style, setStyle] = useState<Style>({});
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(initialChatId);
  const [crisis, setCrisis] = useState<CrisisCountry | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  // The NPS question (Marcus's MVP success board): "ask" while open, "thanks" once answered.
  const [nps, setNps] = useState<"ask" | "thanks" | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
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
      }
      setConsented(local.consent() === CONSENT_VERSION);
      setStyle(local.style() ?? {});
      setReady(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    void (async () => {
      const me = await miraApi<{ chats: ChatSummary[]; profile: { style: Style } }>("/api/mira/me");
      if (me.ok) {
        setChats(me.data.chats);
        setStyle(me.data.profile.style ?? {});
      }
      if (initialChatId) {
        const chat = await miraApi<{
          messages: Array<Message & { id: number; rating: number | null }>;
        }>(`/api/mira/chats/${initialChatId}`);
        if (chat.ok) {
          setMessages(
            chat.data.messages.map((m) => ({
              role: m.role,
              content: m.content,
              sources: m.sources ?? undefined,
              messageId: m.id,
              rated: m.rating === 1 || m.rating === -1 ? m.rating : undefined,
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
  useEffect(() => {
    const list = listRef.current;
    if (list && messages.length > 0) list.scrollTop = list.scrollHeight;
  }, [messages, sending]);

  // The anonymous chat lives in this browser, with its sources and ratings, after every change
  // (nothing is written for a first visit until there is something to keep).
  useEffect(() => {
    if (!ready || signedIn || (messages.length === 0 && !local.chat())) return;
    local.saveChat({
      turns: messages.map(({ role, content, sources, rated }) => ({
        role,
        content,
        sources,
        rated,
      })),
      freeLeft,
      ...(gate ? { gate: true } : {}),
    });
  }, [ready, signedIn, messages, freeLeft, gate]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending || gate) return;
    if (!consented) {
      if (!tick) return;
      local.saveConsent(CONSENT_VERSION);
      setConsented(true);
      void miraApi("/api/mira/event", { body: { type: "track", name: "consent_given" } });
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
      signIn?: boolean;
    }>("/api/mira/chat", {
      body: {
        message,
        consent: true,
        ...(chatId ? { chatId } : { history }),
        ...(signedIn ? {} : { style }),
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
      },
      ...(res.data.invitation
        ? [{ role: "assistant" as const, content: res.data.invitation }]
        : []),
    ];
    setMessages(withReply);
    setFreeLeft(res.data.freeLeft ?? freeLeft);
    if (res.data.crisis && res.data.crisisLines) setCrisis(res.data.crisisLines);
    if (npsDue(firstOfChat, withReply, Boolean(res.data.crisis))) setNps("ask");
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
      body: m.messageId
        ? { type: "rating", rating, messageId: m.messageId }
        : { type: "rating", rating, reply: m.content.slice(0, 4000) },
    });
    if (!res.ok) {
      swap(rated, m);
      setError({ text: res.data.error ?? "Your rating didn't go through. Please try again." });
    }
  }

  function newChat() {
    setMessages([]);
    setChatId(null);
    setError(null);
    window.history.replaceState(null, "", "/mira");
    if (signedIn) return;
    // The 10 free conversations are used: a new one needs the free account.
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
        <h1 className="font-serif text-[26px] font-medium leading-[1.15] sm:text-[44px]">
          Talk to <span className="text-[#d05976]">Mira</span> about your body confidence
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ap-body sm:mt-3 sm:text-[16px]">
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
            className="min-h-[44px] rounded-full border border-ap-purple text-[14px] font-semibold text-[#561dbd]"
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
              className="min-h-[44px] rounded-full border border-ap-purple px-3 text-[14px] font-semibold text-[#561dbd]"
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
              <p className="text-[12px] text-ap-muted">AI coach · Body confidence · Beta</p>
            </div>
            <button
              type="button"
              onClick={() => setStyleOpen(true)}
              className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-ap-plum hover:bg-white"
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
              <div key={i} className="flex flex-col gap-1">
                <Bubble role={m.role} text={m.content} />
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
                    Create a free account so Mira can remember your answers. Your chat comes with
                    you.
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
                  <label className="mb-3 flex items-start gap-2 text-[13px] leading-snug text-ap-body">
                    <input
                      type="checkbox"
                      checked={tick}
                      onChange={(e) => setTick(e.target.checked)}
                      className="mt-[2px] h-4 w-4 accent-[#795fc8]"
                    />
                    <span>
                      I&apos;m 18 or older, and I agree that Mira may process what I share about my
                      sex life to coach me and to improve Mira. Our analytics tools also see what I
                      type.{" "}
                      <Link href="/mira/privacy" className="underline">
                        How Mira handles your data
                      </Link>
                    </span>
                  </label>
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
                      ? "This is your last free conversation before you need a free account."
                      : `${freeLeft} more free ${freeLeft === 1 ? "conversation" : "conversations"} before you need a free account.`}
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
