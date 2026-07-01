import { redirect } from "next/navigation";

/**
 * Root entry point. The app has no standalone landing page: authenticated users
 * belong on the board, anonymous users are sent to the login form by the
 * `(app)` route-group guard (an anonymous `GET /api/auth/me` returns 401 without
 * touching the database). So `/` simply forwards into the app.
 */
export default function Home() {
  redirect("/board");
}
