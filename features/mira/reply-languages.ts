/**
 * "Mira replies in" (Settings, 21 Nov 2026): the languages a person may fix Mira's replies to.
 * Without a choice (null) she answers in the language of their latest message.
 *
 * Only languages whose crisis words server/safety.ts reads before the model, so a person who
 * writes in the language they chose has both safety nets: that fixed crisis reply and the model's
 * [[CRISIS]] marker (which works in any language). Serbian is offered in the Latin script, the one
 * those patterns read. The fixed messages (crisis message E, under-18 message G, the refusal
 * line), the support lines and the rest of the app stay in English. `speech` is the language tag
 * (BCP 47) that Talk listens and speaks in when the language is chosen (ui/voice/speech.ts).
 * features/mira/tests/mira-settings-server.test.ts checks every entry against the patterns.
 */
export const REPLY_LANGUAGES = [
  { code: "en", name: "English", native: "English", speech: "en-US" },
  { code: "de", name: "German", native: "Deutsch", speech: "de-DE" },
  { code: "fr", name: "French", native: "Français", speech: "fr-FR" },
  { code: "es", name: "Spanish", native: "Español", speech: "es-ES" },
  { code: "it", name: "Italian", native: "Italiano", speech: "it-IT" },
  { code: "pt", name: "Portuguese", native: "Português", speech: "pt-PT" },
  { code: "nl", name: "Dutch", native: "Nederlands", speech: "nl-NL" },
  { code: "pl", name: "Polish", native: "Polski", speech: "pl-PL" },
  { code: "tr", name: "Turkish", native: "Türkçe", speech: "tr-TR" },
  { code: "ru", name: "Russian", native: "Русский", speech: "ru-RU" },
  { code: "ar", name: "Arabic", native: "العربية", speech: "ar-SA" },
  { code: "bs", name: "Bosnian", native: "Bosanski", speech: "bs-BA" },
  { code: "hr", name: "Croatian", native: "Hrvatski", speech: "hr-HR" },
  { code: "sr", name: "Serbian (Latin script)", native: "Srpski (latinica)", speech: "sr-Latn-RS" },
] as const;

export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number]["code"];

export const REPLY_LANGUAGE_CODES = REPLY_LANGUAGES.map((l) => l.code) as [
  ReplyLanguage,
  ...ReplyLanguage[],
];
