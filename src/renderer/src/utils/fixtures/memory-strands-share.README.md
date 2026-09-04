# Memory Strands wire fixture

Generated from synthetic input by:

```text
node scripts/run-vite-script.mjs scripts/generate-memory-strands-fixture.ts
```

`memory-strands-share.json` pins actual wl1, wl2 and wl3 encoder output plus
expected expanded summaries. The unrecorded case uses the unchanged legacy tag 0;
0, 40 and 100 use tag 3. The 100 case retains a legacy influence too.
The copied tooltip supplied only Kinetic Wand / 27 quality / 40 strands; all
quantities, prices and strategy metadata here are synthetic.

The matching server copy is `bot/fixtures/memory-strands-share.json`. Regenerate
only for an intentional reviewed contract change, copy output rather than retyping
tokens, and parse-and-compare both copies. Client and bot tests must pass together.
