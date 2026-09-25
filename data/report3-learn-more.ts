import type { Report3Run } from "./report3-archetype-page";

/**
 * "Go deeper & learn more" — the long-form article that sits inside a chapter.
 *
 * Figma: three states of one component — 153:2240 (closed), 153:2260 (expanded)
 * and 153:2280 (expanded & gated). Those frames are named "Article — Arousal,
 * Desire & Pleasure", which is a stale component label; the copy is the TYPICAL
 * BELIEFS article, as 153:2278 ("Typical Beliefs — Learn more (full)") says.
 *
 * Only Typical Beliefs is written. Every other chapter is absent rather than
 * invented, the same rule REPORT_V4_SUMMARY follows for the other 13 archetypes.
 *
 * The closed state is NOT separate teaser copy: 153:2240's text is verbatim the
 * first block plus the start of the second, clipped to a 240px box. So there is
 * one article here and the three states are three views of it.
 */

/** One block of article body. The article mixes all three kinds. */
export type Report3Block =
  | { kind: "heading"; text: string }
  /** `tight` drops the 16px rule below — FvR stacks three bold questions flush. */
  | { kind: "para"; runs: readonly Report3Run[]; tight?: true }
  /**
   * `ordered` renders <ol>; A&B's "five questions" is list-decimal in 235:272.
   * `start` numbers an ordered list on from where an earlier part left off — the
   * blurred tail of a list a paywall splits (CiP's practice, 399:260).
   */
  | {
      kind: "list";
      ordered?: true;
      start?: number;
      items: readonly (readonly Report3Run[])[];
    };

export interface Report3LearnMoreArticle {
  /** Must equal a Report3Chapter.id. */
  chapterId: string;
  /**
   * Gate against a different section than the chapter's own. Unset on all three —
   * see the note on REPORT_V4_LEARN_MORE about which plans actually meet the wall.
   */
  gateSectionId?: string;
  /** 230:282 — differs per chapter: ~15, ~12 and ~13 min. */
  eyebrow: string;
  /** 153:2253 — the Lora button label. */
  label: string;
  /**
   * The closed state's clamp. The frame draws TEN LINES of copy; whether that
   * measures 240px or 224px depends only on whether a paragraph gap happens to
   * land inside them, and CSS cannot count lines across sibling paragraphs.
   * Defaults to 240; Accelerators & Brakes' own teaser needs 247 (eleven lines).
   */
  teaserHeightPx?: number;
  /**
   * The closed card's copy, when the frame sets its own rather than the article's
   * opening blocks — 235:234's 240:239 breaks lines where the article runs on.
   * Free copy: every reader receives it, locked or not.
   */
  teaser?: readonly Report3Block[];
  /** The pill's bottom, this far above the teaser box's foot. CSS default 18.5. */
  teaserPillBottomPx?: number;
  /** The closed card's padding under the teaser. CSS default 20.5. */
  closedPaddingBottomPx?: number;
  /**
   * The WHOLE article, exactly as the expanded frame draws it.
   *
   * One array rather than a free/paid pair, because Fantasy vs. Reality cuts
   * MID-PARAGRAPH: its free copy ends at "…Bodies behave as imagined." and the
   * blurred window resumes inside the same paragraph. Pre-splitting that here
   * would put a wrong paragraph break into the UNGATED article, which has to match
   * 244:258 exactly. So the cut is data, and the split happens on the server.
   */
  blocks: readonly Report3Block[];
  /** Index of the first PAID block. */
  paywallAt: number;
  /**
   * When the cut falls INSIDE `blocks[paywallAt]`, how many characters of that
   * block stay free. Omitted when the cut is a clean paragraph boundary.
   */
  paywallCharOffset?: number;
}

/**
 * What a reader actually receives, derived from the article by
 * `splitArticleForReader()` on the server — never assembled in the browser.
 */
export interface Report3LearnMoreView {
  eyebrow: string;
  label: string;
  teaserHeightPx?: number;
  teaser?: readonly Report3Block[];
  teaserPillBottomPx?: number;
  closedPaddingBottomPx?: number;
  free: readonly Report3Block[];
  /**
   * THE SEAM. The paid remainder a locked reader is allowed to glimpse behind the
   * blur, or `null` once it is withheld entirely. The component renders the same
   * window, fade, "Show More" and card either way — only the words differ.
   */
  gated: readonly Report3Block[] | null;
  /** The ORIGINAL paid length. Survives stripping, so nothing has to infer it. */
  gatedBlockCount: number;
}

/* ─── authoring helpers ──────────────────────────────────────────────────────
 * The article runs ~9,000 words across 64 blocks. Spelling every run as an
 * object literal would triple the file for no extra fidelity, so these six
 * functions do it: still explicit runs, no parser, no mini-language to learn. */

/** Plus Jakarta Sans Regular 14/22.4. */
const t = (text: string): Report3Run => ({ text });
/** Plus Jakarta Sans Bold. */
const b = (text: string): Report3Run => ({ text, weight: 700 });
/** Plus Jakarta Sans Italic — quoted beliefs, throughout. */
const i = (text: string): Report3Run => ({ text, italic: true });

const p = (...runs: Report3Run[]): Report3Block => ({ kind: "para", runs });
/** Lora Bold 16/19.2 in #161021. There are five. */
const h = (text: string): Report3Block => ({ kind: "heading", text });
const ul = (...items: Report3Run[][]): Report3Block => ({ kind: "list", items });
const ol = (...items: Report3Run[][]): Report3Block => ({ kind: "list", ordered: true, items });
/** A paragraph with no rule below it. */
const pt = (...runs: Report3Run[]): Report3Block => ({ kind: "para", runs, tight: true });

/**
 * Blocks 1-20 — everything 153:2280 draws above the wall. It ends on the shadow
 * belief list, so the split is a paragraph boundary rather than a character cut.
 */
const TYPICAL_BELIEFS_FREE: readonly Report3Block[] = [
  p(
    t(
      "We do not enter our sexual lives with a completely blank mind. Long before we consciously decide what sex means to us, we have already absorbed thousands of small assumptions (beliefs) about "
    ),
    b(
      "desire, attractiveness, intimacy, pleasure, gender, rejection, safety, and what we are allowed to want and do."
    )
  ),
  p(
    t(
      "Many of these beliefs begin forming before we have the ability to question them. They can come from parents and caregivers, religion, cultural norms, peers, previous partners, media, gender expectations, and the wider society around us. Some are taught directly; many are simply absorbed by watching what is praised, discouraged, feared, joked about, hidden or treated as normal."
    )
  ),
  p(
    t(
      "Some of those beliefs are explicit. Perhaps sex was treated as shameful in your family, commitment was considered necessary before intimacy, or you learned that a man should always want sex. Others are much more subtle. You may have learned that being desirable earns attention. That pleasing someone keeps them close. That needing another person makes you vulnerable. That good sex should happen naturally. Or that if someone truly loves you, they should automatically know what you want."
    )
  ),
  p(
    t("The important thing is that "),
    b("a belief can feel deeply true without necessarily being truly yours."),
    t(
      " We often adapt to the world we grow up in before we know enough about ourselves to decide whether its rules actually fit us. A belief may have helped you belong, stay safe, earn approval or make sense of relationships in the past. However, it can still be poorly aligned with what you genuinely desire, need or want your sexual life to look like."
    )
  ),
  p(
    t("Over time, these "),
    b(
      "recurring beliefs quietly shape the meaning you give to sexual experiences, which in turn can fundamentally mold your behavior."
    )
  ),
  p(
    t(
      "They are not necessarily thoughts you consciously repeat to yourself or are aware of. In fact, some of the most influential beliefs are difficult to notice precisely because they feel so obvious. "
    ),
    i(
      "“Of course rejection means they are losing interest. Of course sex should end in orgasm. Of course I should want this. Of course I should make sure my partner is satisfied.”"
    )
  ),
  p(
    t(
      "When an assumption feels like reality rather than an interpretation of reality, it can guide us without ever appearing to be a choice. "
    ),
    b("It becomes an invisible rule for how we understand ourselves and others"),
    t(
      ", shaping what we expect, what we fear, what we pursue, what we avoid, and how we behave, without us ever realizing that another way of seeing things was possible."
    )
  ),
  p(
    t(
      "This is also what makes beliefs such an important area for growth. You cannot consciously choose a belief you have never realized you are carrying. But once a belief becomes visible, you can begin asking a different question: "
    ),
    i(
      "“Is this actually what I believe, or is it something I learned to believe? And does it still support the sexual life, relationships and sense of self I want today?”"
    )
  ),
  p(
    t("Researchers use terms such as "),
    b("schemas"),
    t(" for mental structures built from previous experience and "),
    b("sexual self-schemas"),
    t(
      " for the beliefs and associations through which people understand themselves as sexual beings. Sexual self-schema research suggests that these internal representations can influence how people process sexual information, remember sexual experiences, anticipate future situations, and behave in intimate relationships."
    )
  ),
  p(
    t("The important point is that a belief does more than give you an opinion about sex. "),
    b("It can change what a sexual situation means to you. And meaning changes experience.")
  ),
  p(
    t(
      "Imagine two people whose partners do not initiate sex for several days. One carries an underlying belief that "
    ),
    i("“being desired means being valuable.”"),
    t(" The absence of initiation may quickly feel like rejection: "),
    i("“Maybe they no longer find me attractive.”"),
    t(" Another person believes that "),
    i("sexual desire naturally comes and goes"),
    t(
      ". They notice exactly the same behavior but experience far less threat. The external event is identical. What changes is the interpretation placed between the event and the emotional response."
    )
  ),
  p(
    t(
      "That interpretation can affect sexuality itself. If a situation activates thoughts of rejection, inadequacy, pressure, shame, failure, or danger, attention can shift away from erotic sensations and toward monitoring: "
    ),
    i(
      "“Do they want me? Am I performing well enough? Why am I not turned on yet? Are they disappointed?”"
    )
  ),
  p(
    t(
      "Research on sexual difficulties suggests that beliefs can influence sexual experience through a simple chain reaction: "
    ),
    b(
      "what we believe affects how we interpret a situation, that interpretation shapes the thoughts and emotions that follow, and those thoughts and emotions can influence desire, arousal and behavior."
    ),
    t(
      " If you interpret a partner's lack of initiation as rejection, for example, you may feel anxious or inadequate; that anxiety can then make it harder to stay present, relaxed or connected to pleasure."
    )
  ),
  p(
    t("This does "),
    b("not"),
    t(
      " mean that sexual difficulties can simply be “thought away.” Desire and arousal are also shaped by physiology, hormones, health, medication, stress, attraction, relationship dynamics and context. Beliefs are only one part of that larger system. But they are especially important because they can shape "
    ),
    b("what all of those experiences mean to us"),
    t(" and that meaning can influence how we respond.")
  ),
  p(
    t(
      "This is why the same sexual behavior can come from very different places. What matters is not only "
    ),
    b("what we do"),
    t(", but also "),
    b("what the behavior means to us and what belief may be sitting underneath it"),
    t(".")
  ),
  h("Your sun beliefs and shadow beliefs"),
  p(
    t("A useful way to look at these patterns is to distinguish between what we call "),
    b("sun beliefs and shadow beliefs"),
    t(".")
  ),
  p(
    t(
      "The language is inspired by broader “sun” and “shadow” metaphors used in popular psychology, including Stefanie Stahl's distinction between the "
    ),
    i("Sonnenkind"),
    t(" and "),
    i("Schattenkind"),
    t(
      ". Stahl uses these concepts to represent supportive versus difficult early beliefs and the protective strategies that can grow around them. This is a metaphorical framework rather than a distinct scientific theory of sexuality, but it maps intuitively onto established psychological ideas about schemas and learned beliefs."
    )
  ),
  p(
    t("A "),
    b("sun belief"),
    t(
      " is an assumption that tends to leave psychological room for curiosity, flexibility and choice. It might sound like: "
    ),
    i("“My desires are allowed to be different from my partner's.”"),
    t(" "),
    i("“I can be desirable without needing everyone to desire me.”"),
    t(" "),
    i("“Sex does not have to be perfect to be worthwhile.”"),
    t(" "),
    i("“My partner can say no without rejecting me as a person.”"),
    t(" "),
    i("“Pleasure can be explored rather than performed.”")
  ),
  p(
    t("A "),
    b("shadow belief"),
    t(" tends to become more restrictive, threatening or conditional: "),
    i("“If my partner does not want sex, something must be wrong with me.”"),
    t(" "),
    i("“I have to perform well to be desirable.”"),
    t(" "),
    i("“If I tell someone what I really want, they might judge me.”"),
    t(" "),
    i("“A good partner should satisfy the other person's sexual needs.”"),
    t(" "),
    i("“If we were truly compatible, sex would happen naturally.”"),
    t(" "),
    i("“Letting go means losing control.”")
  ),
];

/**
 * Blocks 21-64 — the paid remainder. 153:2280 shows the first four of these in a
 * 580px window, the last cut mid-word ("…the possibility of revis") by the clamp
 * rather than by the data; the rest is what 153:2260 draws in full.
 */
const TYPICAL_BELIEFS_GATED: readonly Report3Block[] = [
  p(
    t(
      "Importantly, neither type of belief appears from nowhere. By the time a belief becomes deeply rooted, it has often served some purpose: helping us make sense of relationships, protect ourselves, preserve belonging or navigate uncertainty. But a rule that once helped you adapt can later become restrictive when it continues operating automatically in circumstances where you no longer need it."
    )
  ),
  p(
    t(
      "This is why exploring your beliefs is not simply an exercise in identifying “negative thinking.” It is about understanding "
    ),
    b(
      "what a belief has been doing for you, and whether you still want it shaping your sexual life today"
    ),
    t(".")
  ),
  p(
    t(
      "“Shadow” therefore does not mean bad, irrational or broken. Some beliefs may once have made perfect sense in the context in which they developed. Others may simply have been repeated so often that you never had reason to question them. The important question is not whether a belief was once understandable, but whether it still reflects "
    ),
    b("what you genuinely need, value and want now"),
    t(".")
  ),
  p(
    t(
      "This is where substantial growth can happen. Once a belief becomes visible, you gain the possibility of revising it toward something more truthful, flexible and aligned with the person you want to be. "
    ),
    b(
      "Rewriting a belief is not merely positive thinking. It is reclaiming authorship over rules you may never have consciously chosen."
    )
  ),
  p(
    t(
      "That also means replacing every negative belief with an artificially positive one is unlikely to help. The goal is not to convince yourself that "
    ),
    i("“everything is safe, everyone will accept me, and sex will always be wonderful.”"),
    t(" A more flexible belief remains realistic: "),
    i(
      "“Someone may not share my desire, but I can express it. Rejection can hurt without determining my worth. My body will not respond perfectly every time.”"
    ),
    t(
      " These beliefs leave room for uncertainty without allowing uncertainty to dictate the entire experience."
    )
  ),
  h("The beliefs beneath the behavior"),
  p(
    t(
      "People can engage in exactly the same sexual behavior for very different psychological reasons. Two people may both want frequent sex, for example. For one, sex is primarily about pleasure and exploration. For another, frequent sex reassures them that their relationship is secure. A third may feel uneasy without it because being sexually wanted confirms their attractiveness. The behavior looks similar from the outside, but internally it is serving very different purposes."
    )
  ),
  p(
    t(
      "Research on sexuality supports this broader idea that sex can carry many psychological meanings beyond physical desire alone. Studies have found that people connect sex with pleasure, attraction, emotional closeness, self-esteem, reassurance, obligation, novelty and many other experiences. Research also shows that people differ in the expectations and assumptions they bring into sexual situations, including what they believe satisfying sex should look like, what sexual desire says about a relationship, and what being wanted or rejected means about themselves."
    )
  ),
  p(
    t(
      "Over time, one can develop recurring beliefs about sexuality. Some are explicit, such as “good sex should be passionate.” Others operate more quietly, such as “if my partner really desires me, they should want sex spontaneously,” or “keeping my partner sexually satisfied is part of being a good partner.” These beliefs can influence what we notice, what we expect, what disappoints us, and how we interpret both our own behavior and our partner’s."
    )
  ),
  p(
    t("These recurring beliefs can be organized into several overlapping "),
    b("belief clusters"),
    t(
      ". They are not clinical diagnoses or universally established scientific categories. They are a way of recognizing common themes within the much broader research on sexual beliefs, scripts, and motivations:"
    )
  ),
  ul(
    [
      b("Pleasure and outcome:"),
      t(
        " Sex should feel exciting, pleasurable or intense; orgasm, novelty or release may become important markers of whether sex was “good.” "
      ),
      b("For example: “If neither of us orgasms, the sex wasn’t really successful.”"),
    ],
    [
      b("Validation and approval:"),
      t(
        " Being desired can become connected to feeling attractive, worthy, masculine, feminine, chosen or secure. "
      ),
      b(
        "For example: “If my partner doesn’t want sex with me, they probably don’t find me attractive anymore.”"
      ),
    ],
    [
      b("Power and control:"),
      t(
        " Sexuality may become linked to taking control, surrendering control, maintaining independence, avoiding vulnerability or establishing a particular relational position. "
      ),
      b(
        "For example: “If I let my partner take the lead, I am giving up too much control and making myself vulnerable.”"
      ),
    ],
    [
      b("Bonding and connection:"),
      t(" Sex can represent love, closeness, reassurance, commitment or emotional safety. "),
      b("For example: “If we are having less sex, it probably means we are becoming less close.”"),
    ],
    [
      b("Service and responsibility:"),
      t(
        " Sexuality may be understood partly through pleasing a partner, being a “good” lover, meeting expectations or maintaining harmony. "
      ),
      b("For example: “If my partner doesn’t orgasm, I have failed them as a lover.”"),
    ],
    [
      b("Exploration and growth:"),
      t(
        " Sex can become a space for curiosity, novelty, experimentation, discovery and expanding one’s sense of self. "
      ),
      b(
        "For example: “If we keep doing the same things sexually, our sex life is becoming boring and we need to try something new.”"
      ),
    ],
    [
      b("Stability and safety:"),
      t(
        " Sexuality may feel best when it occurs inside commitment, predictability, trust and familiar rhythms. "
      ),
      b(
        "For example: “I can only really relax and enjoy sex when I know the relationship is secure and I can fully trust the other person.”"
      ),
    ],
    [
      b("Protection and distance:"),
      t(
        " Sex may be experienced as exposing, risky or potentially overwhelming, making emotional distance, control or avoidance feel safer. "
      ),
      b(
        "For example: “It is safer not to tell my partner what I really want because they might judge me or see me differently.”"
      ),
    ]
  ),
  p(
    t(
      "Most people will recognize themselves in more than one of these themes. They may also change across partners, life stages and situations. You might seek novelty when you feel secure but crave reassurance when the relationship feels uncertain. You might deeply value pleasing your partner while simultaneously resenting sex when it begins to feel expected."
    )
  ),
  p(
    b(
      "The revealing question is therefore not only “What do I like sexually?” but “What have I learned that sex means, and how might those beliefs be shaping the way I feel, choose, behave and relate?”"
    )
  ),
  h("When beliefs become sexual patterns"),
  p(t("Beliefs become especially influential when they turn into "), b("rules"), t(".")),
  p(
    t("A person who believes "),
    i("“being desired makes me valuable”"),
    t(
      " may begin monitoring how often their partner initiates, feeling unusually hurt by sexual rejection or seeking new attention when reassurance fades. Someone who believes "
    ),
    i("“sex should be spontaneous”"),
    t(
      " may interpret planning sex as evidence that attraction has disappeared. Someone who believes "
    ),
    i("“my partner's pleasure is my responsibility”"),
    t(
      " may become so focused on the other person's reactions that they barely notice their own sensations."
    )
  ),
  p(
    t("Another person might believe "),
    i("“good sex means orgasm.”"),
    t(
      " Once orgasm becomes the test of success, every moment without obvious progress can begin to feel like evidence of failure. Attention moves from sensation toward evaluation. Instead of experiencing sex, the person starts observing it: "
    ),
    i("“Are we there yet? Why isn't it happening? What's wrong?”"),
    t(
      " Ironically, the belief intended to create satisfying sex can introduce exactly the pressure that makes pleasure more difficult."
    )
  ),
  p(
    t(
      "Cognitive models of sexual difficulties describe a related process. More general beliefs can create conditional rules about what sexual situations mean. When a relevant event activates those rules, automatic thoughts and emotions can follow, influencing attention and sexual response. This mechanism has empirical support, particularly in research involving people experiencing sexual difficulties, although it should not be assumed to explain every sexual problem or every person."
    )
  ),
  p(
    t("Sexual beliefs can also operate between two people. Gagnon and Simon's influential "),
    b("sexual script theory"),
    t(
      " proposed that sexuality is partly organized through culturally learned expectations about what sexual situations mean and how people are expected to behave. They distinguished between cultural scripts, interpersonal scripts negotiated between people, and the private or intrapsychic scripts through which individuals organize fantasies, meanings and desires."
    )
  ),
  p(
    t(
      "Consider a heterosexual couple in which one person has learned that the more masculine partner should initiate sex, while the other believes desire should never have to be demonstrated or pursued deliberately. Neither belief needs to be spoken aloud. Yet both partners may wait, interpret the other's passivity as lack of desire and slowly conclude that the sexual connection has disappeared."
    )
  ),
  p(
    t(
      "Or imagine one partner for whom sex primarily communicates love and another for whom love creates the safety to enjoy sex but is not expressed through sex itself. When desire drops during a stressful period, the first may experience emotional distance while the second experiences nothing more dramatic than temporary low sexual energy. Without understanding the beliefs underneath their reactions, each can misinterpret the other."
    )
  ),
  p(
    b(
      "Many sexual conflicts are therefore not simply disagreements about sex. They are disagreements about what sex means."
    )
  ),
  h("Where these ideas come from"),
  p(
    t(
      "There is no single scientific theory called “Typical Beliefs.” The concept sits at the intersection of several established lines of psychological and sexual research."
    )
  ),
  p(
    t(
      "Cognitive psychology has long examined how underlying schemas influence the way people interpret experiences. Sexuality researchers later applied similar principles specifically to sexual experience. In 1994, Barbara Andersen and Jill Cyranowski introduced influential work on "
    ),
    b("sexual self-schemas"),
    t(
      ", describing them as cognitive generalizations about oneself as a sexual person that arise from experience and can influence the processing of sexual information and later behavior. Research subsequently developed measures for both women and men and explored associations with desire, arousal, behavior and romantic relationships."
    )
  ),
  p(
    t("Pedro Nobre and colleagues developed another important line of work examining "),
    b("sexual beliefs, cognitive schemas, automatic thoughts and emotions"),
    t(
      " in relation to sexual functioning. Their models suggest that more general sexual beliefs may predispose people to interpret particular sexual situations in certain ways; those interpretations can then activate thoughts and emotional responses that facilitate or interfere with sexual experience."
    )
  ),
  p(
    t(
      "Alongside this cognitive work, Gagnon and Simon's sexual scripting perspective emphasized that the meanings surrounding sexuality are not created inside the individual alone. Culture supplies ideas about who should desire whom, who initiates, what counts as “real sex,” what masculinity or femininity should look like, how quickly intimacy should develop, and what sexual behavior says about a person. Individuals do not simply copy these scripts; they interpret, modify and negotiate them through their own experiences and relationships."
    )
  ),
  p(
    t(
      "Contemporary research therefore supports the broader idea behind Typical Beliefs while also requiring some caution. There is substantial evidence that sexual cognition, self-concept, expectations and culturally learned scripts matter. But there is "
    ),
    b("no universally accepted list of fundamental sexual beliefs"),
    t(
      ", and many studies have examined relatively narrow populations. A recent systematic review of sexual self-concept and sexual self-schema research found considerable variation in how the constructs have been defined and measured, while also noting that much of the literature has disproportionately studied cisgender, heterosexual and White populations."
    )
  ),
  p(
    t(
      "Typical Beliefs should therefore be understood as a map for exploration, not a psychological test that reveals a hidden truth about you."
    )
  ),
  h("Turning an automatic belief into a conscious choice"),
  p(
    t("The practical value of identifying a belief is that it creates a small gap between "),
    b("what happens and what you automatically conclude it means"),
    t(". That gap is where choice begins.")
  ),
  p(
    t(
      "Suppose your partner turns down sex and you immediately feel unattractive. Rather than debating whether you are “too sensitive,” you can look underneath the reaction: "
    ),
    i("“What did their ‘no’ mean to me?”"),
    t(" Perhaps the answer is: "),
    i("“If they wanted me, they would want sex.”"),
    t(" That belief is much more useful to examine than the surface emotion alone.")
  ),
  p(
    t(
      "You can ask yourself: Where might I have learned this? Perhaps desirability was strongly associated with worth in the environment you grew up in. Perhaps a previous relationship made sexual attention feel like your most reliable source of reassurance. Perhaps you have simply absorbed a broader cultural message that being sexually wanted is evidence of personal value. Understanding where a belief came from does not automatically make it disappear, but it can help you stop mistaking familiarity for truth."
    )
  ),
  p(
    t(
      "You can then ask whether it remains accurate across real life, and whether it represents what you actually believe. Has your own desire ever dropped while you still found someone attractive? Can stress, fatigue, conflict or distraction affect your willingness to have sex without changing how desirable your partner is? Does one person's momentary desire actually provide a reliable measurement of another person's worth?"
    )
  ),
  p(
    t("The goal is not to replace the belief with its opposite. It is to make it "),
    b("less absolute and more consciously yours"),
    t(". "),
    i(
      "“Sexual desire is one way my partner may express attraction, but it is not a continuous measurement of my attractiveness.”"
    ),
    t(
      " That small change creates more possible interpretations of the same experience and therefore more possible emotional responses."
    )
  ),
  p(t("The same process works with other beliefs.")),
  p(
    i("“Sex should happen spontaneously”"),
    t(" can become "),
    i("“spontaneity is exciting to me, but anticipation and intentionality can also be erotic.”")
  ),
  p(
    i("“I should make my partner orgasm”"),
    t(" can become "),
    i("“I care about my partner's pleasure without controlling their body's response.”")
  ),
  p(
    i("“I should always know what I want”"),
    t(" can become "),
    i("“desire can emerge through exploration rather than arriving fully formed.”")
  ),
  p(
    t(
      "This flexibility matters particularly when partners carry different assumptions. Instead of arguing about which person's sexuality is correct, you can begin asking better questions: "
    ),
    i(
      "What does sex represent to you? What makes you feel wanted? What does rejection mean to you? What makes sex feel safe? What makes it feel alive? What do you feel responsible for during sex?"
    )
  ),
  p(
    t(
      "Those questions often reveal far more than asking only about frequency, positions or libido."
    )
  ),
  p(
    t(
      "Understanding your typical beliefs does not tell you what you should want. It helps you notice "
    ),
    b(
      "which parts of your sexual experience come from desire itself and which parts come from the meaning you have learned to attach to desire"
    ),
    t(".")
  ),
  p(
    b(
      "Some of those meanings may fit you beautifully. Some may belong more to your family, culture, former partners or earlier versions of yourself. And some may have once protected something important but now limit the kind of sexuality you want to build."
    )
  ),
  p(
    t(
      "The aim is not to become belief-free. None of us is. It is to make more of those beliefs visible enough that we can turn them from "
    ),
    b("inherited rules to conscious choices"),
    t(".")
  ),
];

/**
 * Accelerators & Brakes — Figma 235:272 ("A&B — Learn more (full)"), 38 blocks.
 *
 * The blurred window (240:240) opens on the heading "The patterns underneath
 * desire", which is block 17 counting from zero — a clean paragraph boundary, so
 * no `paywallCharOffset` is needed.
 *
 * Transcribed verbatim, typos included: "it's meaning" for "its", "The questions
 * is", "way of of it", a double space in "the shape of a  body", and several
 * missing spaces around commas. Listed for Mark rather than silently corrected.
 */
const ACCELERATOR_BRAKES_BLOCKS: readonly Report3Block[] = [
  p(
    t(
      "Sexual desire is often talked about as if you simply have more or less of it. A high libido. A low libido. A strong sex drive. A low sex drive. But real sexuality is rarely that simple. You can be intensely attracted to someone and still struggle to become aroused. You can fantasize throughout the day and feel strangely blank when sex actually becomes possible. You can love your partner, enjoy sex once it begins, and almost never feel an urge to initiate it. Or you can become aroused quickly but lose that arousal the moment you start wondering whether you are taking too long, looking attractive enough, or satisfying the other person."
    )
  ),
  p(
    t("The "),
    b("accelerator and brakes model"),
    t(
      " offers a more useful way to understand these contradictions. Instead of imagining sexuality as one drive that is either strong or weak, it suggests that sexual response is influenced by two partly independent regulatory processes. Your "
    ),
    b("sexual accelerator"),
    t(
      " responds to information your system interprets as sexually relevant, rewarding, inviting, or exciting. Your "
    ),
    b("sexual brakes"),
    t(
      " respond to information that gives your system a reason to slow down, become cautious, or stop. Desire and arousal emerge from the interaction between the two."
    )
  ),
  p(
    t(
      "This distinction matters because a quiet sexual response does not necessarily mean that nothing is turning you on. Sometimes the accelerator is receiving plenty of signals while the brakes are receiving even stronger ones."
    )
  ),
  h("Two systems working at the same time"),
  p(
    t(
      "Your accelerator can respond to obvious erotic cues like touch, the shape of a  body, a fantasy, a particular voice, smell, image, sexual memory, or a type of stimulation. But human sexuality is highly dependent on meaning, so accelerators can also be psychological and relational. Feeling wanted may be perceived as erotic. Feeling emotionally connected may be erotic. Things like novelty, anticipation, privacy, playfulness, a certain power dynamic, being admired, or being free from responsibility can make sexual cues more compelling."
    )
  ),
  p(
    t(
      "The brakes are equally varied. Sometimes they respond to clear risks: possible pain, unwanted pregnancy, sexually transmitted infections, lack of privacy, uncertainty about consent, or feeling unsafe with another person. Those brakes are doing exactly what an inhibitory system should do. But inhibition can also be activated by stress, exhaustion, unresolved conflict, pressure to have sex, performance anxiety, self-consciousness, distraction, shame, fear of rejection, negative body image, health problems, or medication effects. You may consciously know that a situation is safe and still notice your sexual response disappearing because another part of the situation carries the meaning of evaluation, obligation, vulnerability, or threat."
    )
  ),
  p(
    t(
      "This is why the same sexual cue can have completely different effects in different circumstances. A partner whispering, “I've been thinking about you all day,” may press one person's accelerator because it creates anticipation and makes them feel desired. For someone else, on a night when they are exhausted and already worried about disappointing their partner, the same sentence may press the brakes because it sounds like an expectation. A hotel room can feel adventurous to one person and unfamiliar or exposed to another. Planned sex can create delicious anticipation for someone whose accelerator loves build-up, while activating the brake of someone who interprets a plan as an obligation they may later have to fulfill."
    )
  ),
  p(
    t(
      "The model therefore does not divide stimuli neatly into “turn-ons” and “turn-offs.” Rather, "
    ),
    b(
      "your nervous system responds not only to what is happening, but to it’s meaning for you in that particular moment."
    )
  ),
  p(
    t(
      "There is another important consequence. Wanting sex does not always have to appear before sexual arousal begins. Sometimes desire feels spontaneous: an erotic thought arrives, attraction becomes conscious, and you want sexual contact before anything sexual is happening. At other times desire is "
    ),
    b("responsive"),
    t(
      ". You may begin from a relatively neutral state, willingly enter an affectionate or erotic situation, start experiencing pleasure, and only then notice genuine sexual wanting emerging. Research on sexual response, particularly work originally developed to better describe women's experiences ,helped establish that this pathway is normal. It should not be treated as a female-only pattern, nor does neutrality mean that someone should participate in sex they do not want. It simply means that, for many people, desire sometimes arrives after the accelerator has received enough positive information and the brakes have enough reason to release."
    )
  ),
  h("Where the model comes from"),
  p(
    t("The scientific framework behind the accelerator-and-brakes metaphor is called the "),
    b("Dual Control Model of sexual response"),
    t(
      ". It was developed by John Bancroft and Erick Janssen at the Kinsey Institute around the turn of the twenty-first century to explain why sexual response varies so dramatically between people and situations. Their central proposal was that sexual responding is regulated by both excitatory and inhibitory processes, and that people differ in their typical sensitivity to each."
    )
  ),
  p(
    t(
      "Early measurement research found a broad sexual excitation tendency and, particularly in the original research with men, two distinguishable forms of inhibition. One concerned "
    ),
    b("performance failure"),
    t(
      ": worries about losing arousal, not becoming erect, not lubricating enough, taking too long, orgasming too quickly, or otherwise “failing” sexually. Another involved "
    ),
    b("possible consequences"),
    t(
      ": pregnancy, infection, discovery, social consequences, or other risks. Later work with women and with measures designed for multiple genders identified a wider range of relevant themes, including arousability, partner characteristics, relationship context, sexual thoughts, setting, and concerns about sexual functioning."
    )
  ),
  p(
    t(
      "The exact structure varies somewhat depending on the questionnaire, population, language, and study. That is important. “Accelerators” and “brakes” are a useful translation of a scientific model, not two literal switches in the brain that researchers can cleanly locate and measure. What is well supported is the broader distinction between people's tendencies toward sexual excitation and inhibition, their meaningful individual variation, and their associations with sexual desire, functioning, and behavior. Research has also found average sex differences in some samples: women, on average, have often reported somewhat greater inhibition and lower excitation than men. But the distributions overlap substantially. Many women have highly sensitive accelerators. Many men have highly sensitive brakes. Studies involving lesbian, gay, bisexual, asexual, and neurodivergent people also make clear that sexual orientation, gender, and neurological profile do not determine a single accelerator-and-brake configuration. The evidence in some of these groups remains much thinner than the evidence from predominantly heterosexual samples. "
    ),
    b(
      "Individual patterns are far more useful for understanding a person's sexuality than assumptions based on demographic categories."
    )
  ),
  p(
    t(
      "Most importantly, neither system is inherently better. A powerful accelerator is not evidence of being more sexually healthy, and strong brakes are not evidence of dysfunction. Inhibition is essential to sexual self-regulation. It helps sexuality remain responsive to boundaries, safety, values, consequences, and changing circumstances. Problems are more likely to arise when the balance between excitation, inhibition, the person's circumstances, and what they actually want from their sexuality repeatedly produces distress."
    )
  ),
  p(
    t(
      "This changes the way many experiences of “low desire” need to be understood. Imagine three people who rarely want partnered sex. One may have an accelerator that simply responds less intensely to sexual cues. Another may have a perfectly responsive accelerator but live with so much stress, pressure, pain, resentment, or self-consciousness that their brakes rarely release. A third may have "
    ),
    b("both a very powerful accelerator and very powerful brakes"),
    t(
      ": vivid fantasies, strong erotic curiosity and intense attraction coexist with anxiety, shame, fear of losing control, fear of judgment, or a strong need for the conditions to feel exactly right. From the outside, all three people can look “low desire.” Internally, they are having completely different experiences."
    )
  ),
  p(t("And that raises a much more revealing question than "), i("How high is my libido?")),
  p(b("The questions is: what helps my desire grow, and what gets in the way of of it?")),
  h("The patterns underneath desire"),
  p(
    t(
      "Once accelerators and brakes are considered separately, several common patterns become easier to recognize. They are not diagnoses or fixed personality types. Your pattern can shift with age, relationships, health, medication, stress, confidence, experience, and context. Think of them as useful configurations rather than boxes."
    )
  ),
  p(
    b("Strong accelerator, lighter brakes."),
    t(
      " Sexual cues tend to register quickly. Attraction, fantasy, novelty, flirtation, touch, visual cues, or opportunities for sexual exploration may readily become motivating. Desire may often feel spontaneous because relatively little inhibition has to settle before the accelerator becomes noticeable. This configuration can support an active and exploratory sexuality. Research also finds associations between relatively high excitation and relatively low inhibition and greater sexual risk-taking in some populations, although a sensitive accelerator obviously does not prevent someone from making deliberate, safer choices. Temperament influences what feels compelling; it does not decide what someone does."
    )
  ),
  p(
    b("Strong accelerator, strong brakes."),
    t(
      " There may be a great deal of erotic energy here, but access to it is conditional. Fantasy can be intense because imagination removes many real-world consequences, while partnered sexuality may become much harder once vulnerability, evaluation, uncertainty, relationship dynamics, or bodily self-consciousness enter the picture. Someone with this pattern might be highly sexual in one relationship or setting and surprisingly inhibited in another. They may crave adventurous sexuality but need an unusual degree of safety, privacy, trust, preparation, or freedom from pressure before their body follows. One of the most confusing experiences in this configuration is thinking, "
    ),
    i("I know I want this, why am I suddenly shutting down?"),
    t(" The answer may not be insufficient desire. "),
    b("The accelerator and brake may simply be operating strongly at the same time.")
  ),
  p(
    b("Quieter accelerator, sensitive brakes."),
    t(
      " Sexual interest may arise less frequently, while competing signals register easily. Stress, fatigue, conflict, distraction, uncertainty, pain, or pressure may quickly outweigh erotic cues. Desire may therefore require particularly supportive conditions before it becomes noticeable. For some people this pattern causes distress; for others it simply describes a sexuality in which sex has relatively low motivational importance. Low desire becomes a clinical concern only in appropriate diagnostic contexts involving distress,not because someone's level of sexual interest fails to match a cultural expectation or a partner's libido."
    )
  ),
  p(
    b("Quieter accelerator, lighter brakes."),
    t(
      " Sex may not command much attention, yet there is also relatively little anxiety or resistance surrounding it. A person might rarely think about sex or seek it out but sometimes enjoy it when an appealing opportunity arises. Some people with low sexual interest or on the asexual spectrum may recognize aspects of this pattern, but accelerator-and-brake scores should not be used to define anyone's sexual orientation or identity. "
    )
  ),
  p(
    t("There is also a particularly recognizable "),
    b("performance-sensitive pattern"),
    t(
      " that can occur across these configurations. A person begins an encounter interested and aroused, then notices a change: "
    ),
    i("Am I hard enough? Why am I not wetter? Am I taking too long? Are they enjoying this? "),
    t(
      "Attention moves away from sensation and toward evaluation. Arousal might decrease, which seems to confirm the original fear, creating even more self-monitoring. What begins as a small fluctuation in sexual response can become a self-reinforcing brake."
    )
  ),
  p(
    t("This illustrates something essential about sexuality: "),
    b("we do not merely respond to sex; we respond to our interpretation of how sex is going."),
    t(
      " Watching yourself from the outside competes with inhabiting the experience from the inside. Body-image research similarly suggests that self-consciousness and evaluative thoughts during sexual activity can interfere with sexual functioning and satisfaction. For someone whose inhibition is especially sensitive to evaluation, trying harder to “perform” may therefore make the very response they are chasing less accessible."
    )
  ),
  h("Mapping your own system"),
  p(
    t(
      "Understanding your pattern begins by separating two questions that are often collapsed into one: "
    ),
    b("What helps sexual interest become stronger?"),
    t(" And "),
    b("what makes sexual interest harder to access once it is there?"),
    t(
      " Instead of judging your libido across months or years, look at specific situations. Compare moments when desire appeared naturally with moments when it disappeared. Pay particular attention to changes: the instant an encounter became exciting, the moment attraction turned into self-consciousness, or the conditions under which a neutral mood began becoming erotic."
    )
  ),
  p(t("A useful personal map can begin with five questions:")),
  ol(
    [
      b("When does desire come most easily to me?"),
      t(
        " Consider your emotional state, energy, time of day, setting, relationship climate, fantasies, type of interaction, and what was happening before sex became possible."
      ),
    ],
    [
      b("What reliably activates my accelerators?"),
      t(
        " This might involve particular kinds of touch, anticipation, words, visual cues, emotional connection, novelty, feeling chosen, power dynamics, privacy, fantasy, or something highly individual."
      ),
    ],
    [
      b("What happens immediately before my interest drops?"),
      t(
        " Look for stress, pressure, resentment, distraction, pain, fear of consequences, self-monitoring, body consciousness, thoughts about performance, or subtle shifts in your partner's behavior."
      ),
    ],
    [
      b("Which brakes are protecting something important?"),
      t(
        " Boundaries, lack of consent, pain, genuine relationship concerns, health risks, or unwanted circumstances are not obstacles to defeat. They are information."
      ),
    ],
    [
      b(
        "Which brakes seem to belong partly to an older prediction rather than the present situation?"
      ),
      t(
        " Shame, an expectation of rejection, a belief that pleasure must be earned, or automatic fear of being “too much” may deserve curiosity rather than obedience."
      ),
    ]
  ),
  p(
    t(
      "The point is not to score yourself. It is to become more precise about causality. “I don't want sex” may be an entirely accurate description of a moment, but it does not always explain the mechanism behind that experience. "
    ),
    i("I'm exhausted and my system cannot switch attention away from work"),
    t(" tells you something different. So does "),
    i("I become interested until I feel expected to perform"),
    t(", or "),
    i("I rarely feel spontaneous desire, but pleasure reliably creates desire once we begin.")
  ),
  p(t("That precision creates practical options.")),
  p(
    t(
      "If your accelerator needs time to engage, expecting an immediate urge may work against your natural pattern. Anticipation, affectionate contact, erotic material, fantasy, or deliberately creating time for pleasure may provide more useful input. If the main obstacles are brakes, adding more stimulation may achieve very little. Someone already overwhelmed by stress and performance anxiety does not necessarily need a more elaborate sexual technique; they may need less pressure, greater privacy, relational repair, more rest, relief from self-monitoring, or permission for the encounter to end without achieving anything."
    )
  ),
  p(
    t(
      "This principle can transform conversations between partners. Instead of interpreting different desire levels as "
    ),
    i("You don't want me enough"),
    t(" or "),
    i("You want too much"),
    t(
      ", the couple can ask what each person's system is responding to. One partner may experience spontaneous desire frequently and interpret initiation as an expression of affection. The other may experience mostly responsive desire and find repeated initiation increasingly pressuring because every invitation seems to require an immediate sexual feeling. Neither experience reveals how much the partners love one another. "
    )
  ),
  p(
    t("Reducing brakes also does not mean persuading yourself to ignore them. The goal is "),
    b("better calibration"),
    t(
      ", not maximum accelerators. A brake responding to pain, genuine fear, unwanted sex, or unacceptable risk deserves attention. A brake driven by the thought "
    ),
    i("My partner will stop loving me if I need more time"),
    t(
      " raises a different question. One points toward changing the situation; the other may point toward changing the meaning, expectation, or relational pattern surrounding it."
    )
  ),
  p(
    t(
      "Physical health belongs on the same map. Pain, hormonal changes, chronic illness, fatigue, depression and anxiety, and some medications can alter sexual desire, arousal, orgasm, or the conditions under which sexual response emerges. Persistent changes in sexual functioning,especially when accompanied by pain or significant distress,therefore deserve medical attention rather than being interpreted as  psychologically related. Medication should not be changed or stopped without appropriate clinical guidance."
    )
  ),
  p(
    t(
      "The most productive experiments are usually specific. Change one meaningful condition and observe what happens. Create more transition time between work and intimacy. Remove the assumption that initiation must lead to intercourse or orgasm. Resolve a conflict before trying to manufacture erotic connection over it. Change a setting that makes you self-conscious. Give responsive desire enough time to appear without demanding that it does. Bring attention back from "
    ),
    i("How am I doing?"),
    t(" toward "),
    i("What am I actually feeling?"),
    t(
      " These experiments do not force desire. They help reveal the conditions under which your own sexual system becomes more,or less,available."
    )
  ),
  p(
    t(
      "Ultimately, the accelerator-and-brakes model replaces a moral question with a psychological one. Sexuality is not a competition to have the strongest accelerator or the weakest brakes. Both systems have a purpose. What matters is whether their interaction fits your body, your relationships, your values, and the sexual life you genuinely want."
    )
  ),
  p(
    b(
      "The goal is not to become someone with a different sexuality. It is to understand the conditions under which your sexuality can most honestly flourish."
    )
  ),
];

/**
 * Fantasy vs. Reality — Figma 244:276 ("FvR — Learn more (full)"), 96 blocks.
 *
 * The only article whose paywall cuts MID-PARAGRAPH. 249:243 (the free copy)
 * stops at "…Bodies behave as imagined." and 245:248 (the blurred window) resumes
 * inside the same paragraph at "Nobody misunderstands you." — which is why the
 * article is stored whole and divided on the server rather than pre-split here.
 */
const FANTASY_REALITY_BLOCKS: readonly Report3Block[] = [
  p(
    t(
      "A sexual fantasy can be intensely arousing and still be something you would never want to happen."
    )
  ),
  p(
    t(
      "That distinction sounds simple, but it resolves one of the most common sources of confusion about sexuality. People often treat fantasies as hidden wishes: if an idea excites you, perhaps some deeper part of you must want it. This can make fantasies involving unfamiliar partners, unusual roles, power, surrender, taboo, emotional distance, or situations that clash with your everyday values feel more powerful than expected. "
    )
  ),
  p(
    t("But a fantasy is not a plan. It is closer to a private "),
    b("mental movie"),
    t(
      ": an imagined experience in which the mind can amplify what is exciting, remove what is inconvenient, change the context instantly, and stop the scene without having to live with its consequences. Sexual fantasy therefore gives us information about what can activate our erotic imagination, but much less direct information about what we would actually enjoy choosing in real life."
    )
  ),
  p(
    t(
      "This matters because sexuality becomes much easier to understand once we can properly interpret our fantasies."
    )
  ),
  h("Fantasy is not the same as wanting"),
  p(
    t(
      "Imagine that someone repeatedly fantasizes about surrendering all control. In the fantasy, that loss of control feels exhilarating. Yet when they imagine actually doing what the fantasy depicts,  they become uncomfortable. They want to know what will happen, trust the person involved, establish limits, and remain able to stop."
    )
  ),
  p(
    t(
      "There is no contradiction here. The fantasy may not be about losing control. What feels arousing may be "
    ),
    b(
      "the experience of letting someone else take over for a while, without having to make decisions or stay in charge"
    ),
    t(".")
  ),
  p(
    t(
      "Another person might fantasize about sex with a stranger while having no interest in actually meeting one. The stranger may matter less as a real person than as a psychological device: someone with no history, no expectations and no tomorrow. What is erotic may be anonymity, novelty, freedom from a familiar identity, or the feeling of being wanted without having to manage what the experience means afterward or having to step into social obligations."
    )
  ),
  p(
    t(
      "Someone else may fantasize about being intensely desired by several people. They may have no wish for the actual logistics or relationship consequences of that situation. What holds the charge may simply be the fantasy of being "
    ),
    b("unmistakably desirable"),
    t(".")
  ),
  p(
    t("This is why the most literal interpretation of a fantasy is often not the most useful one.")
  ),
  p(
    t(
      "A fantasy can contain a scenario, but it also contains a psychological experience. It can make you feel powerful, surrendered, admired, pursued, anonymous, uninhibited, transgressive, safe, exposed, chosen, free from responsibility, or completely absorbed in another person. Sometimes the scenario itself is what you want. Sometimes it is merely the mind's most effective way of producing the feeling."
    )
  ),
  p(t("And sometimes a fantasy is meaningful mainly because it can remain fantasy.")),
  p(
    t("The question that often reveals much more than "),
    i("“Would I really do this?”"),
    t(" is:")
  ),
  p(
    b(
      "“What is my fantasy telling me? And how do I know whether this is a fantasy that I want or should explore? ”"
    )
  ),
  h("Why imagination and reality can feel so different"),
  p(t("Fantasy and lived sex operate under different psychological conditions.")),
  p(
    t(
      "Inside imagination, you control the frame even when the fantasy itself is about losing control. You can enter at the exciting moment and skip everything before it. You do not have to negotiate. Bodies behave as imagined. Nobody misunderstands you. Embarrassment can disappear. Risk can feel thrilling without actually placing you in danger. A stranger can remain perfectly mysterious. A dominant person can somehow know exactly where your boundaries are. You can stop the entire experience by redirecting your attention."
    )
  ),
  p(b("Reality cannot offer those kinds of conditions.")),
  p(
    t(
      "Once another person and a real body enter the situation, the experience acquires uncertainty, sensation, communication, vulnerability and consequences. What happens before and afterward begins to matter. So do physical comfort, emotional safety, privacy, relationship agreements, sexual health, trust and the other person's reactions."
    )
  ),
  p(
    t(
      "This is one reason an imagined experience can be highly erotic while its realistic version is not."
    )
  ),
  p(
    t("It also helps to separate four experiences that people often collapse into one: "),
    b("arousal, desire, pleasure and consent"),
    t(".")
  ),
  p(
    t(
      "Arousal is activation. Something captures the sexual system's attention or produces a bodily or subjective response."
    )
  ),
  p(t("Desire is motivation. It involves some degree of "), i("wanting"), t(" an experience.")),
  p(t("Pleasure is what the experience actually feels like when it happens.")),
  p(t("Consent is the voluntary decision to participate in what is actually occurring.")),
  p(
    t(
      "These experiences can reinforce one another, but they are not interchangeable. Sexual psychophysiology research has repeatedly shown that genital responses and people's consciously reported experience of arousal do not always move together. That research does not tell us the meaning of any particular fantasy, but it does make one broader point important: "
    ),
    b("a sexual response is not a perfect readout of a person's wishes"),
    t(
      ". Arousal therefore cannot be treated as evidence of consent, intention or future enjoyment. "
    )
  ),
  p(
    t(
      "The same distinction applies within fantasy. Something may be arousing without being desired as reality. Something may be desired without producing strong arousal at every moment. And something genuinely desired may still turn out to be less pleasurable than expected when real bodies, emotions and circumstances are involved."
    )
  ),
  h("What sexual science actually tells us"),
  p(
    t(
      "For much of modern history, unusual sexual thoughts were often treated as signs of hidden problems, unhealthy wishes, or deviance. As researchers began studying sexual fantasies more systematically, that view started to change. By the time psychologists Harold Leitenberg and Kris Henning published a major review of sexual-fantasy research in 1995, fantasies were increasingly understood as a common part of human sexuality rather than something that automatically needed to be explained as a symptom."
    )
  ),
  p(
    t(
      "Later studies reinforced this idea. In a 2015 study of 1,516 adults, Christian Joyal, Amélie Cossette and Vanessa Lapierre found that many fantasies people might casually label as unusual were actually quite common. Fantasies involving dominance and submission, for example, appeared across the general population. Their findings supported an important point: a fantasy should not be considered problematic simply because its content seems unconventional."
    )
  ),
  p(
    t("More recent reviews make another distinction especially important for this chapter: "),
    b(
      "fantasy, sexual interest, desire and behavior are related, but they are not the same construct"
    ),
    t(
      ". In their 2023 review of contemporary fantasy research, Justin Lehmiller and Aki Gormezano concluded that what people fantasize about is not necessarily synonymous with what they are interested in doing or what they actually do."
    )
  ),
  p(
    t(
      "There is overlap, of course. Someone who repeatedly fantasizes about an experience and finds it realistic and desirable may be more motivated to explore it. Research suggests that fantasies can be more closely connected to real-life behavior when they feel vivid, highly arousing, and realistically possible. But fantasy alone cannot tell us what someone will actually do. Some fantasies are closer to real-life intentions than others, while many remain purely imaginative."
    )
  ),
  p(
    t(
      "There are also important limits to the science. Sexual fantasies are difficult to study objectively because researchers largely depend on people describing private experiences. Different studies define and measure fantasies in different ways. Historically, much research disproportionately sampled heterosexual, cisgender, Western and often relatively young participants. More diverse research has expanded the picture, but there is no scientifically validated dictionary in which a particular fantasy always corresponds to one psychological need."
    )
  ),
  p(
    t("So statements such as "),
    i("“fantasizing about surrender means you secretly want to lose control”"),
    t(" go far beyond what the evidence allows.")
  ),
  p(
    t("A better scientific stance is curiosity rather than decoding. "),
    b(
      "The content of a fantasy is evidence of what your imagination can make erotic. Its personal meaning has to be understood in context."
    )
  ),
  h("The hidden variable: context"),
  p(t("This is where fantasies become especially interesting.")),
  p(
    t(
      "The same imagined act can change dramatically depending on who appears in it, where it occurs, what your relationship with that person is, and what the experience would mean afterward. Research increasingly supports this context-sensitive view. Studies of people in relationships have found that fantasy content can vary with relationship experiences and attachment patterns."
    )
  ),
  p(
    b(
      "This helps explain an experience that can otherwise create unnecessary guilt: something may be easy to imagine with a stranger and difficult to imagine with a beloved partner."
    )
  ),
  p(
    t(
      "A long-term partner is not psychologically interchangeable with an anonymous character. Your partner knows you. Their interpretation of what happens may matter to you. You will see them afterward. The sexual experience becomes part of an ongoing relationship rather than a self-contained scene."
    )
  ),
  p(
    t(
      "For some people, that added emotional meaning enhances eroticism. For others, it inhibits particular fantasies."
    )
  ),
  p(
    t(
      "Suppose a fantasy depends on feeling unusually uninhibited. With an imaginary stranger, you may temporarily become someone with no reputation and no past. Put your actual partner into the same fantasy and another thought may suddenly appear: "
    ),
    i("Will they see me differently after this?")
  ),
  p(
    t(
      "Or consider a fantasy organized around emotional distance. Its attraction may partly depend on the absence of attachment, responsibility or aftermath. Enacting the same script with someone you deeply care about may introduce precisely the emotional closeness that the fantasy temporarily suspends."
    )
  ),
  p(
    t(
      "None of this means that strangers are secretly more desirable than partners, or that a relationship is deficient. Nor does it mean every extra-partner fantasy serves a profound psychological purpose. Sometimes novelty is simply novel. The point is that "
    ),
    b(
      "changing the relational container can change the meaning of otherwise identical sexual content"
    ),
    t(".")
  ),
  p(
    t(
      "Research also shows the reverse. Fantasizing about one's current partner can sometimes increase desire for that partner and is associated in experimental and diary studies with more relationship-promoting behavior. Fantasy is therefore not inherently an escape from intimacy. Depending on its content and context, it can support intimacy, depart from it temporarily, or have little relationship meaning at all."
    )
  ),
  h("What is the fantasy really giving you?"),
  p(
    t("When a fantasy recurs, it can be useful to separate its "),
    b("surface scenario"),
    t(" from its "),
    b("erotic ingredients"),
    t(".")
  ),
  p(
    t("Imagine removing individual pieces from the fantasy. "),
    i(
      "If the particular person changed, would it still be exciting?If the location changed?If nobody knew about it afterward?If the act itself disappeared but the feeling of being intensely wanted remained?"
    )
  ),
  p(
    t(
      "This kind of experimentation can reveal that what initially looked like a very specific desire is sometimes a route toward something broader."
    )
  ),
  p(
    t(
      "A fantasy about dominance might partly concern power, but it could also concern permission to be assertive."
    )
  ),
  p(
    t(
      "A fantasy about submission might concern surrender, but it could also offer relief from decision-making."
    )
  ),
  p(
    t(
      "A fantasy involving unfamiliar people might be about other partners, or it might be about novelty, anonymity or temporarily stepping outside your everyday identity."
    )
  ),
  p(
    t(
      "A fantasy about being watched may involve visibility, admiration or the intensity of becoming the center of attention."
    )
  ),
  p(
    t(
      "A highly romantic fantasy may be organized less around any particular sexual act than around being chosen, understood or completely emotionally absorbed in another person."
    )
  ),
  p(
    t(
      "These possibilities should be treated as hypotheses, not diagnoses. You do not need to discover a hidden childhood explanation for every erotic image. Some fantasies may simply be pleasurable combinations of memory, imagination, curiosity and learned sexual associations."
    )
  ),
  p(
    t("The purpose of reflection is not to explain fantasy away. It is to discover "),
    b("which parts of it matter to you"),
    t(".")
  ),
  p(
    t(
      "That distinction becomes particularly useful when deciding whether a fantasy belongs in imagination or in lived sexuality."
    )
  ),
  h("Should you live a fantasy?"),
  p(
    t(
      "There is no rule that sexually healthy people enact their fantasies, and there is no rule that healthy fantasies must remain private."
    )
  ),
  p(
    t(
      "Instead, the useful question is whether the fantasy survives translation from imagination into reality."
    )
  ),
  p(
    t(
      "Start by imagining the experience without the mind's editing tools. Include the beginning rather than entering at the erotic moment. Imagine communicating what you want. Imagine your actual body rather than an idealized one. Include boundaries, uncertainty and practical considerations. Think about the other person's inner experience. Then imagine the hour afterward, the following morning and, where relevant, the effect on your relationship."
    )
  ),
  p(t("Notice what happens to your desire.")),
  p(
    t(
      "If the fantasy remains appealing once reality is restored, that tells you something different from a fantasy whose erotic charge disappears as soon as realistic detail enters."
    )
  ),
  p(t("A useful reality test is to ask:")),
  ul(
    [b("Do I want the experience, or mainly the feeling that the fantasy creates?")],
    [b("Does it remain attractive when I include realistic physical and emotional consequences?")],
    [b("Is it compatible with my own values and the agreements of my relationship?")],
    [
      b(
        "Can everyone involved participate through enthusiastic, informed and ongoing consent, without pressure?"
      ),
    ],
    [b("Would a smaller or symbolic version give me the part I actually want?")]
  ),
  p(t("That final question is often overlooked.")),
  p(
    t(
      "Fantasy does not have to be translated literally. If the exciting ingredient is novelty, you may not need the exact imagined scenario to introduce novelty. If the ingredient is surrender, consensually giving a partner more control within clearly agreed boundaries may capture part of it. If the ingredient is being intensely desired, words, attention or a deliberately created erotic setting may provide the psychological experience without recreating the fantasy scene itself."
    )
  ),
  p(
    t("This gives sexuality more flexibility. Instead of choosing between "),
    b("suppressing a fantasy"),
    t(" and "),
    b("fully enacting it"),
    t(", you can ask how much of its erotic logic belongs in your life.")
  ),
  p(
    t(
      "Some fantasies will pass the reality test easily. They feel exciting, genuinely wanted, compatible with your values and relationships, and safe to explore consensually. Thoughtful experimentation with these fantasies can expand a person's erotic repertoire and reveal forms of pleasure they had not previously allowed themselves to experience."
    )
  ),
  p(
    t(
      "Others become less appealing the closer reality gets. Their value may lie precisely in the freedom of imagination."
    )
  ),
  p(
    t(
      "And some fantasies involve circumstances that cannot ethically or safely be recreated. A fantasy involving coercion, for example, does not create permission for coercion in reality. What can potentially be explored is an underlying dynamic such as power, surrender or intensity within conditions where every real participant is choosing the experience and can change or withdraw that choice."
    )
  ),
  p(t("The fantasy is allowed to break the rules of reality. "), b("Your behavior is not.")),
  h("Privacy, disclosure and intimacy"),
  p(
    t(
      "Understanding fantasy also changes the question of whether everything should be shared with a partner."
    )
  ),
  p(
    t(
      "Intimacy does not require two people to have identical inner worlds. A fantasy can be private without being dishonest. At the same time, sharing selected fantasies can create opportunities for sexual communication, mutual understanding and exploration when both partners feel safe discussing them."
    )
  ),
  p(
    t(
      "The important issue is not whether disclosure is automatically good or bad, but what disclosure is meant to accomplish."
    )
  ),
  p(
    t(
      "Are you sharing because you genuinely want your partner to know more about your erotic world? Because you would like to explore something together? Because discussing fantasies itself feels intimate or arousing?"
    )
  ),
  p(
    t(
      "Or are you hoping that disclosure will eliminate your own guilt by transferring the emotional burden to your partner?"
    )
  ),
  p(
    t(
      "Fantasy conversations tend to become more useful when both people understand from the beginning that "
    ),
    b("hearing a fantasy is not the same as receiving a request"),
    t(". A partner should be able to hear "),
    i("“this excites my imagination”"),
    t(
      " without being expected to enact it, approve of every element, or infer that the fantasy represents dissatisfaction with the relationship."
    )
  ),
  p(
    t("Likewise, the person sharing it should be able to say: "),
    i(
      "“I don't know whether I would actually want this. I am trying to understand what about it turns me on.”"
    )
  ),
  p(t("That is a much more precise sexual conversation than treating fantasy as confession.")),
  h("From fantasy to self-knowledge"),
  p(t("The deeper value of fantasy is not that it exposes a secret version of you.")),
  p(t("It is that it gives you another source of information about how your erotic system works.")),
  p(
    t(
      "Recurring fantasies may show you that your sexuality responds strongly to contrast: control in daily life and surrender in imagination, familiarity in relationships and novelty in fantasy, emotional responsibility outside sex and freedom from responsibility inside it. They may show you that being desired matters more than any particular act, that your arousal depends on feeling psychologically safe enough to let go, or that certain aspects of yourself are easier to explore when they remain temporarily separate from your everyday identity."
    )
  ),
  p(
    t(
      "Other fantasies may be much more literal. You may simply discover an experience you genuinely want."
    )
  ),
  p(
    t(
      "Instead of asking whether a fantasy is good, bad, loyal, strange or revealing, ask what happens when you move through three levels:"
    )
  ),
  pt(b("What excites me in imagination?")),
  pt(b("What do I actually want?")),
  p(b("What conditions would make that experience pleasurable, consensual and right for my life?")),
  p(
    t(
      "Sometimes all three answers align. Sometimes they do not. Sexual self-awareness does not require making them align."
    )
  ),
  p(t("It requires knowing the difference.")),
  p(
    b(
      "A fantasy can be emotionally meaningful without being a behavioral instruction. It can be arousing without becoming a desire"
    ),
    t(
      ". It can reveal a feeling worth bringing into your sex life while leaving its literal scenario untouched. And it can belong completely to imagination without making your real relationships less authentic."
    )
  ),
  p(
    t(
      "The aim is therefore neither to suppress fantasy nor to prove its authenticity by acting it out."
    )
  ),
  p(
    t(
      "It is to become more fluent in your own erotic language: to recognize when your mind is showing you an experience you want, when it is using an exaggerated scenario to reach a particular feeling, and when imagination itself is the experience."
    )
  ),
  p(
    t(
      "An important endnote here is that these scores are probability-based estimates, not predictions about you as an individual. Every person is unique, and real-world preferences are shaped by personal experience, context, development, and the combination of multiple archetypes within you. Your own preferences may differ from these patterns or change over time. Treat the scores as clues for exploration, not conclusions about what you should want."
    )
  ),
];

/**
 * Characters of `block` up to and including `marker`, for a paywall cut that
 * falls inside a paragraph. Throws rather than drifting if the copy is reworded,
 * so a stale offset fails at module load instead of silently moving the wall.
 */
function charsThrough(block: Report3Block | undefined, marker: string): number {
  const text = block && block.kind === "para" ? block.runs.map((r) => r.text).join("") : "";
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`report3-learn-more: paywall marker not found: "${marker}"`);
  return at + marker.length;
}

/**
 * Keyed by chapter id, so an article is looked up the same way a gate is.
 *
 * WHICH READERS ACTUALLY MEET THE PAYWALL. `typical_beliefs` is `isPremium: true`
 * (report-general.ts:128) but it is ALSO in ESSENTIALS_SECTION_IDS (access.ts:4-12),
 * so `isSectionUnlockedForPlan` opens it for every paid plan — essentials included.
 * Only a reader with no purchase covering this archetype sees the card, while the
 * card itself says "Unlock full report". If this article is meant as a full_report
 * upsell instead, set `gateSectionId` to a premium section outside the essentials
 * set; nothing in access.ts needs to change. Flagged for Mark.
 */
export const REPORT_V4_LEARN_MORE: Readonly<Record<string, Report3LearnMoreArticle>> = {
  typical_beliefs: {
    chapterId: "typical_beliefs",
    eyebrow: "Reading time: ~15 min.",
    label: "Go deeper & learn more",
    blocks: [...TYPICAL_BELIEFS_FREE, ...TYPICAL_BELIEFS_GATED],
    paywallAt: TYPICAL_BELIEFS_FREE.length,
  },

  typical_arousal_accelerators_turn_ons_of_the_core_archetype: {
    chapterId: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    eyebrow: "Reading time: ~12 min.",
    label: "Go deeper & learn more",
    // 235:234 is now the standard 359px card. Its teaser, 240:239, is the frame's own
    // copy: broken after "A low sex drive." and "becomes possible." where the article
    // runs on, and spelled "fantasise" where the article has "fantasize" (flagged for
    // Mark). Eleven lines (247px), the pill 41.5px above the box's foot — sitting on
    // the first faded line — and 13.5px of card under it. The copy stops where the
    // frame's does; the rest of the sentence is clipped there anyway.
    teaser: [
      p(
        t(
          "Sexual desire is often talked about as if you simply have more or less of it. A high libido. A low libido. A strong sex drive. A low sex drive. \nBut real sexuality is rarely that simple. You can be intensely attracted to someone and still struggle to become aroused. You can fantasise throughout the day and feel strangely blank when sex actually becomes possible. \nYou can love your partner, enjoy sex once it begins, and almost never feel an urge to initiate it. Or you can become aroused quickly but lose that arousal the"
        )
      ),
    ],
    teaserHeightPx: 247,
    teaserPillBottomPx: 41.5,
    closedPaddingBottomPx: 13.5,
    blocks: ACCELERATOR_BRAKES_BLOCKS,
    // 240:240 opens on the heading "The patterns underneath desire".
    paywallAt: 17,
  },

  typical_sexual_fantasy_amp_practice_tendencies: {
    chapterId: "typical_sexual_fantasy_amp_practice_tendencies",
    eyebrow: "Reading time: ~13 min.",
    label: "Go deeper & learn more",
    blocks: FANTASY_REALITY_BLOCKS,
    // The only mid-paragraph cut: 249:243 ends inside block 16 and 245:248
    // resumes in the same paragraph at "Nobody misunderstands you."
    paywallAt: 16,
    paywallCharOffset: charsThrough(FANTASY_REALITY_BLOCKS[16], "Bodies behave as imagined."),
  },
};

/**
 * The expanded chapters still waiting on an article, for the note to Mark.
 * Mirrors missingReport3Summary() in report3-archetype-page.ts.
 */
export function missingReport3LearnMore(chapterIds: readonly string[]): string[] {
  return chapterIds.filter((id) => !REPORT_V4_LEARN_MORE[id]);
}

/** One chapter's article as the reader is entitled to see it. */
export interface V4LearnMoreState {
  article: Report3LearnMoreView;
  locked: boolean;
}

/** Keyed by chapter id, built once at the host. */
export type V4LearnMoreByChapter = Readonly<Record<string, V4LearnMoreState>>;
