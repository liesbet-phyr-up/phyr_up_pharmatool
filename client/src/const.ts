export { COOKIE_NAME } from "@shared/const";

// First-party email-code sign-in. Call sites retain the startLogin() name so
// the application can move users to its own login page from one consistent action.
export const startLogin = () => {
  window.location.href = "/login";
};
