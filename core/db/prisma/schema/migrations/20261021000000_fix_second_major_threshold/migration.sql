-- The first migration seeded second_major_threshold as '70' (a percentage), but the matching code and the
-- Settings page both use a fraction ('0.7'). Read as a fraction, '70' was clamped to 1.0 and a second major
-- could only be reported at a perfect score. Rewrite any percentage-style value as a fraction.
UPDATE "system_config"
SET "value" = to_char(("value")::numeric / 100, 'FM0.00'),
    "description" = 'Minimum match (0 to 1, e.g. 0.70 = 70%) to qualify as a second major (REQ-FUN-610)',
    "updated_at" = now()
WHERE "key" = 'second_major_threshold'
  AND "value" ~ '^[0-9]+(\.[0-9]+)?$'
  AND ("value")::numeric > 1;
