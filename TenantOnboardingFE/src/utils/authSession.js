const TOKEN_KEYS = ["accessToken", "idToken", "refreshToken"];

function canUseSessionStorage() {
  return typeof window !== "undefined" && !!window.sessionStorage;
}

export function saveTokensToSession(tokens = {}) {
  if (!canUseSessionStorage()) return;

  TOKEN_KEYS.forEach((key) => {
    const value = typeof tokens[key] === "string" ? tokens[key] : "";
    if (value) {
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.removeItem(key);
    }
  });
}

export function getTokensFromSession() {
  if (!canUseSessionStorage()) {
    return { accessToken: "", idToken: "", refreshToken: "" };
  }

  return {
    accessToken: sessionStorage.getItem("accessToken") || "",
    idToken: sessionStorage.getItem("idToken") || "",
    refreshToken: sessionStorage.getItem("refreshToken") || "",
  };
}

export function clearTokensFromSession() {
  if (!canUseSessionStorage()) return;
  TOKEN_KEYS.forEach((key) => sessionStorage.removeItem(key));
}
