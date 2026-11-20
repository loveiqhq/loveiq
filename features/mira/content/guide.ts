/**
 * The body confidence guide at /mira/guide, and the practices Mira gives when asked.
 *
 * Text: Sanjin Kacevac's draft "GUIDE1_How to Stop Feeling Self-Conscious During Sex" (Drive,
 * 22 Oct 2026), shaped by his spec "Body Confidence Guide Prompt" (26 Oct) and his later fixes
 * (Notion, 10 Nov: practice 7 step 4 starts without talking; practice numbers as Mira uses them).
 * Changed only where the spec, the fixes or inclusivity asked: trimmed toward 3,000 words; only
 * the spec's verified figures; no statistics from papers; seven practices in Mira's three stages
 * (practice 1 is built from his own lines on noticing, as the draft had no separate practice for
 * it); for everyone, with one plain note that most of the research was done with women; and the
 * help section matches Mira's rails (system-prompt.ts, rails 11 and 12).
 *
 * Numbers in the prose must be the spec's verified figures (the tests check it); practice and
 * step numbers come from the page, and durations live in `time`.
 */

export type GuidePractice = {
  number: number;
  name: string;
  time: string;
  bestFor: string;
  intro: string[];
  steps: string[];
  after: string[];
  /** One plain sentence. */
  why: string;
};

export type GuideStage = { title: string; intro: string; practices: GuidePractice[] };

export type GuidePart = {
  heading?: string;
  paragraphs?: string[];
  steps?: Array<{ title: string; text: string }>;
};

export type GuideSection = {
  id: string;
  title: string;
  parts: GuidePart[];
  stages?: GuideStage[];
};

/** Every practice ends with this line (the spec's rule). */
export const SKIP_IT = "If this feels hard, skip it.";

export type Guide = {
  kicker: string;
  title: string;
  subtitle: string;
  sections: GuideSection[];
  sources: { loveiq: string[]; cards: string[]; other: string[] };
};

export const GUIDE: Guide = {
  kicker: "A LoveIQ practical guide",
  title: "How to stop feeling self-conscious during sex",
  subtitle:
    "Why your mind gets in the way of pleasure, and practical ways to feel more confident and present in your body.",
  sections: [
    {
      id: "not-alone",
      title: "Why so many of us want to feel more confident during sex",
      parts: [
        {
          paragraphs: [
            "Maybe you chose “Feeling more confident in my own body” when you took the LoveIQ test. Maybe you found this guide another way. Either way, you're far from alone: 45% of the women who took our test chose the same thing.",
            "Perhaps you know what it's like to be enjoying a kiss, then suddenly wonder how you look.",
            "It's exhausting to feel watched, especially when the person doing most of the watching is you. But feeling more confident during sex may have less to do with your body than with where your attention goes.",
            "This guide shows you why self-consciousness gets in the way of pleasure, and practical ways to get out of your head and back into what you feel. No forced positivity, and no pressure to feel a certain way about your body.",
            "One thing to know: most of the research behind this guide was done with women. The guide itself is for everyone, whatever your gender, and whether you're single or with someone.",
          ],
        },
      ],
    },
    {
      id: "whats-happening",
      title: "Why you can't stop thinking about your body during sex",
      parts: [
        {
          heading: "When you start watching yourself instead of enjoying the moment",
          paragraphs: [
            "Imagine you're kissing someone you're attracted to. You're enjoying the moment, completely caught up in how it feels. Then a thought slips in: How do I look right now?",
            "Suddenly, you're thinking about how they see you, whether they like what they see, or whether you're doing something wrong. Nothing about the moment has changed, but instead of experiencing it, you've started evaluating yourself.",
            "Sex researchers have a name for this: spectatoring. You become an observer of your own sexual experience instead of being fully involved in it. Part of your mind is busy checking, judging or imagining how you appear to someone else. In this guide, we call that inner observer the watcher.",
            "Here's the important part: feeling self-conscious during sex doesn't necessarily mean there's something wrong with your body. The problem may be that you're so focused on how you look that you're missing out on how good the experience could feel.",
          ],
        },
        {
          heading: "How overthinking can steal your pleasure",
          paragraphs: [
            "Pleasure depends partly on noticing what's happening in your body: the warmth of someone's hand, the pressure of a kiss, the excitement building, or the comfort of simply being touched. Your attention can't be in two places at once. When it shifts toward evaluating yourself, those sensations become harder to notice.",
            "This matters because arousal isn't something you can simply command yourself to feel. It responds to what you're experiencing, what you're paying attention to, and how comfortable you feel.",
            "Simply changing what you pay attention to may change how much pleasure you experience. When researchers reviewed experiments in which women were asked to focus on physical sensations, reported arousal went up in every one of the lab studies.",
          ],
        },
        {
          heading: "Why pressure can turn desire off",
          paragraphs: [
            "Arousal isn't only about what turns you on. It's also about what makes it hard to stay turned on. Think of driving with one foot on the accelerator and the other on the brake.",
            "Attraction, pleasurable touch and anticipation can act like accelerators. Worry, pressure, discomfort and feeling unsafe can act like brakes. Both can be active at once, which helps explain why wanting intimacy doesn't always turn into feeling aroused. In LoveIQ's State of Desire research, women reported a stronger tendency than men to shut down when they felt pressure during sex.",
            "That pressure doesn't always come from another person. Sometimes it's your own expectations: to look good, respond the right way and enjoy every moment. Each one becomes another thing to monitor, taking even more attention away from the experience.",
          ],
        },
        {
          heading: "Why so many of us learn to watch ourselves",
          paragraphs: [
            "From an early age, many people, and women especially, receive countless messages encouraging them to think about how they appear to others. Being seen and evaluated can become a familiar part of life.",
            "Over time, this can become a habit of monitoring yourself, even when nobody is asking you to. Research comparing women and men has found that women report more distraction about their appearance during sex, while men's distracting thoughts are more often about how they're performing.",
            "So when you start imagining yourself from the outside, that response hasn't appeared from nowhere. And because it's a learned habit, you can practice responding differently. You may not be able to stop every self-critical thought, but you can recognize when your attention has shifted and gently bring it back.",
            "The goal isn't to never think about your body. It's to stop letting those thoughts decide how much of your experience you're allowed to enjoy.",
          ],
        },
      ],
    },
    {
      id: "different-way",
      title: "What if body confidence isn't really about your body?",
      parts: [
        {
          paragraphs: [
            "It's easy to believe that feeling better about your body is the key to finally relaxing and enjoying sex. But what if the real obstacle isn't how you feel about your body, but how much attention you spend worrying about it? A different approach begins with three shifts.",
          ],
        },
        {
          heading: "Stop asking “How do I look?” and start asking “What do I feel?”",
          paragraphs: [
            "When you're self-conscious, your attention moves toward questions about how you're being perceived. Do I look good from here? What are they thinking? Am I doing this right? These questions invite judgment, often without any way of knowing the answer.",
            "Try asking something different: What am I feeling right now? Maybe it's warmth, excitement, softness, pressure, or the pleasant feeling of being close to someone. Maybe it's tension, or nothing much at all. Whatever the answer, you're directing attention back toward your own experience.",
          ],
        },
        {
          heading: "You don't have to fix your body to enjoy it",
          paragraphs: [
            "Even on days when you feel self-critical, you may still have moments when you're completely absorbed in something pleasurable. Being present doesn't require you to settle every judgment about your body first.",
            "Here's something interesting about people who describe having extraordinary sex: what stands out isn't how they look, but how comfortable they feel being themselves. In research on exceptional sexual experiences, people described being at ease in their own skin and absorbed in the moment. What made it extraordinary wasn't meeting a beauty standard. It was the freedom to enjoy it without constantly judging themselves.",
            "So instead of trying to eliminate every insecurity, you can learn to give those insecurities less attention and make more room for pleasure.",
          ],
        },
        {
          heading: "What is your partner actually paying attention to?",
          paragraphs: [
            "When you're busy wondering how someone sees you, it's easy to assume they're noticing and evaluating the same things you are. But they may be paying attention to something entirely different. In LoveIQ's State of Desire survey, almost two in three people (63.95%) said they focus more on their partner's pleasure than their own.",
            "While you're worrying about how you look, the person you're with might be far more interested in how the experience feels and whether you're enjoying yourself. The judgment you're imagining isn't necessarily the judgment that's happening.",
          ],
        },
      ],
    },
    {
      id: "the-skill",
      title: "The skill that helps you get out of your head",
      parts: [
        {
          paragraphs: [
            "The good news is that attention is something you can practice. Instead of getting caught up in how your body looks or how you're being perceived, you can learn to notice those thoughts and bring your focus back to what you feel.",
            "Like any skill, it develops with repetition, not in one go. Your mind will still wander, and that's fine. The goal isn't perfect concentration, but learning to return to your experience without judging yourself. Every practice that follows trains this one skill.",
          ],
        },
      ],
    },
    {
      id: "practices",
      title: "Practical ways to feel more confident in your body",
      parts: [
        {
          paragraphs: [
            "These seven practices, in three stages, help you notice sensations, respond differently to self-criticism, and create more comfortable conditions for intimacy. Every one works on your own; steps with a partner are always optional.",
          ],
        },
        {
          heading: "Where to start",
          paragraphs: [
            "If you'd like a path, go in order. There are no deadlines: stay with a practice as long as it helps, and come back to any of them whenever you need.",
          ],
        },
      ],
      stages: [
        {
          title: "Get out of your head",
          intro:
            "The first practices train the central skill of this guide: shifting attention away from how you look and toward what your body feels.",
          practices: [
            {
              number: 1,
              name: "Notice the watcher",
              time: "A few seconds at a time, for one day",
              bestFor: "Catching the moment you start watching yourself",
              intro: [],
              steps: [
                "Choose an ordinary day. Each time you catch yourself checking how you look, or imagining how someone sees you, quietly acknowledge it: “There it is.”",
                "Keep a simple count, in your head or in a note on your phone. You don't need to examine the thought or decide whether it's true.",
                "Notice when the watcher tends to show up: when someone looks at you, when the lights are on, or when you're receiving attention.",
                "After each “there it is”, bring your attention to one thing you can physically feel, such as your feet against the floor.",
                "At the end of the day, look at your count with curiosity rather than judgment. It isn't a score; it shows how often the habit runs.",
              ],
              after: [],
              why: "You can only bring your attention back once you've noticed it has gone, and noticing without judging is where the skill begins.",
            },
            {
              number: 2,
              name: "Body scan",
              time: "5–10 minutes",
              bestFor: "Overthinking and feeling disconnected from sensation",
              intro: [
                "A body scan helps you practice directing your attention toward physical sensations, and bringing it back when your thoughts wander.",
              ],
              steps: [
                "Sit or lie down somewhere comfortable. You can close your eyes or leave them open, whichever feels easier.",
                "Begin by noticing your feet. Are they warm, cool, relaxed, restless, or touching something? You don't need to change anything.",
                "Slowly move your attention through your legs, stomach, chest, shoulders, arms, hands and face. Spend a little time noticing each area.",
                "When your mind wanders into thoughts or judgments, acknowledge it gently and return to the part of your body you were noticing.",
                "Before finishing, notice your body as a whole. What sensations stand out? Is anything different from when you started?",
              ],
              after: [
                "Some areas may feel neutral or hard to sense. That's fine: there is no correct sensation to discover.",
              ],
              why: "A body scan trains your ability to notice physical sensations and redirect your attention without getting caught up in judgment.",
            },
          ],
        },
        {
          title: "Make peace with your body",
          intro:
            "When familiar judgments return, how you respond to them matters too. These practices help you build a less critical relationship with your body.",
          practices: [
            {
              number: 3,
              name: "What my body does for me",
              time: "10–15 minutes",
              bestFor: "Breaking the habit of judging your body",
              intro: [
                "Much of the attention we give our bodies is about how they appear rather than everything they let us experience. Research on writing about what the body does has found that it can improve how women feel about their bodies.",
              ],
              steps: [
                "Find a quiet place and take a piece of paper or open a note on your phone. Write the sentence: “My body allows me to…”",
                "Think about things your body lets you experience or do. It might let you go somewhere you love, enjoy music, laugh with friends, learn a new skill, rest after a long day, or feel pleasure.",
                "Choose a few examples and describe them in detail. What does your body do, and why does it matter to you?",
                "Read what you've written. Notice how it feels to think about your body through what it does rather than how it looks.",
                "Keep your notes, and return to them when you notice yourself judging your body.",
              ],
              after: [
                "Your examples don't need to be extraordinary, and you don't have to force yourself to feel grateful.",
              ],
              why: "Focusing on your body's capabilities and experiences can help broaden how you think about it, reducing the tendency to evaluate it only from the outside.",
            },
            {
              number: 4,
              name: "Kindness for body worry",
              time: "3–5 minutes",
              bestFor: "Moments of self-criticism or insecurity",
              intro: [
                "When you feel self-conscious, it's tempting to criticize yourself for having those thoughts, which only adds another layer of pressure. You don't need to replace every negative thought with a positive one.",
              ],
              steps: [
                "Notice a self-critical thought that's been bothering you. You don't need to examine it closely or decide whether it's true.",
                "Name what's happening in simple words: “I'm getting in my head again.”",
                "Acknowledge how you feel without making it another problem to solve: “This is uncomfortable, but I don't have to figure it out right now.”",
                "Ask yourself what you'd say to a close friend feeling the same way. Choose words that feel natural, such as “It's okay to feel unsure sometimes.”",
                "Take a comfortable breath and bring your attention back to something you can physically feel, such as your feet against the floor.",
              ],
              after: [],
              why: "Responding to self-criticism with greater kindness can help reduce the extra pressure and distress those thoughts create.",
            },
          ],
        },
        {
          title: "Make intimacy yours",
          intro:
            "Your surroundings, the pace of an experience and how much pressure you feel can all make a difference. Each of these practices works alone too.",
          practices: [
            {
              number: 5,
              name: "Your conditions",
              time: "10 minutes",
              bestFor: "Understanding what makes intimacy easier",
              intro: [
                "We often expect to feel comfortable during sex without considering what actually helps us get there. In LoveIQ's State of Desire research, more than half of women (56.74%) and nearly half of men (48.08%) said private, calm and safe settings turn them on.",
              ],
              steps: [
                "Think about a time you felt particularly comfortable or relaxed, whether during intimacy or in an ordinary situation. What was different about it?",
                "Identify what helped. Perhaps you had privacy, enough time, a familiar place, or the freedom to decide what you wanted without pressure.",
                "Consider what tends to pull you out of the moment: interruptions, feeling rushed, distractions around you, or feeling expected to respond in a certain way.",
                "Choose one thing you could change to make the experience more comfortable: more privacy, a slower pace, fewer distractions, or deciding that you can pause or stop whenever you want.",
                "If you're intimate with someone, you can share what you've discovered: “I find it easier to relax when we take our time and there's no pressure to do anything.”",
              ],
              after: [],
              why: "Recognizing and reducing what makes you tense or pressured can create more room for relaxation, attention and arousal.",
            },
            {
              number: 6,
              name: "Mindful self-touch",
              time: "10–15 minutes",
              bestFor: "Reconnecting with pleasure without pressure",
              intro: [
                "Now bring that same attention to touch. There's no goal of becoming aroused or reaching orgasm: the purpose is simply to explore sensation and get to know what your body enjoys.",
              ],
              steps: [
                "Find a private, comfortable place where you won't feel rushed. You can stay dressed, or choose whatever feels most comfortable.",
                "Begin with a neutral area, such as your hands or arms. Slowly run your fingertips along your skin. Pay attention to the temperature, pressure and texture of the touch.",
                "Experiment gently with lighter or firmer pressure, slower movements, or simply resting your hand against your skin. Notice what you prefer, without deciding what you should enjoy.",
                "If you feel comfortable, explore other areas of your body. Intimate touch is optional. Follow your curiosity rather than trying to achieve a particular response.",
                "When your attention wanders toward how your body looks or whether you're doing it correctly, gently return to the physical sensation you're experiencing.",
              ],
              after: ["If any touch hurts, stop and leave that area out."],
              why: "Mindful self-touch helps you practice staying connected to physical sensation without the distraction of performance expectations or another person's attention.",
            },
            {
              number: 7,
              name: "Slow touch with a partner",
              time: "15–20 minutes",
              bestFor: "Staying present during physical intimacy",
              intro: [
                "Inspired by sensation-focused techniques used in sex therapy, this practice removes the expectation that touch must lead to arousal, orgasm or sex. You can practice alone, or with a partner who wants to take part.",
              ],
              steps: [
                "Choose a comfortable setting and let go of expectations about what should happen next.",
                "Begin with slow, gentle touch on comfortable areas such as the hands, arms, shoulders or back. If you're alone, use your own hands. With a partner, agree beforehand on what kinds of touch feel comfortable, and take turns giving and receiving.",
                "Focus on the sensations rather than how you're responding or how it might look. Notice pressure, warmth, movement, and which kinds of touch you enjoy.",
                "Start without talking, so your attention can stay on touch. With a partner, show small preferences with your hands, by guiding theirs or moving it away. Say so straight away if anything feels uncomfortable, and ask for slower touch, different pressure or a pause whenever you like, without needing to justify it. If you're alone, make those adjustments yourself.",
                "When your attention wanders toward how you're being perceived, gently bring it back to what you feel. Finish whenever you want, without judging the experience by how much arousal or pleasure there was.",
              ],
              after: [
                "Nobody needs to continue beyond what feels comfortable. If any touch hurts, stop and leave that area out.",
              ],
              why: "Practicing sensation-focused touch without performance expectations can help you stay connected to your experience even when another person is involved.",
            },
          ],
        },
      ],
    },
    {
      id: "in-the-moment",
      title: "What to do when insecurities interrupt sex",
      parts: [
        {
          paragraphs: [
            "Even as you become more comfortable in your body, an insecure thought may still catch you off guard during sex. What matters is recognizing when your attention has shifted, and knowing how to bring it back without pressuring yourself to feel differently.",
          ],
        },
        {
          heading: "The three-step reset: notice, feel, adjust",
          steps: [
            {
              title: "Notice without judging.",
              text: "When you realize you're evaluating yourself, try not to get frustrated or force the thought away. Quietly acknowledge it: “There it is.” You don't need to argue with the thought or figure out why it appeared.",
            },
            {
              title: "Find one sensation.",
              text: "Choose something you can physically feel right now, such as the pressure of a hand, the contact between your body and the bed, or the movement of your breathing. Stay with it for three comfortable breaths. You aren't trying to make yourself feel aroused; you're simply returning to what's happening.",
            },
            {
              title: "Slow down or change the pace.",
              text: "If you still feel distracted, consider what would make the moment easier: slower touch, a pause, more space, a different kind of contact, or stopping altogether. You can say to a partner: “Can we slow down a little? I want to focus on how this feels.” If you're alone, the same applies: pause, adjust or stop whenever you want.",
            },
          ],
          paragraphs: [
            "Noticing that you've left the moment and choosing to return is the practice. You don't have to stay perfectly present for it to count.",
          ],
        },
      ],
    },
    {
      id: "more-help",
      title: "When you might need more than a guide",
      parts: [
        {
          paragraphs: [
            "Not every difficulty with body confidence can or should be handled with self-guided practices.",
            "If sex or touch hurts, get it checked by a doctor, gynaecologist, urologist or pelvic health physiotherapist. Pain usually has a physical cause that can be treated; it isn't a confidence problem. Until then, keep touch away from anything that hurts and stop anything painful. The practices for the rest of your body are fine to keep doing.",
            "If closeness feels unsafe because of something that happened in the past, a therapist who works with trauma or sexual health can help in a way a guide can't. The touch practices are completely optional: go at your own pace, or leave them out.",
            "If thoughts about your body cause you distress far beyond sex, for example if you avoid mirrors, photos or going out, a therapist who works with body image can really help.",
            "And if you are ever in crisis or in danger, call your local emergency number.",
            "Getting support doesn't mean you've failed to develop confidence. It simply means that what you're experiencing may need a different kind of care.",
          ],
        },
      ],
    },
    {
      id: "felt-not-judged",
      title: "Your body deserves to be felt, not constantly judged",
      parts: [
        {
          paragraphs: [
            "Your body is more than something other people look at. It's how you experience warmth, closeness, excitement, comfort and pleasure.",
            "Body confidence doesn't have to begin with changing how you see yourself. Sometimes it begins with spending a little less time watching yourself, and a little more time feeling what it's like to be you.",
          ],
        },
      ],
    },
  ],
  sources: {
    loveiq: [
      "LoveIQ live survey, question 16001: “Which changes would actually improve your sex life over the next 3 months?” Data to 21 October 2026, staff excluded. 1,249 women answered; 45% chose “Feeling more confident in my own body.”",
      "LoveIQ, State of Desire 2026 (Applied Psychometrics): shutting down under pressure during sex (women 54, men 42, on a 0–100 scale); turned on by private, calm and safe settings (women 56.74%, men 48.08%); focusing more on a partner's pleasure than on one's own (63.95% of respondents).",
    ],
    /** Evidence cards, cited as the cards cite them: the research moments, then the practices. */
    cards: [
      "C01",
      "C03",
      "C09",
      "C21",
      "C20",
      "C11",
      "C17",
      "C18",
      "C19",
      "C24",
      "C25",
      "C26",
      "C27",
    ],
    other: [
      "Masters WH, Johnson VE (1970). Human Sexual Inadequacy. The origin of the word “spectatoring”.",
      "Kleinplatz PJ, Ménard AD (2020). Magnificent Sex: Lessons from Extraordinary Lovers. Routledge.",
    ],
  },
};

/** The seven practices in order, as the page shows them and Mira gives them. */
export const GUIDE_PRACTICES: GuidePractice[] = GUIDE.sections.flatMap((s) =>
  (s.stages ?? []).flatMap((st) => st.practices)
);
