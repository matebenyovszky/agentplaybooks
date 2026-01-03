# Environment Setup Guide

## Required Environment Variables

Create a `.env.local` file in the project root with these variables:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Application URL (for production)
NEXT_PUBLIC_APP_URL=https://agentplaybooks.ai
```

## OAuth Configuration (CRITICAL)

OAuth redirect URLs **must be configured in the Supabase Dashboard**, not in code.

### Supabase Dashboard Settings

1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**

2. Set **Site URL** to your production domain:
   ```
   https://agentplaybooks.ai
   ```

3. Add **Redirect URLs** for both production and development:
   ```
   https://agentplaybooks.ai/**
   http://localhost:3000/**
   ```

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers) → **OAuth Apps**

2. Create new OAuth App or edit existing:
   - **Application name**: AgentPlaybooks
   - **Homepage URL**: `https://agentplaybooks.ai`
   - **Authorization callback URL**: `https://<YOUR-PROJECT>.supabase.co/auth/v1/callback`

3. Copy the **Client ID** and **Client Secret** to Supabase:
   - Supabase Dashboard → Authentication → Providers → GitHub

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **Credentials**

2. Create OAuth 2.0 Client ID:
   - **Application type**: Web application
   - **Authorized JavaScript origins**: 
     - `https://agentplaybooks.ai`
     - `http://localhost:3000`
   - **Authorized redirect URIs**: 
     - `https://<YOUR-PROJECT>.supabase.co/auth/v1/callback`

3. Copy credentials to Supabase:
   - Supabase Dashboard → Authentication → Providers → Google

### LinkedIn OAuth Setup

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)

2. Create new app and configure:
   - **Authorized redirect URLs**: `https://<YOUR-PROJECT>.supabase.co/auth/v1/callback`

3. Copy credentials to Supabase:
   - Supabase Dashboard → Authentication → Providers → LinkedIn (OIDC)

## Cloudflare Pages Deployment

When deploying to Cloudflare Pages, set these environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=https://agentplaybooks.ai
```

## Common Issues

### OAuth redirects to localhost in production

**Cause**: Supabase "Site URL" is set to localhost or missing.

**Fix**: Set Site URL to `https://agentplaybooks.ai` in Supabase Dashboard → Authentication → URL Configuration.

### 404 on OAuth callback

**Cause**: GitHub/Google OAuth callback URL is incorrect.

**Fix**: Ensure callback URL is `https://<YOUR-PROJECT>.supabase.co/auth/v1/callback` (NOT your app domain).

