import { getAuth } from "@clerk/express";
import {
  DeletePersonProfileParams,
  DeletePersonProfileResponse,
  ListPersonProfilesResponse,
  SavePersonProfileBody,
  SavePersonProfileResponse,
} from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const profileColumns = `
  id,
  person_name AS "personName",
  person_role AS "personRole",
  public_role_title AS "publicRoleTitle",
  company_name AS "companyName",
  updated_at AS "updatedAt"
`;

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function requireUserId(req: Parameters<typeof getAuth>[0]): string | null {
  return getAuth(req).userId ?? null;
}

router.get("/person-profiles", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to view saved person details." });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT ${profileColumns}
       FROM saved_person_profiles
       WHERE user_id = $1
       ORDER BY updated_at DESC, person_name ASC
       LIMIT 50`,
      [userId],
    );
    const response = ListPersonProfilesResponse.parse({
      profiles: result.rows.map((row) => ({
        ...row,
        updatedAt: isoDate(row.updatedAt),
      })),
    });
    res.json(response);
  } catch {
    req.log.error({}, "Saved person profiles could not be loaded");
    res.status(500).json({ error: "Saved person details could not be loaded." });
  }
});

router.put("/person-profiles", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to save person details." });
    return;
  }

  const input = SavePersonProfileBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a valid person name and briefing context." });
    return;
  }

  const personName = input.data.personName.trim().replace(/\s+/g, " ");
  const companyName = input.data.companyName?.trim().replace(/\s+/g, " ") || null;
  const publicRoleTitle =
    input.data.publicRoleTitle?.trim().replace(/\s+/g, " ") || null;

  if (personName.length < 2) {
    res.status(400).json({ error: "Enter a person name with at least two characters." });
    return;
  }
  if (input.data.personRole === "business_owner" && !companyName) {
    res.status(400).json({ error: "Enter the Chairman / CEO's company." });
    return;
  }

  const profileRoleTitle =
    input.data.personRole === "mp" ? publicRoleTitle || "MP" : null;
  const profileCompany =
    input.data.personRole === "business_owner" ? companyName : null;

  try {
    const result = await pool.query(
      `INSERT INTO saved_person_profiles (
         id, user_id, person_name, person_role, public_role_title, company_name,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (user_id, person_name, person_role)
       DO UPDATE SET
         public_role_title = EXCLUDED.public_role_title,
         company_name = EXCLUDED.company_name,
         updated_at = NOW()
       RETURNING ${profileColumns}`,
      [
        randomUUID(),
        userId,
        personName,
        input.data.personRole,
        profileRoleTitle,
        profileCompany,
      ],
    );
    const row = result.rows[0];
    const response = SavePersonProfileResponse.parse({
      ...row,
      updatedAt: isoDate(row.updatedAt),
    });
    res.json(response);
  } catch {
    req.log.error({}, "Saved person profile could not be saved");
    res.status(500).json({ error: "Person details could not be saved." });
  }
});

router.delete("/person-profiles/:profileId", async (req, res): Promise<void> => {
  const userId = requireUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to remove saved person details." });
    return;
  }

  const params = DeletePersonProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Saved person profile not found." });
    return;
  }

  try {
    const result = await pool.query(
      "DELETE FROM saved_person_profiles WHERE id = $1 AND user_id = $2 RETURNING id",
      [params.data.profileId, userId],
    );
    if (result.rowCount !== 1) {
      res.status(404).json({ error: "Saved person profile not found." });
      return;
    }
    res.json(DeletePersonProfileResponse.parse({ deleted: true }));
  } catch {
    req.log.error({}, "Saved person profile could not be removed");
    res.status(500).json({ error: "Saved person details could not be removed." });
  }
});

export default router;
