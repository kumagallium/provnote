// Graph パネル内で「グラフ表示」と「リスト表示」をサブタブ���切り替える
// アイコンレールは 1 つ（Network）のまま、パネル内で切り替え

import { useState } from "react";
import { Network, List } from "lucide-react";
import { NetworkGraphPanel } from "./view";
import { LinkedNotesPanel } from "./linked-notes-panel";
import { useT } from "../../i18n";
import { cn } from "../../lib/utils";
import type { NoteGraphData } from "./graph-builder";

type SubTab = "graph" | "list";

export function GraphLinksPanel({
  data,
  onNavigate,
}: {
  data: NoteGraphData;
  onNavigate: (noteId: string) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("list");
  const t = useT();

  return (
    <div className="flex flex-col h-full">
      {/* サブタブ切り替え */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
        {([
          { key: "list" as const, icon: <List size={14} />, label: t("panel.links") },
          { key: "graph" as const, icon: <Network size={14} />, label: "Graph" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer",
              subTab === tab.key
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      {/* パネル本体 */}
      <div className="flex-1 overflow-hidden">
        {subTab === "graph" ? (
          <NetworkGraphPanel data={data} onNavigate={onNavigate} />
        ) : (
          <LinkedNotesPanel data={data} onNavigate={onNavigate} />
        )}
      </div>
    </div>
  );
}
