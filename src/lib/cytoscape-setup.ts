// Cytoscape プラグインの一括登録（重複登録防止）
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

let registered = false;

export function ensureCytoscapePlugins() {
  if (registered) return;
  cytoscape.use(fcose);
  registered = true;
}
