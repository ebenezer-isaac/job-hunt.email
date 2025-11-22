import type { Metadata } from "next";
import { GuideContent } from "@/components/guide/GuideContent";

export const metadata: Metadata = {
  title: "How to Use | Job Hunt Assistant",
  description: "Learn how to use Job Hunt Assistant to generate tailored CVs, cover letters, and cold emails for your job applications.",
};

export default function GuidePage() {
  return <GuideContent />;
}
