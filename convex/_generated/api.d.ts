/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as cameras from "../cameras.js";
import type * as crons from "../crons.js";
import type * as favorites from "../favorites.js";
import type * as http from "../http.js";
import type * as stations from "../stations.js";
import type * as sync_cameraUpdater from "../sync/cameraUpdater.js";
import type * as sync_stationUpdater from "../sync/stationUpdater.js";
import type * as sync_waterLevelUpdater from "../sync/waterLevelUpdater.js";
import type * as waterLevelData from "../waterLevelData.js";
import type * as waterLevelSummaries from "../waterLevelSummaries.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  cameras: typeof cameras;
  crons: typeof crons;
  favorites: typeof favorites;
  http: typeof http;
  stations: typeof stations;
  "sync/cameraUpdater": typeof sync_cameraUpdater;
  "sync/stationUpdater": typeof sync_stationUpdater;
  "sync/waterLevelUpdater": typeof sync_waterLevelUpdater;
  waterLevelData: typeof waterLevelData;
  waterLevelSummaries: typeof waterLevelSummaries;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
