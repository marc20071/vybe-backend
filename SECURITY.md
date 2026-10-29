# Security notes

- Never commit `.env`; never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend variables.
- Use HTTPS and set `COOKIE_SECURE=true` in production.
- Auth cookies are HttpOnly, SameSite=Lax. Add a CSRF strategy before enabling cross-site deployments.
- Apply the SQL schema and review Row Level Security/storage policies before using real user data.
- Public feed endpoints only select `visibility = public`; do not make private media publicly readable.
- Configure upload limits, MIME validation, moderation, retention, reporting, blocking, account deletion, backups and monitoring before launch.
