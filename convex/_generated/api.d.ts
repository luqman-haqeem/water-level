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
import type * as lib_concurrency from "../lib/concurrency.js";
import type * as lib_fetchWithRetry from "../lib/fetchWithRetry.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as lib_syncKeys from "../lib/syncKeys.js";
import type * as notifications from "../notifications.js";
import type * as seedCoordinates from "../seedCoordinates.js";
import type * as stations from "../stations.js";
import type * as sync_cameraImageSync from "../sync/cameraImageSync.js";
import type * as sync_cameraUpdater from "../sync/cameraUpdater.js";
import type * as sync_changeDetection from "../sync/changeDetection.js";
import type * as sync_jpsDate from "../sync/jpsDate.js";
import type * as sync_snapshotBuilder from "../sync/snapshotBuilder.js";
import type * as sync_snapshotPublisher from "../sync/snapshotPublisher.js";
import type * as sync_stationUpdater from "../sync/stationUpdater.js";
import type * as sync_waterLevelUpdater from "../sync/waterLevelUpdater.js";
import type * as syncState from "../syncState.js";
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
  "lib/concurrency": typeof lib_concurrency;
  "lib/fetchWithRetry": typeof lib_fetchWithRetry;
  "lib/r2": typeof lib_r2;
  "lib/syncKeys": typeof lib_syncKeys;
  notifications: typeof notifications;
  seedCoordinates: typeof seedCoordinates;
  stations: typeof stations;
  "sync/cameraImageSync": typeof sync_cameraImageSync;
  "sync/cameraUpdater": typeof sync_cameraUpdater;
  "sync/changeDetection": typeof sync_changeDetection;
  "sync/jpsDate": typeof sync_jpsDate;
  "sync/snapshotBuilder": typeof sync_snapshotBuilder;
  "sync/snapshotPublisher": typeof sync_snapshotPublisher;
  "sync/stationUpdater": typeof sync_stationUpdater;
  "sync/waterLevelUpdater": typeof sync_waterLevelUpdater;
  syncState: typeof syncState;
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
