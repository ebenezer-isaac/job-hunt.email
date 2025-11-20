const required = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`${key} is not defined. Double-check NEXT_PUBLIC env vars.`);
  }
  return value;
};

export const clientEnv = {
  firebaseApiKey: required(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, "NEXT_PUBLIC_FIREBASE_API_KEY"),
  firebaseAuthDomain: required(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  firebaseProjectId: required(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  contactEmail: required(process.env.NEXT_PUBLIC_CONTACT_EMAIL, "NEXT_PUBLIC_CONTACT_EMAIL"),
  repoUrl: required(process.env.NEXT_PUBLIC_REPO_URL, "NEXT_PUBLIC_REPO_URL"),
};
