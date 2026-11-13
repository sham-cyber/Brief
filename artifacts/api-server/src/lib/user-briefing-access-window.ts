import { pool } from "@workspace/db";
import {
  assessAccessWindow,
  type UserBriefingAccessWindow,
} from "./briefing-access-window.ts";

export {
  assessAccessWindow,
  getKolkataDate,
  getMaxAccessWindowEnd,
  isValidCalendarDate,
  validateAccessWindow,
} from "./briefing-access-window.ts";
export type { AccessWindowState, UserBriefingAccessWindow } from "./briefing-access-window.ts";

export async function getUserBriefingAccessWindow(
  userId: string,
): Promise<UserBriefingAccessWindow> {
  const result = await pool.query<{
    access_window_from: string | null;
    access_window_through: string | null;
  }>(
    `SELECT access_window_from::text, access_window_through::text
     FROM user_briefing_preferences
     WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return assessAccessWindow(
    row?.access_window_from ?? null,
    row?.access_window_through ?? null,
  );
}

export async function saveUserBriefingAccessWindow(
  userId: string,
  from: string | null,
  through: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_briefing_preferences
       (user_id, access_window_from, access_window_through, updated_at)
     VALUES ($1, $2::date, $3::date, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET access_window_from = EXCLUDED.access_window_from,
         access_window_through = EXCLUDED.access_window_through,
         updated_at = NOW()`,
    [userId, from, through],
  );
}
