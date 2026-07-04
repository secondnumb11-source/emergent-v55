import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ensureCaseDocumentsBucket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e1 } = await (supabaseAdmin as any).storage.createBucket("case-documents", {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    });
    const { error: e2 } = await (supabaseAdmin as any).storage.createBucket("judgment-documents", {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    });
    if (e1 && !e1.message.includes("already exists"))
      console.warn("case-documents bucket:", e1.message);
    if (e2 && !e2.message.includes("already exists"))
      console.warn("judgment-documents bucket:", e2.message);
    return { ok: true };
  });
