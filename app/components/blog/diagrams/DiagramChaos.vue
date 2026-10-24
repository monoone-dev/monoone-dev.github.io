<script setup lang="ts">
const id = 'slat-chaos'
const arrow = `url(#${id}-arrow)`

const nodes = [
  { key: 'window', label: 'window', x: 300, y: 16, w: 120, strong: true },
  { key: 'lib', label: 'lib.rs · 2.3k', x: 40, y: 104, w: 150 },
  { key: 'handlers', label: 'handlers.rs · 31k', x: 262, y: 120, w: 196 },
  { key: 'state', label: 'AppState · 41', x: 530, y: 104, w: 150 },
  { key: 'engine', label: 'engine/', x: 40, y: 238, w: 130 },
  { key: 'db', label: 'db.rs · 9 × open', x: 214, y: 262, w: 160 },
  { key: 'statics', label: 'static × 12', x: 412, y: 262, w: 130 },
  { key: 'utils', label: 'utils.rs · 6.4k', x: 568, y: 238, w: 136 }
]

const edges = [
  { d: 'M190 124 H256', wrong: false },
  { d: 'M458 140 H524', wrong: false },
  { d: 'M105 238 C105 120 250 60 296 40', wrong: true },
  { d: 'M330 164 C300 200 270 230 278 256', wrong: false },
  { d: 'M420 164 C440 200 460 230 470 256', wrong: false },
  { d: 'M170 258 C220 250 230 200 300 166', wrong: false },
  { d: 'M636 238 C640 200 620 170 610 150', wrong: true },
  { d: 'M568 258 C540 240 470 200 450 166', wrong: false },
  { d: 'M605 104 C580 60 480 40 426 38', wrong: true },
  { d: 'M374 282 H406', wrong: false },
  { d: 'M110 104 C140 70 250 40 296 36', wrong: true },
  { d: 'M170 250 C260 230 400 210 524 150', wrong: true }
]
</script>

<template>
  <svg
    viewBox="0 0 720 320"
    role="img"
    aria-label="Quayside before SLAT: everything depends on everything"
    class="slat-svg"
  >
    <defs>
      <marker
        :id="`${id}-arrow`"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path
          d="M0,0 L10,5 L0,10 z"
          class="d-head"
        />
      </marker>
    </defs>

    <path
      v-for="(edge, i) in edges"
      :key="i"
      :d="edge.d"
      class="d-line"
      :class="{ 'd-dash': edge.wrong }"
      :marker-end="arrow"
    />

    <g
      v-for="node in nodes"
      :key="node.key"
    >
      <rect
        :x="node.x"
        :y="node.y"
        :width="node.w"
        height="44"
        rx="8"
        class="d-box"
        :class="{ 'd-strong': node.strong }"
      />
      <text
        :x="node.x + node.w / 2"
        :y="node.y + 27"
        class="d-mono"
        :class="{ 'd-on-strong': node.strong }"
        text-anchor="middle"
      >{{ node.label }}</text>
    </g>
  </svg>
</template>
