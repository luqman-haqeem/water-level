# Convex Migration Guide

This guide walks you through migrating the Water Level Monitoring application from Supabase to Convex.

## Prerequisites

1. **Convex Account**: Sign up at [convex.dev](https://convex.dev)
2. **Google OAuth App**: For Google authentication
3. **Resend Account**: For magic link emails (or alternative email service)
4. **Node.js 18+**: Required for Convex

## Migration Steps

### 1. Install Dependencies

Dependencies are already installed. If you need to reinstall:

```bash
npm install convex @convex-dev/auth
```

### 2. Environment Configuration

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

Fill in the required environment variables:

```env
# Convex Configuration
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud
CONVEX_DEPLOY_KEY=your_convex_deploy_key

# Authentication
AUTH_RESEND_KEY=your_resend_api_key
AUTH_RESEND_FROM=noreply@yourdomain.com
AUTH_GOOGLE_ID=your_google_oauth_client_id
AUTH_GOOGLE_SECRET=your_google_oauth_client_secret
CONVEX_SITE_URL=http://localhost:3000

# External APIs
STATION_URL=your_jps_station_api_url
CAMERA_URL=your_jps_camera_api_url
```

### 3. Initialize Convex

```bash
npx convex login
npx convex dev
```

This will:
- Set up your Convex project
- Generate the schema
- Start the development server

### 4. Set Up Authentication Providers

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URIs:
   - `http://localhost:3000` (development)
   - `https://yourdomain.com` (production)
4. Copy Client ID and Secret to your `.env.local`

#### Resend (Magic Links)
1. Sign up at [resend.com](https://resend.com)
2. Get your API key
3. Verify your domain for sending emails
4. Add the key to your `.env.local`

### 5. Data Migration

Run the migration script to transfer data from Supabase:

```bash
npm run migrate:data
```

This will:
- Migrate districts, stations, cameras, and current levels
- Preserve relationships between entities
- Report any errors encountered

### 6. Update Application Configuration

The following files have been updated for Convex:

- `pages/_app.tsx` - Convex provider setup
- `lib/convexStore.ts` - New state management with Convex
- `pages/index.tsx` - Updated to use Convex queries
- `pages/stations/index.tsx` - Migrated to Convex
- `pages/cameras/index.tsx` - Migrated to Convex
- `components/LoginModel.tsx` - Convex auth integration
- `components/RegisterModel.tsx` - Magic link registration

### 7. Background Services

Convex cron jobs will handle background data synchronization:

- **Water levels**: Updated every 5 minutes
- **Station metadata**: Updated every 6 hours
- **Camera metadata**: Updated every 6 hours

These are configured in `convex/crons.ts`.

### 8. Testing

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Test authentication**:
   - Magic link login
   - Google OAuth login
   - User session persistence

3. **Test data fetching**:
   - Stations list loads correctly
   - Cameras list loads correctly
   - Real-time updates work

4. **Test favorites**:
   - Add/remove favorite stations
   - Add/remove favorite cameras
   - Favorites persist across sessions

### 9. Deployment

#### Deploy Convex Functions
```bash
npm run convex:deploy
```

#### Deploy Frontend
Update your frontend deployment (Vercel, etc.) with the new environment variables.

## Key Differences from Supabase

### Authentication
- **Before**: Supabase Auth with email/password, magic links, OAuth
- **After**: Convex Auth with magic links and Google OAuth only
- **Change**: No more password-based authentication

### Data Fetching
- **Before**: `supabase.from('table').select()`
- **After**: `useQuery(api.tableName.queryFunction)`
- **Change**: Reactive queries with automatic updates

### Real-time Updates
- **Before**: Supabase real-time subscriptions
- **After**: Convex reactive queries (automatic)
- **Change**: No manual subscription management needed

### Background Jobs
- **Before**: External cron jobs calling Supabase
- **After**: Convex cron jobs and actions
- **Change**: Integrated scheduling and execution

### Database Schema
- **Before**: PostgreSQL with foreign keys
- **After**: Document database with Convex IDs
- **Change**: Automatic relationship handling

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**
   - Ensure `.env.local` is in the project root
   - Restart the development server
   - Check for typos in variable names

2. **Convex Authentication Errors**
   - Verify Google OAuth configuration
   - Check Resend API key and domain verification
   - Ensure `CONVEX_SITE_URL` matches your domain

3. **Data Migration Failures**
   - Check Supabase connection and permissions
   - Verify Convex deployment is accessible
   - Review migration script logs for specific errors

4. **Query Errors**
   - Ensure Convex schema matches your data
   - Check that all required indexes are defined
   - Verify function names in API calls

### Getting Help

1. **Convex Documentation**: [docs.convex.dev](https://docs.convex.dev)
2. **Convex Discord**: [convex.dev/community](https://convex.dev/community)
3. **Migration Issues**: Check the error logs and compare with the migration plan

## Rollback Plan

If you need to rollback to Supabase:

1. Keep the original Supabase configuration
2. Revert the frontend changes using git
3. Update environment variables back to Supabase
4. Restart the application

The migration preserves the original file structure, so rollback should be straightforward.

## Performance Considerations

### Convex Advantages
- **Automatic optimization**: Queries are optimized by Convex
- **Real-time by default**: No manual subscription management
- **Integrated caching**: Built-in query caching
- **Serverless scaling**: Automatically scales with usage

### Monitoring
- Use Convex dashboard for function performance
- Monitor query execution times
- Track authentication success rates
- Watch for background job failures

## Security

### Authentication Security
- Magic links expire after 24 hours
- Google OAuth uses secure PKCE flow
- Session management handled by Convex

### Data Security
- All queries run server-side
- Built-in access control
- Environment variables for sensitive data

## Next Steps

After successful migration:

1. **Remove Supabase dependencies** (once stable)
2. **Optimize Convex queries** based on usage patterns
3. **Add new features** leveraging Convex capabilities
4. **Monitor performance** and adjust as needed

## Support

For migration-specific issues, refer to:
- The original migration plan: `migration_plan.md`
- Convex documentation: [docs.convex.dev](https://docs.convex.dev)
- Project issues and discussions