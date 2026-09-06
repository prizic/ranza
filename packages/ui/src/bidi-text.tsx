import type { ReactNode } from "react";

export function BidiText({ children }: { children: ReactNode }) {
  return (
    <bdi className="bidi-isolate" data-bidi-isolate dir="ltr">
      {children}
    </bdi>
  );
}
