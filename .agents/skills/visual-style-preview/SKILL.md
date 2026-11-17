---
name: visual-style-preview
description: >-
  MANDATORY gate before implementing any UI layout, visual style, theme,
  typography, color palette, component styling, or aesthetic redesign requested
  by the user. Always generate an interactive visual preview (HTML artifact via
  generative_ui, or mockup) and obtain explicit user approval before modifying
  any project source files.
---

# Visual Style Preview Gate

Whenever the user specifies a **layout**, **visual style**, **theme**, **color scheme**, **typography**, **spacing**, or **UI/UX redesign**, you MUST visualize the proposed design and get explicit user confirmation **before** editing any project files.

## Hard Rules

1. **No Premature Code Edits**: Do NOT modify workspace source files (`.html`, `.css`, `.js`, `.ts`, `.jsx`, `.tsx`, etc.) until the user approves the visual preview.
2. **Always Visualize First**: Describe-only text or ASCII boxes are NOT sufficient for UI/style requests. Render an actual visual preview.
3. **Explicit Bypass Only**: Skip this gate only if the user explicitly says to skip previewing (e.g., "skip preview", "just implement directly"). Pure backend/logic/bugfix tasks with no visual or layout change do not trigger this skill.

## Workflow

### Step 1: Parse Style & Layout Requirements
Extract the user's constraints and target context:
- **Layout structure**: Grid/Flex, sidebar vs. top-nav, card density, responsive behavior.
- **Visual style**: Aesthetic direction (e.g., glassmorphism, brutalist, minimal, editorial, bento grid), color tokens, typography scale, border radius, shadows, motion.
- **Existing constraints**: Inspect relevant project styles/tokens first (read-only) so the preview reflects actual app data or existing design tokens where applicable.

### Step 2: Build the Visual Preview Artifact
Use `write_file` to create a self-contained HTML preview in the artifact directory (`<appDataDir>\brain\<conversation-id>\style-preview.html`) with `ArtifactMetadata` (`UserFacing: true`, `RequestFeedback: false`).

Follow `generative_ui` constraints:
- Include `<script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>` in `<head>`.
- If previewing an **explicit user-requested theme/palette** (e.g., custom dark neon, warm paper, cyberpunk), render those exact colors inside the preview container so the user sees the true visual target; otherwise use semantic CSS variables (`--card`, `--foreground`, `--primary`, `--border`, etc.).
- Include **realistic sample content** matching the user's domain (never generic "Lorem ipsum").
- If there are ambiguous style choices, render **2–3 switchable variants** (e.g., tabs or toggle buttons inside the HTML preview) so the user can compare them directly.
- Placement:
  - Compact component / section (`<= 450px` tall): embed inline via `<agent-embed src="file:///<artifact_path>/style-preview.html"></agent-embed>`.
  - Full-page layout / multi-panel dashboard (`> 450px` tall): deliver as a standalone side-pane artifact and link to it.

*(Fallback: If the request is purely structural/diagrammatic or requires photorealistic illustration rather than UI, use Mermaid or `image-generator` instead.)*

### Step 3: Present Spec Summary & Wait for Approval
In your response alongside the visual preview:
1. Summarize the key design tokens used (Palette, Typography, Layout Grid, Radius/Elevation).
2. Ask the user to confirm or specify adjustments.
3. **Stop and wait.** Do not run build/edit commands on the project until the user replies with approval.

### Step 4: Iterate or Implement
- **If user requests tweaks**: Update `style-preview.html` and re-present for confirmation.
- **If user approves**: Proceed to implement the confirmed layout and style in the workspace codebase, matching the approved preview tokens.
