import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata: Metadata = {
  title: "Sign in — Radiant",
  description: "Log in or create your Radiant agent.",
};

export default function AuthPage() {
  return <AuthCard />;
}
