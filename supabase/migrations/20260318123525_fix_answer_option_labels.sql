
-- Sync answer_option.option_text to match frontend survey-data.ts labels
-- Fixes data loss on multi-select and missing FK links on single-choice

-- 01003 — single (relationship with sexuality)
UPDATE answer_option SET option_text = 'Not a priority'             WHERE id = 1;
UPDATE answer_option SET option_text = 'Temporarily deprioritized'  WHERE id = 2;
UPDATE answer_option SET option_text = 'Feels complicated'          WHERE id = 3;

-- 02001 — single (desire pattern)
UPDATE answer_option SET option_text = 'Spontaneous'                WHERE id = 5;
UPDATE answer_option SET option_text = 'Responsive'                 WHERE id = 6;
UPDATE answer_option SET option_text = 'Planned window'             WHERE id = 7;
UPDATE answer_option SET option_text = 'Varies by partner/context'  WHERE id = 8;

-- 02004 — single (initiation preference)
UPDATE answer_option SET option_text = 'My partner starts'          WHERE id = 11;
UPDATE answer_option SET option_text = 'Planned window'             WHERE id = 12;
UPDATE answer_option SET option_text = 'Playful either-way'         WHERE id = 13;

-- 03003 — single (preferred setting)
UPDATE answer_option SET option_text = 'Other'                      WHERE id = 19;

-- 03005 — single (arousal pathway)
UPDATE answer_option SET option_text = 'Sensation-led'              WHERE id = 20;
UPDATE answer_option SET option_text = 'Safety/context-led'         WHERE id = 21;
UPDATE answer_option SET option_text = 'Connection-led'             WHERE id = 22;
UPDATE answer_option SET option_text = 'Novelty/adventure-led'      WHERE id = 23;
UPDATE answer_option SET option_text = 'Mastery/competence-led'     WHERE id = 24;
UPDATE answer_option SET option_text = 'Fantasy/imagination-led'    WHERE id = 25;
UPDATE answer_option SET option_text = 'Not sure / varies'          WHERE id = 26;

-- 03006 — single (learning mode)
UPDATE answer_option SET option_text = 'Taught / guided'            WHERE id = 27;
UPDATE answer_option SET option_text = 'Optimizing / understanding' WHERE id = 28;
UPDATE answer_option SET option_text = 'No learning mode'           WHERE id = 29;

-- 03010 — single (erotic risk preference)
UPDATE answer_option SET option_text = 'Adventurous but controlled'     WHERE id = 33;
UPDATE answer_option SET option_text = 'High-risk / edgy / taboo-leaning' WHERE id = 34;

-- 03013 — single (arousing scenario)
UPDATE answer_option SET option_text = 'Being watched / admired'                WHERE id = 35;
UPDATE answer_option SET option_text = 'Watching my partner'                    WHERE id = 36;
UPDATE answer_option SET option_text = 'Absorbed in sensation / connection'     WHERE id = 37;

-- 10002 — single (intimacy communication)
UPDATE answer_option SET option_text = 'Touch / movement'           WHERE id = 48;
UPDATE answer_option SET option_text = 'Short clear phrases'        WHERE id = 49;
UPDATE answer_option SET option_text = 'Ongoing verbal feedback'    WHERE id = 50;
UPDATE answer_option SET option_text = 'Relational check-ins'       WHERE id = 51;

-- 11001 — single (power dynamic)
UPDATE answer_option SET option_text = 'Lead / direct'              WHERE id = 52;
UPDATE answer_option SET option_text = 'Surrender / be led'         WHERE id = 53;
UPDATE answer_option SET option_text = 'Switch'                     WHERE id = 54;
UPDATE answer_option SET option_text = 'Egalitarian / no roles'     WHERE id = 55;
UPDATE answer_option SET option_text = 'Not sure / depends'         WHERE id = 56;

-- 11003 — single (pleasure orientation)
UPDATE answer_option SET option_text = 'Put partner''s pleasure first'  WHERE id = 57;
UPDATE answer_option SET option_text = 'Strive for mutual balance'      WHERE id = 58;
UPDATE answer_option SET option_text = 'Prefer receiving / being guided' WHERE id = 59;
UPDATE answer_option SET option_text = 'Varies'                         WHERE id = 60;

-- 15005 — single (children)
UPDATE answer_option SET option_text = 'Yes, youngest is 0–3'      WHERE id = 87;
UPDATE answer_option SET option_text = 'Yes, youngest is 4–10'     WHERE id = 88;
UPDATE answer_option SET option_text = 'Yes, youngest is 11–17'    WHERE id = 89;

-- 15009 — single (medication impact)
UPDATE answer_option SET option_text = 'Yes, lowers my drive'              WHERE id = 110;
UPDATE answer_option SET option_text = 'Yes, increases my drive'           WHERE id = 111;
UPDATE answer_option SET option_text = 'Yes, not sure how it affects me'   WHERE id = 112;

-- 16001 — single (primary focus)
UPDATE answer_option SET option_text = 'Desire & arousal'           WHERE id = 127;
UPDATE answer_option SET option_text = 'Pleasure & orgasm'          WHERE id = 128;
UPDATE answer_option SET option_text = 'Pain / physical barriers'   WHERE id = 129;
UPDATE answer_option SET option_text = 'Communication'              WHERE id = 131;
UPDATE answer_option SET option_text = 'Healing / repair'           WHERE id = 134;
UPDATE answer_option SET option_text = 'Partner alignment'          WHERE id = 135;
UPDATE answer_option SET option_text = 'Other'                      WHERE id = 136;

-- 16005 — single (current phase)
UPDATE answer_option SET option_text = 'Recharging / Pausing'       WHERE id = 144;
UPDATE answer_option SET option_text = 'Repairing / Reconnecting'   WHERE id = 145;
UPDATE answer_option SET option_text = 'Awakening / Exploring'      WHERE id = 146;
UPDATE answer_option SET option_text = 'Expanding / Experimenting'  WHERE id = 147;
UPDATE answer_option SET option_text = 'Grounded / Integrated'      WHERE id = 148;
UPDATE answer_option SET option_text = 'Evolving / Transcending'    WHERE id = 149;

-- 16006 — single (target phase)
UPDATE answer_option SET option_text = 'Recharging / Pausing'       WHERE id = 150;
UPDATE answer_option SET option_text = 'Repairing / Reconnecting'   WHERE id = 151;
UPDATE answer_option SET option_text = 'Awakening / Exploring'      WHERE id = 152;
UPDATE answer_option SET option_text = 'Expanding / Experimenting'  WHERE id = 153;
UPDATE answer_option SET option_text = 'Grounded / Integrated'      WHERE id = 154;
UPDATE answer_option SET option_text = 'Evolving / Transcending'    WHERE id = 155;

-- 16007 — single (help-seeking style)
UPDATE answer_option SET option_text = 'Research on my own'         WHERE id = 156;
UPDATE answer_option SET option_text = 'Structured tool/app/journal' WHERE id = 157;
UPDATE answer_option SET option_text = 'Program/course'             WHERE id = 158;
UPDATE answer_option SET option_text = 'Professional support'       WHERE id = 159;
UPDATE answer_option SET option_text = 'Act only when urgent'       WHERE id = 160;

-- 16008 — MULTIPLE (support preferences) — DATA LOSS FIX
UPDATE answer_option SET option_text = 'Self-guided tools'          WHERE id = 161;
UPDATE answer_option SET option_text = 'Short structured program'   WHERE id = 162;

-- 16011 — MULTIPLE (regular tools) — DATA LOSS FIX
UPDATE answer_option SET option_text = 'Other paid subscriptions'   WHERE id = 170;
UPDATE answer_option SET option_text = 'Other'                      WHERE id = 171;

-- 16012 — single (annual investment)
UPDATE answer_option SET option_text = '€50'                        WHERE id = 174;
UPDATE answer_option SET option_text = '€200'                       WHERE id = 175;
UPDATE answer_option SET option_text = '€1000+'                     WHERE id = 176;

-- 16014 — MULTIPLE (barriers) — DATA LOSS FIX
UPDATE answer_option SET option_text = 'Not sure what would help'           WHERE id = 177;
UPDATE answer_option SET option_text = 'Time / energy is limited'           WHERE id = 178;
UPDATE answer_option SET option_text = 'Partner isn''t aligned / engaged'   WHERE id = 179;
UPDATE answer_option SET option_text = 'Physical pain / body issues'        WHERE id = 182;
UPDATE answer_option SET option_text = 'Cost / access'                      WHERE id = 183;
;
