<script setup lang="ts">
const id = 'slat-tiers'
const arrow = `url(#${id}-arrow)`
</script>

<template>
  <svg
    viewBox="0 0 720 320"
    role="img"
    aria-label="SLAT tiers: app → core → store and drivers → kit"
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

    <rect
      x="16"
      y="112"
      width="128"
      height="96"
      rx="10"
      class="d-box d-strong"
    />
    <text
      x="80"
      y="150"
      class="d-title d-on-strong"
      text-anchor="middle"
    >app</text>
    <text
      x="80"
      y="172"
      class="d-note d-on-strong"
      text-anchor="middle"
    >tauri · commands</text>
    <text
      x="80"
      y="190"
      class="d-note d-on-strong"
      text-anchor="middle"
    >dto · events</text>

    <rect
      x="196"
      y="112"
      width="150"
      height="96"
      rx="10"
      class="d-box"
    />
    <text
      x="271"
      y="150"
      class="d-title"
      text-anchor="middle"
    >core</text>
    <text
      x="271"
      y="172"
      class="d-note"
      text-anchor="middle"
    >slices · actors</text>
    <text
      x="271"
      y="190"
      class="d-note"
      text-anchor="middle"
    >model · logic · service</text>

    <rect
      x="402"
      y="24"
      width="150"
      height="88"
      rx="10"
      class="d-box"
    />
    <text
      x="477"
      y="60"
      class="d-title"
      text-anchor="middle"
    >store</text>
    <text
      x="477"
      y="82"
      class="d-note"
      text-anchor="middle"
    >writer · schema</text>

    <rect
      x="402"
      y="168"
      width="150"
      height="128"
      rx="10"
      class="d-box"
    />
    <text
      x="477"
      y="200"
      class="d-title"
      text-anchor="middle"
    >drivers</text>
    <text
      x="477"
      y="220"
      class="d-note"
      text-anchor="middle"
    >processes · http · cli</text>
    <rect
      x="420"
      y="236"
      width="114"
      height="44"
      rx="8"
      class="d-box d-inner"
    />
    <text
      x="477"
      y="263"
      class="d-mono"
      text-anchor="middle"
    >platform/</text>

    <rect
      x="604"
      y="112"
      width="100"
      height="96"
      rx="10"
      class="d-box"
    />
    <text
      x="654"
      y="150"
      class="d-title"
      text-anchor="middle"
    >kit</text>
    <text
      x="654"
      y="172"
      class="d-note"
      text-anchor="middle"
    >paths · ids</text>
    <text
      x="654"
      y="190"
      class="d-note"
      text-anchor="middle"
    >files · jobs</text>

    <path
      d="M144 160 H190"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M346 140 C374 140 374 70 396 70"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M346 180 C374 180 374 230 396 230"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M552 70 C580 70 576 140 598 140"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M552 230 C580 230 576 180 598 180"
      class="d-line"
      :marker-end="arrow"
    />
  </svg>
</template>
