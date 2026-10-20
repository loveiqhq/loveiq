/**
 * "Real people love & appreciate our insights." — 842:684 / 987:757. The quote is set
 * in Lora Italic with its key phrase upright (Lora Regular), the frames' own emphasis.
 *
 * Shared with the EUR 1.99 pre-unlock gate (features/report/ui/gate), whose frame (1604:2511)
 * draws the same four.
 */
export interface PaygateReview {
  avatar: string;
  emph: string;
  name: string;
  post: string;
  pre: string;
  role: string;
}

export const PAYGATE_REVIEWS: ReadonlyArray<PaygateReview> = [
  {
    avatar: "/report/paygate/avatar-dorian.png",
    name: "Dorian, 34",
    role: "File manager",
    pre: "“The ",
    emph: "results are extensive and spot-on",
    post: ", without the test being too long. I got to know myself better, and it will help my partner understand me better as well.”",
  },
  {
    avatar: "/report/paygate/avatar-richard.png",
    name: "Richard Petrich, 34",
    role: "Entrepreneur",
    pre: "“The results were ",
    emph: "more insightful than I expected",
    post: ". It connected dots between emotional triggers and communication styles I hadn’t noticed before. Solid UX, too.”",
  },
  {
    avatar: "/report/paygate/avatar-philipp.png",
    name: "Philipp Leonhard, 42",
    role: "Product Owner IT",
    pre: "“I’d never really explored my sexuality or the patterns behind it before. I already learned a lot just from taking the test, but the ",
    emph: "insights in the full report were truly eye-opening. Absolutely worth it.",
    post: "”",
  },
  {
    avatar: "/report/paygate/avatar-marija.png",
    name: "Marija Mustapić, 41",
    role: "IT Infrastructure",
    pre: "“Unlocking my report was ",
    emph: "one of the best investments made for my sexuality",
    post: ". It is shockingly precise.”",
  },
];
