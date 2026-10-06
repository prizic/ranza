"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ranza/ui";

export function CopyReferenceButton({ reference }: { reference: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(reference);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = reference;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Non-blocking clipboard fallback
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t(copied ? "referenceCopied" : "copyReference")}
            className="size-6 shrink-0 opacity-60 transition-opacity hover:opacity-100 hover:text-foreground text-muted-foreground"
            onClick={handleCopy}
            size="icon"
            type="button"
            variant="ghost"
          >
            {copied ? (
              <Check className="size-3 text-success" />
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {t(copied ? "referenceCopied" : "copyReference")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
