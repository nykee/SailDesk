# Design System

## Direction

SailDesk is a dark, dense operations desk. The canvas is near-black, the data is
high-contrast, and a single lime accent marks what matters: the primary action,
the selected state, the line worth reading. It borrows the discipline of a
trading terminal rather than the gloss of a SaaS marketing site.

No glass effects, no gradients, no decorative charts, no bento grids for their
own sake. Density is the point — an operator should be able to read a portfolio
of sites without scrolling through decoration.

## Palette

Defined once in `src/styles.css` under `:root`. Use the variables, never raw
hex values.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#0b0e11` | page canvas |
| `--sidebar` | `#101419` | project navigation |
| `--surface` | `#151a20` | cards, table bodies |
| `--surface-raised` | `#1a2027` | hovered rows, popovers |
| `--line` | `#29313a` | primary dividers |
| `--line-soft` | `#20272f` | secondary dividers |
| `--text` | `#eff3f5` | primary text |
| `--muted` | `#89949e` | labels, secondary text |
| `--subtle` | `#58636e` | timestamps, footnotes |
| `--lime` | `#a6ff65` | primary action, selected state, positive delta |
| `--lime-deep` | `#77db3d` | lime hover and pressed states |
| `--blue` | `#88a8ff` | informational accents |
| `--red` | `#ff8686` | negative delta, errors |
| `--yellow` | `#efcc62` | warnings, attention items |

Only `--lime` carries emphasis. If a screen shows three lime elements, at most
one of them is doing real work.

## Typography

Baloo 2 Variable is the single family, loaded locally from
`@fontsource-variable/baloo-2`. Headings are heavy and compact; labels are small,
uppercase, and letter-spaced; numeric cells use tabular figures so columns of
metrics stay aligned.

Chinese copy falls back to the platform rounded sans-serif. Keep body lines
between 60 and 72 characters.

## Components

- Cards are flat surfaces separated by `1px` lines, not by shadows.
- `--radius` is `10px` for cards and controls; pills and tags use a full radius.
- Metric blocks put the label above the value, with the delta underneath so a
  column of numbers scans vertically.
- Tables keep the header sticky and the row height tight; the site name is the
  only clickable target in a row.
- Charts are single-series line charts with a visible axis baseline. Do not add
  a second y-axis.
- Icons come from `@tabler/icons-react` at a consistent 16–20px size.

## States

Every data surface must handle four states explicitly: loading, empty, partial
failure, and ready. Partial failure is not empty — a property that errored keeps
its row and its error message, and the aggregate above it is withheld rather
than shown as a smaller number.

## Responsive Behaviour

Desktop keeps the fixed project sidebar plus a fluid report column. Below
`720px` the sidebar collapses into a disclosure panel, metric grids drop to two
columns, and tables scroll horizontally instead of wrapping cells. Controls stay
at least 44px tall.

## Accessibility

Semantic headings and landmarks, visible focus rings, contrast that holds in the
dark theme, descriptive labels on every control, and no state communicated by
colour alone — a delta always carries a sign and an arrow, not just red or green.
