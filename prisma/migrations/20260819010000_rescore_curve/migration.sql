-- The safety score moved from "100 minus penalties" to a curve with a
-- severity ceiling (see src/lib/scan/score.ts). Stored scores were written by
-- the old model, so every finished scan is re-scored here — otherwise a repo's
-- trend would show a jump from 0 to its curve score and read as an improvement
-- that never happened.
UPDATE "Scan" s
SET "score" = sub."score"
FROM (
  SELECT sc."id",
         ROUND(
           LEAST(
             (100.0 / (1.0 + COALESCE(SUM(
               CASE f."severity"
                 WHEN 'critical' THEN 25
                 WHEN 'high'     THEN 12
                 WHEN 'medium'   THEN 5
                 WHEN 'low'      THEN 1
                 ELSE 0
               END), 0) / 100.0))::numeric,
             COALESCE(MIN(
               CASE f."severity"
                 WHEN 'critical' THEN 49
                 WHEN 'high'     THEN 79
                 WHEN 'medium'   THEN 94
                 ELSE 100
               END), 100)::numeric
           )
         )::int AS "score"
  FROM "Scan" sc
  LEFT JOIN "Finding" f ON f."scanId" = sc."id" AND f."dismissed" = false
  WHERE sc."status" = 'done'
  GROUP BY sc."id"
) sub
WHERE s."id" = sub."id"
  AND s."status" = 'done';
