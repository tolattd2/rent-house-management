# Deployment notes

Production deploy performed via Vercel CLI on 2026-05-27.

Live endpoints
- Inspect (Vercel dashboard): https://vercel.com/tolattd2s-projects/rent-house-management/8B7s5qfbjDeEVWrGTDC4vJWjN6ju
- Production build: https://rent-house-management-7hlu31fgh-tolattd2s-projects.vercel.app
- Aliased domain: https://happyhomebyhas.com

Quick smoke test results (performed from local machine):
- `GET /` → 401 Unauthorized (site is reachable; middleware requires auth)
- `GET /login` → 401 Unauthorized (login path protected as expected)
- `GET https://happyhomebyhas.com` → 200 OK (served `/login` page)

Redeploy (from project root)
```bash
# Deploy production build (interactive if not logged in)
npx vercel --prod --yes

# Or, to force a prebuilt production deploy
npx vercel deploy --prebuilt --prod --yes
```

List and inspect deployments
```bash
npx vercel ls
npx vercel inspect <deployment-id-or-url>
```

Alias and rollback notes
- To view aliases and re-assign an alias to a previous deployment use the Vercel dashboard (recommended) or CLI alias commands:
```bash
# Remove an alias from a deployment
npx vercel alias rm <deployment-id> <alias>

# Assign an alias to a deployment
npx vercel alias <deployment-id> <alias>
```

If you need to roll back to a previous deployment, the dashboard makes this easiest: open the project, find the desired deployment under "Deployments", and click "Promote" or re-alias it.

Environment variables
Set environment variables in the Vercel project settings (Production scope). Do NOT rely on local `.env` files for production.

Required / recommended env vars (see `.env.example`):

```
DATABASE_URL
NEXTAUTH_URL
NEXTAUTH_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
RESEND_API_KEY
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
EMAIL_FROM
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_APP_NAME
```

Tips
- Add a `VERCEL_TOKEN` secret and use it for CI deploys: `npx vercel --token $VERCEL_TOKEN --prod --yes`.
- Use the Vercel dashboard to manage domains and certificates; if you change DNS, allow time for propagation.
- For sensitive operations (database migrations, destructive scripts), prefer running locally or from a controlled CI step with proper backups.

Contact / next steps
- If you'd like, I can:
  - Create a GitHub Actions workflow to run `npm run build` and deploy to Vercel automatically.
  - Add a small health-check page (`/health`) returning 200 for uptime monitoring.
