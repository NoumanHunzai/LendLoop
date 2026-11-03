"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

export function AuthSync() {
  const { isSignedIn } = useUser();
  const ensure = useMutation(api.users.ensure);

  useEffect(() => {
    if (!isSignedIn) return;
    void ensure();
  }, [ensure, isSignedIn]);

  return null;
}
