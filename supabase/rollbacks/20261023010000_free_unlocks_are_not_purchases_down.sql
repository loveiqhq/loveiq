-- Rollback of 20261023010000_free_unlocks_are_not_purchases: the two RPCs count the
-- unlock-feedback grant and E07's gift as payments again. The reverse substitution, with the
-- same exactly-once guard.

DO $mig$
DECLARE
  def     TEXT;
  new_def TEXT;
  hits    INT;
  i       INT;
  -- (function, what the migration wrote, what was there before)
  patches CONSTANT TEXT[][] := ARRAY[
    ARRAY[
      'get_conversion_pipeline',
      E'\n          AND metadata->>''gifted'' IS NULL AND coalesce(metadata->>''source'', '''') <> ''unlock_feedback''',
      ''
    ],
    ARRAY[
      'get_dropoff_everywhere',
      E'          AND metadata->>''gifted'' IS NULL\n'
        || E'          AND coalesce(metadata->>''source'', '''') <> ''unlock_feedback''\n',
      ''
    ]
  ];
BEGIN
  FOR i IN 1 .. array_length(patches, 1) LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = patches[i][1];
    IF def IS NULL THEN
      RAISE EXCEPTION 'free-unlock rollback: % not found', patches[i][1];
    END IF;
    hits := (length(def) - length(replace(def, patches[i][2], ''))) / length(patches[i][2]);
    IF hits <> 1 THEN
      RAISE EXCEPTION 'free-unlock rollback: % matched % time(s), expected exactly 1',
        patches[i][1], hits;
    END IF;
    new_def := replace(def, patches[i][2], patches[i][3]);
    EXECUTE new_def;
  END LOOP;
END
$mig$;
