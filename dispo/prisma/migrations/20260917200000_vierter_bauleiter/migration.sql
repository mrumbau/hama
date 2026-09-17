-- Gerhard Pettkat war beim Anlegen der Konten vergessen worden.
INSERT INTO "users" ("id", "email", "firstName", "lastName", "role", "siteManagerId", "active", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || v.email),
  v.email, v."firstName", v."lastName", v.rolle::"UserRole",
  (SELECT m."id" FROM "site_managers" m
    WHERE m."firstName" = v."firstName" AND m."lastName" = v."lastName"
    ORDER BY m."active" DESC LIMIT 1),
  true, now(), now()
FROM (VALUES
  ('gp@mrumbau.de', 'Gerhard', 'Pettkat', 'BAULEITER')
) AS v(email, "firstName", "lastName", rolle)
WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."email" = v.email);
