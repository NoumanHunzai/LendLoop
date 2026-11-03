/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as authz from "../authz.js";
import type * as constants from "../constants.js";
import type * as hmac from "../hmac.js";
import type * as http from "../http.js";
import type * as loans from "../loans.js";
import type * as notifications from "../notifications.js";
import type * as notify from "../notify.js";
import type * as reminders from "../reminders.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  authz: typeof authz;
  constants: typeof constants;
  hmac: typeof hmac;
  http: typeof http;
  loans: typeof loans;
  notifications: typeof notifications;
  notify: typeof notify;
  reminders: typeof reminders;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
