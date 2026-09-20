# HIDZ BYPASS

Public redirect resolver built with Next.js, React, TypeScript and Tailwind CSS.

## Features
- Resolve standard HTTP/HTTPS redirect chains up to 20 hops.
- Reads common HTML meta refresh, JavaScript location redirects, JSON destinations, encoded URLs, query-based redirects, and intermediate links.
- Local browser history only.
- Dark / light theme.
- Responsive mobile-first UI.
- SSRF protections for private IP ranges and embedded URL credentials.
- No database or server-side URL history.

## Deploy to Vercel
1. Push this folder to GitHub.
2. Import the repository into Vercel.
3. Framework: Next.js.
4. No environment variables are required.
5. Deploy.

This project intentionally does not bypass CAPTCHA, authentication, paywalls, anti-bot controls, or other access restrictions. It resolves public redirects that the server can fetch normally.
