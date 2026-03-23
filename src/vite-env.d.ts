/// <reference types="vite/client" />

declare module "cytoscape-fcose" {
  const fcose: cytoscape.Ext;
  export default fcose;
}

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
