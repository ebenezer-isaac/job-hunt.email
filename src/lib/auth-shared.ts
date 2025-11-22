export const LOGIN_PAGE_PATH = "/login";
export const LOGIN_PATH = "/api/login";
export const LOGOUT_PATH = "/api/logout";
export const REFRESH_TOKEN_PATH = "/api/token/refresh";
export const LOGIN_REDIRECT_PARAM_KEY = "redirect";
export const LOGIN_STATUS_PARAM_KEY = "loginStatus";
export const PUBLIC_ROUTE_SEGMENTS = [LOGIN_PAGE_PATH, "/register"];
export const ACCESS_CONTROL_CHECK_PATH = "/api/internal/access-control/check";
export const PUBLIC_MIDDLEWARE_BYPASS_REGEX = [
	/^\/healthz$/,
	/^\/_next\//,
	/^\/favicon\.ico$/,
	/^\/robots\.txt$/,
	/^\/sitemap\.xml$/,
	/^\/site\.webmanifest$/,
	/^\/manifest\.json$/,
	/^\/assets\//,
	/^\/api\/internal\/access-control\/check$/,
	/^\/api\/log$/,
];
