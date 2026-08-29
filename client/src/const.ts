export { COOKIE_NAME } from "@shared/const";

// First-party login (Javin, 29 Aug): email OTP. The Manus OAuth portal flow
// (VITE_OAUTH_PORTAL_URL + __Host- state nonce cookie) is removed from the
// happy path. Call sites keep the startLogin() name so this stays a one-line
// behaviour swap.
export const startLogin = () => {
  window.location.href = "/login";
};
