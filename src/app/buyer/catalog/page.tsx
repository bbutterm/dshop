"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CatalogView } from "../CatalogView";

function Inner() {
  const q = useSearchParams().get("q") ?? "";
  return (
    <div className="stack fade-in" style={{ ["--gap" as string]: "14px" }}>
      <h1 className="h1">Каталог</h1>
      <CatalogView key={q} initialQuery={q} />
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
