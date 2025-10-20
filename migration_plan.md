# Migration Plan: Supabase to Convex

## Executive Summary

This document outlines the comprehensive migration plan for the Water Level Monitoring application from Supabase to Convex. The application is a Next.js-based real-time dashboard for monitoring river water levels and camera feeds with user authentication and favorites functionality.

## Current Architecture Analysis

### Technology Stack
- **Frontend**: Next.js 14.2.14 with TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + Real-time + Storage)
- **State Management**: Zustand with persistence
- **Styling**: Tailwind CSS with Radix UI components
- **Deployment**: Vercel (assumed based on analytics)

### Database Schema (Inferred from Code Analysis)

#### Core Tables
1. **districts**
   - `id` (primary key)
   - `name`

2. **stations**
   - `id` (primary key)
   - `JPS_sel_id` (external system ID)
   - `public_info_id`
   - `district_id` (foreign key to districts)
   - `station_name`
   - `station_code`
   - `ref_name`
   - `latitude`, `longitude`
   - `gsmNumber`
   - `normal_water_level`, `alert_water_level`, `warning_water_level`, `danger_water_level`
   - `station_status` (boolean)
   - `mode`, `z1`, `z2`, `z3`
   - `battery_level`
   - `created_at`, `updated_at`

3. **current_levels**
   - `id` (primary key)
   - `station_id` (foreign key to stations)
   - `current_level` (decimal)
   - `alert_level` (integer: 0=normal, 1=alert, 2=warning, 3=danger)
   - `updated_at`

4. **cameras**
   - `id` (primary key)
   - `jps_camera_id` (external system ID)
   - `camera_name`
   - `camera_brand`
   - `district_id` (foreign key to districts)
   - `img_url`
   - `is_enabled` (boolean)
   - `is_online` (boolean)
   - `latitude`, `longitude`
   - `main_basin`, `sub_basin`
   - `created_at`, `updated_at`

5. **favorite_stations**
   - `user_id` (foreign key to auth.users)
   - `station_id` (foreign key to stations)

6. **favorite_cameras**
   - `user_id` (foreign key to auth.users)
   - `camera_id` (foreign key to cameras)

### Current Supabase Usage Patterns

#### Authentication
- Email/password authentication
- Magic link authentication
- Google OAuth
- Session management with `onAuthStateChange`
- Real-time user state updates

#### Data Access Patterns
- **Static Generation**: `getStaticProps` for stations and cameras data
- **Client-side queries**: Real-time favorites management
- **Bulk operations**: Station and camera updates via service scripts
- **Row Level Security**: Implied for user-specific favorites

#### Service Scripts (Backend Processing)
- `stationUpdater.js`: Fetches external JPS API and updates station metadata
- `waterLevelUpdater.js`: Updates current water levels from external API
- `cameraUpdater.js`: Updates camera metadata from external API
- `cameraImgDownloader.js`: Downloads camera images (file exists but not analyzed)

## Migration Strategy

### Phase 1: Convex Setup and Schema Migration (Week 1-2)

#### 1.1 Convex Project Setup
```bash
npm install convex
npx convex dev
```

#### 1.2 Schema Definition
Create Convex schema files:

**convex/schema.ts**
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  districts: defineTable({
    name: v.string(),
  }),

  stations: defineTable({
    jpsSelId: v.string(),
    publicInfoId: v.optional(v.string()),
    districtId: v.id("districts"),
    stationName: v.string(),
    stationCode: v.optional(v.string()),
    refName: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    gsmNumber: v.optional(v.string()),
    normalWaterLevel: v.optional(v.number()),
    alertWaterLevel: v.optional(v.number()),
    warningWaterLevel: v.optional(v.number()),
    dangerWaterLevel: v.optional(v.number()),
    stationStatus: v.boolean(),
    mode: v.optional(v.string()),
    z1: v.optional(v.number()),
    z2: v.optional(v.number()),
    z3: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
  }).index("by_jps_sel_id", ["jpsSelId"])
    .index("by_district", ["districtId"]),

  currentLevels: defineTable({
    stationId: v.id("stations"),
    currentLevel: v.number(),
    alertLevel: v.number(), // 0=normal, 1=alert, 2=warning, 3=danger
  }).index("by_station", ["stationId"]),

  cameras: defineTable({
    jpsCameraId: v.string(),
    cameraName: v.string(),
    cameraBrand: v.optional(v.string()),
    districtId: v.id("districts"),
    imgUrl: v.optional(v.string()),
    isEnabled: v.boolean(),
    isOnline: v.optional(v.boolean()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    mainBasin: v.optional(v.string()),
    subBasin: v.optional(v.string()),
  }).index("by_jps_camera_id", ["jpsCameraId"])
    .index("by_district", ["districtId"])
    .index("by_enabled", ["isEnabled"]),

  favoriteStations: defineTable({
    userId: v.string(),
    stationId: v.id("stations"),
  }).index("by_user", ["userId"])
    .index("by_user_station", ["userId", "stationId"]),

  favoriteCameras: defineTable({
    userId: v.string(),
    cameraId: v.id("cameras"),
  }).index("by_user", ["userId"])
    .index("by_user_camera", ["userId", "cameraId"]),
});
```

#### 1.3 Data Migration Scripts
Create migration scripts to transfer data from Supabase to Convex:

**scripts/migrate-data.ts**
```typescript
// Script to export from Supabase and import to Convex
// Handle data transformation and relationship mapping
```

### Phase 2: Authentication Migration (Week 2-3)

#### 2.1 Convex Auth Setup
```bash
npm install @convex-dev/auth
```

**convex/auth.config.ts**
```typescript
export default {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Magic link via email
  ],
};
```

#### 2.2 User State Management Update
Update `lib/store.ts` to use Convex auth:

```typescript
// Replace Supabase auth with Convex auth
// Maintain same interface for minimal component changes
```

### Phase 3: Core Functionality Migration (Week 3-4)

#### 3.1 Query Migration
Replace Supabase queries with Convex queries:

**convex/stations.ts**
```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getStationsWithDetails = query({
  handler: async (ctx) => {
    const stations = await ctx.db.query("stations").collect();
    // Join with districts, currentLevels, cameras
    return stations;
  },
});

export const getStationsByDistrict = query({
  args: { districtId: v.id("districts") },
  handler: async (ctx, { districtId }) => {
    return await ctx.db
      .query("stations")
      .withIndex("by_district", (q) => q.eq("districtId", districtId))
      .collect();
  },
});
```

#### 3.2 Mutation Migration
**convex/favorites.ts**
```typescript
export const addFavoriteStation = mutation({
  args: { stationId: v.id("stations") },
  handler: async (ctx, { stationId }) => {
    const userId = await getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    await ctx.db.insert("favoriteStations", {
      userId,
      stationId,
    });
  },
});
```

#### 3.3 Real-time Updates
Implement Convex subscriptions for real-time data:

```typescript
// Replace Supabase real-time with Convex reactive queries
const stations = useQuery(api.stations.getStationsWithDetails);
```

### Phase 4: Service Scripts Migration (Week 4-5)

#### 4.1 External Data Sync
Migrate service scripts to Convex functions:

**convex/sync/stationUpdater.ts**
```typescript
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

export const updateStations = action({
  handler: async (ctx) => {
    // Fetch from external JPS API
    // Use internal mutations to update Convex data
    await ctx.runMutation(internal.stations.bulkUpdate, { stations });
  },
});
```

#### 4.2 Scheduled Jobs
Set up Convex cron jobs:

**convex/crons.ts**
```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "update water levels",
  { minutes: 5 },
  internal.sync.waterLevelUpdater.updateWaterLevels,
);

crons.interval(
  "update stations",
  { hours: 6 },
  internal.sync.stationUpdater.updateStations,
);

export default crons;
```

### Phase 5: Frontend Migration (Week 5-6)

#### 5.1 Convex Provider Setup
**pages/_app.tsx**
```typescript
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function App({ Component, pageProps }) {
  return (
    <ConvexProvider client={convex}>
      <ConvexAuthProvider>
        <Component {...pageProps} />
      </ConvexAuthProvider>
    </ConvexProvider>
  );
}
```

#### 5.2 Component Updates
Replace Supabase client calls:

**Before (Supabase)**
```typescript
const { data: stations } = await supabase
  .from('stations')
  .select('*, districts(name), current_levels(*), cameras(*)');
```

**After (Convex)**
```typescript
const stations = useQuery(api.stations.getStationsWithDetails);
```

#### 5.3 Static Generation Migration
Replace `getStaticProps` with Convex `preloadQuery`:

```typescript
export async function getStaticProps() {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const stations = await convex.query(api.stations.getStationsWithDetails);
  
  return {
    props: { stations },
    revalidate: 180
  };
}
```

### Phase 6: Testing and Optimization (Week 6-7)

#### 6.1 Data Validation
- Verify data integrity post-migration
- Test all CRUD operations
- Validate real-time updates

#### 6.2 Performance Testing
- Compare query performance
- Test with production data volumes
- Optimize indexes and queries

#### 6.3 User Acceptance Testing
- Test authentication flows
- Verify favorites functionality
- Test real-time data updates

### Phase 7: Deployment and Cutover (Week 7-8)

#### 7.1 Environment Setup
- Set up production Convex deployment
- Configure environment variables
- Set up monitoring and logging

#### 7.2 Data Migration
- Final data sync from Supabase to Convex
- Switch DNS/routing to new deployment
- Monitor for issues

#### 7.3 Cleanup
- Maintain Supabase as backup for rollback period
- Clean up after successful migration

## Risk Assessment and Mitigation

### High-Risk Areas

#### 1. Data Migration Complexity
**Risk**: Data loss or corruption during migration
**Mitigation**: 
- Comprehensive backup strategy
- Incremental migration with validation
- Rollback plan

#### 2. Real-time Functionality
**Risk**: Performance degradation in real-time updates
**Mitigation**:
- Thorough performance testing
- Convex subscription optimization
- Gradual rollout

#### 3. Authentication Integration
**Risk**: User session disruption
**Mitigation**:
- Parallel auth system during transition
- User notification strategy
- Seamless token migration

### Medium-Risk Areas

#### 1. External API Integration
**Risk**: Service script failures affecting data freshness
**Mitigation**:
- Robust error handling
- Monitoring and alerting
- Graceful degradation

#### 2. Static Generation Performance
**Risk**: Build time increases
**Mitigation**:
- Convex query optimization
- Incremental static regeneration
- Caching strategies

## Success Criteria

### Functional Requirements
- [ ] All current functionality preserved
- [ ] User authentication working seamlessly
- [ ] Real-time data updates functioning
- [ ] Favorites system operational
- [ ] External data sync working
- [ ] Mobile responsiveness maintained

### Non-Functional Requirements
- [ ] Page load times ≤ current performance
- [ ] Data freshness maintained (5-minute intervals)
- [ ] 99.9% uptime during business hours
- [ ] Zero data loss during migration
- [ ] User session continuity

### Technical Requirements
- [ ] TypeScript types maintained
- [ ] Code maintainability improved
- [ ] Development experience enhanced
- [ ] Deployment pipeline functional
- [ ] Monitoring and observability in place

## Dependencies and Prerequisites

### Technical Prerequisites
- Convex account and project setup
- Google OAuth app configuration for Convex
- Environment variable migration
- Domain/subdomain for testing

### Team Prerequisites
- Team training on Convex patterns
- Development environment setup
- Testing procedures established
- Rollback procedures documented

## Timeline Summary

| Week | Phase | Key Deliverables |
|------|-------|------------------|
| 1-2  | Setup & Schema | Convex project, schema definition, initial data migration |
| 2-3  | Authentication | Auth system setup, user state migration |
| 3-4  | Core Features | Query/mutation migration, real-time updates |
| 4-5  | Services | Background jobs, external API integration |
| 5-6  | Frontend | Component updates, static generation |
| 6-7  | Testing | Comprehensive testing, performance validation |
| 7-8  | Deployment | Production deployment, data cutover |

## Post-Migration Considerations

### Monitoring and Observability
- Set up Convex dashboard monitoring
- Implement custom metrics for business KPIs
- Error tracking and alerting

### Performance Optimization
- Query performance analysis
- Index optimization based on usage patterns
- Caching strategy implementation

### Feature Enhancements
- Leverage Convex's built-in features for new capabilities
- Real-time collaboration features
- Enhanced offline support

### Cost Optimization
- Monitor Convex usage and costs
- Optimize function execution patterns
- Review data retention policies

## Conclusion

This migration plan provides a comprehensive roadmap for transitioning from Supabase to Convex while maintaining system reliability and user experience. The phased approach minimizes risk while allowing for thorough testing and validation at each stage.

The key success factors are:
1. Maintaining data integrity throughout the migration
2. Preserving all existing functionality
3. Ensuring minimal downtime during cutover
4. Comprehensive testing at each phase
5. Clear rollback procedures

With proper execution, this migration will result in a more maintainable, performant, and feature-rich application leveraging Convex's modern backend capabilities.