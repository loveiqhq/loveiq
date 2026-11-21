/**
 * "Mira replies in" (Settings, 21 Nov 2026): the languages a person may fix Mira's replies to.
 * Without a choice (null) she answers in the language of their latest message.
 *
 * Only languages whose crisis words server/safety.ts reads before the model, so a person who
 * writes in the language they chose has both safety nets: that fixed crisis reply and the model's
 * [[CRISIS]] marker (which works in any language). Serbian is offered in the Latin script, the one
 * those patterns read. The fixed messages (crisis message E, under-18 message G, the refusal
 * line), the support lines and the rest of the app stay in English.
 * features/mira/tests/mira-settings-server.test.ts checks every entry against the patterns.
 */
export const REPLY_LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "bs", name: "Bosnian", native: "Bosanski" },
  { code: "hr", name: "Croatian", native: "Hrvatski" },
  { code: "sr", name: "Serbian (Latin script)", native: "Srpski (latinica)" },
] as const;

export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number]["code"];

export const REPLY_LANGUAGE_CODES = REPLY_LANGUAGES.map((l) => l.code) as [
  ReplyLanguage,
  ...ReplyLanguage[],
];
