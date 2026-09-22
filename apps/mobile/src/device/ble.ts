// TypeScript resolves this neutral module during repository-wide typechecking.
// Metro selects ble.native.ts on Android and ble.web.ts on web at bundle time.
export * from "./ble.web";
