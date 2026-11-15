# Diagrams

Sources for the PRO150 proposal's diagrams, so they can be updated as the site changes (task t17).

- `1-system-architecture.dot`: Graphviz. `dot -Tpng -Gdpi=200 1-system-architecture.dot -o 1-system-architecture.png`
- `2-workflow-sign-in-and-sync.mmd`: Mermaid. `npx @mermaid-js/mermaid-cli -i 2-workflow-sign-in-and-sync.mmd -o 2-workflow-sign-in-and-sync.png -s 4 -w 1200 -b white`
  (or paste it into https://mermaid.live and export a PNG)

Updated 2026-11-15 for hosting on Cloudflare (Worker + static assets, gesellschaftmd.com) with Firebase for sign-in and data.
