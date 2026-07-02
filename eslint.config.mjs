import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored static assets for the ritual framework site, not app code.
    ".ritual/**",
    // Vendored chart engine from the metrics-01 registry component. Registry
    // code, not authored here; kept intact so upstream updates stay diffable.
    "src/components/charts/**",
    // Vendored shark-registry UI primitives, installed during the marketing
    // upgrade and kept as a staged kit behind this list. They are unreachable
    // from any page (tree-shaken out of the bundle) and left intact so upstream
    // stays diffable. Prune deliberately when adopting or dropping the kit.
    // Remove a file from this list the moment we edit it for real use.
    "src/components/ui/chart.tsx",
    "src/components/ui/dialog.tsx",
    "src/components/ui/editable.tsx",
    "src/components/ui/file-upload.tsx",
    "src/components/ui/hint.tsx",
    "src/components/ui/hover-card.tsx",
    "src/components/ui/image-cropper.tsx",
    "src/components/ui/number-input.tsx",
    "src/components/ui/pagination.tsx",
    "src/components/ui/radio-group.tsx",
    "src/components/ui/sidebar.tsx",
  ]),
]);

export default eslintConfig;
