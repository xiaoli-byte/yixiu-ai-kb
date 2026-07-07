import { Suspense } from "react";
import SearchPageClient from "./SearchPageClient";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">正在加载搜索页面...</div>}>
      <SearchPageClient />
    </Suspense>
  );
}
