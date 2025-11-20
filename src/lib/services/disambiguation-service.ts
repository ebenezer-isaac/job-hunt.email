import "server-only";

import { createDebugLogger } from "@/lib/debug-logger";

export type EmailStatus = "verified" | "guessed" | "unavailable";

export type ContactRecord = {
  id?: string;
  name?: string;
  title?: string;
  email?: string;
  emailStatus?: EmailStatus;
  seniority?: string;
  linkedinUrl?: string;
};

const SENIORITY_RANK: Record<string, number> = {
  c_suite: 5,
  vp: 4,
  director: 3,
  manager: 2,
  senior: 1,
  entry: 0,
  owner: 5,
  partner: 5,
  founder: 5,
};

const logger = createDebugLogger("disambiguation-service");

export class DisambiguationService {
  selectBestContact(contacts: ContactRecord[] = []): ContactRecord | null {
    logger.step("Selecting best contact", { count: contacts.length });
    if (!contacts.length) {
      return null;
    }

    if (contacts.length === 1) {
      return contacts[0];
    }

    const scored = contacts.map((contact) => ({
      contact,
      score: this.scoreContact(contact),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.contact ?? null;
  }

  filterContactsWithEmails(contacts: ContactRecord[] = []): ContactRecord[] {
    return contacts.filter((contact) =>
      Boolean(contact.email) &&
      (contact.emailStatus === "verified" || contact.emailStatus === "guessed"),
    );
  }

  isValidContact(contact: ContactRecord | null | undefined): contact is ContactRecord {
    return Boolean(contact?.name && contact.email && contact.title);
  }

  private scoreContact(contact: ContactRecord): number {
    let score = 0;
    const seniority = contact.seniority?.toLowerCase() ?? "";

    for (const [key, value] of Object.entries(SENIORITY_RANK)) {
      if (seniority.includes(key)) {
        score += value * 20;
        break;
      }
    }

    const title = contact.title?.toLowerCase() ?? "";
    if (title.includes("cto") || title.includes("chief technology")) {
      score += 50;
    } else if (title.includes("ceo") || title.includes("chief executive")) {
      score += 50;
    } else if (title.includes("head of") || title.includes("director")) {
      score += 40;
    } else if (title.includes("vp") || title.includes("vice president")) {
      score += 40;
    } else if (title.includes("lead") || title.includes("principal")) {
      score += 30;
    } else if (title.includes("senior") || title.includes("sr")) {
      score += 20;
    }

    if (contact.emailStatus === "verified") {
      score += 30;
    } else if (contact.emailStatus === "guessed") {
      score += 20;
    } else if (contact.email) {
      score += 10;
    }

    if (contact.linkedinUrl) {
      score += 5;
    }

    return score;
  }
}

export const disambiguationService = new DisambiguationService();
