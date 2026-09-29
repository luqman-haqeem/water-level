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
import type * as cameras from "../cameras.js";
import type * as crons from "../crons.js";
import type * as lib_jpsClient from "../lib/jpsClient.js";
import type * as notifications from "../notifications.js";
import type * as seedCoordinates from "../seedCoordinates.js";
import type * as stations from "../stations.js";
import type * as sync_cameraUpdater from "../sync/cameraUpdater.js";
import type * as sync_jpsFetch from "../sync/jpsFetch.js";
import type * as sync_stationUpdater from "../sync/stationUpdater.js";
import type * as sync_waterLevelUpdater from "../sync/waterLevelUpdater.js";
import type * as waterLevelData from "../waterLevelData.js";
import type * as waterLevelHistory from "../waterLevelHistory.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  cameras: typeof cameras;
  crons: typeof crons;
  "lib/jpsClient": typeof lib_jpsClient;
  notifications: typeof notifications;
  seedCoordinates: typeof seedCoordinates;
  stations: typeof stations;
  "sync/cameraUpdater": typeof sync_cameraUpdater;
  "sync/jpsFetch": typeof sync_jpsFetch;
  "sync/stationUpdater": typeof sync_stationUpdater;
  "sync/waterLevelUpdater": typeof sync_waterLevelUpdater;
  waterLevelData: typeof waterLevelData;
  waterLevelHistory: typeof waterLevelHistory;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
