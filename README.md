# VYBE Backend

Express + TypeScript API designed to work with the supplied VYBE Next.js frontend (`NEXT_PUBLIC_API_URL=http://localhost:4000/api`).

## Run locally
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and fill in Supabase URL and anon key.
3. Run `npm install`, then `npm run dev`.
4. Open `http://localhost:4000/api/health`.

The health route works without Supabase configuration. Database/auth routes require a Supabase project and the SQL schema in `supabase-schema.sql` (included in the ZIP root) to be applied. The backend uses Supabase Auth and HttpOnly cookies, matching the frontend's `credentials: include` requests. Bearer tokens are also accepted.

## API compatibility
Implements the frontend's current paths: `/auth/*`, `/feed`, `/feed/following`, `/posts`, nested comments/likes/saves, `/users/:username/follow`, `/stories`, `/conversations`, `/notifications`, `/search`, and `/uploads`.

## Important limits
This is a runnable starter, not a production-ready global social network. Messaging conversation membership, moderation review queues, notification generation, video transcoding, anti-spam systems, and scale/performance work need further development. Configure RLS and storage policies, verify all workflows, and do security testing before public launch.
"# vybe-backend" 
