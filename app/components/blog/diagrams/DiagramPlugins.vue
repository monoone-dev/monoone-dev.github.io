<script setup lang="ts">
const id = 'slat-plugins'
const arrow = `url(#${id}-arrow)`

const baseSlices = [
  { name: 'summary/', file: 'hooks.rs', y: 194 },
  { name: 'recording/', file: '', y: 242 },
  { name: 'plugin/', file: '', y: 290 }
]

const pluginSlices = [
  { name: 'board/', file: 'plugin.rs hooks.rs', y: 194 },
  { name: 'companion/', file: 'plugin.rs', y: 242 }
]
</script>

<template>
  <svg
    viewBox="0 0 720 340"
    role="img"
    aria-label="Plugins: app assembles base slices and the plugins that are on; plugin slices import base slices, base slices never import plugin slices"
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
      x="200"
      y="16"
      width="320"
      height="72"
      rx="12"
      class="d-box d-strong"
    />
    <text
      x="360"
      y="46"
      class="d-mono d-on-strong d-bold"
      text-anchor="middle"
    >app/src/state.rs</text>
    <text
      x="360"
      y="70"
      class="d-note d-on-strong"
      text-anchor="middle"
    >assembles only what is on</text>

    <path
      d="M280 88 V124"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M440 88 V124"
      class="d-line d-dash"
      :marker-end="arrow"
    />
    <text
      x="452"
      y="112"
      class="d-note"
    >if on</text>

    <rect
      x="16"
      y="130"
      width="290"
      height="194"
      rx="12"
      class="d-box"
    />
    <text
      x="161"
      y="160"
      class="d-title"
      text-anchor="middle"
    >base slices</text>
    <g
      v-for="slice in baseSlices"
      :key="slice.name"
    >
      <rect
        x="36"
        :y="slice.y - 22"
        width="250"
        height="34"
        rx="7"
        class="d-box d-inner"
      />
      <text
        x="52"
        :y="slice.y"
        class="d-mono"
      >{{ slice.name }}</text>
      <text
        x="270"
        :y="slice.y"
        class="d-mono d-muted"
        text-anchor="end"
      >{{ slice.file }}</text>
    </g>

    <rect
      x="414"
      y="130"
      width="290"
      height="194"
      rx="12"
      class="d-box d-ghost"
    />
    <text
      x="559"
      y="160"
      class="d-title"
      text-anchor="middle"
    >plugin slices</text>
    <g
      v-for="slice in pluginSlices"
      :key="slice.name"
    >
      <rect
        x="434"
        :y="slice.y - 22"
        width="250"
        height="34"
        rx="7"
        class="d-box d-inner"
      />
      <text
        x="450"
        :y="slice.y"
        class="d-mono"
      >{{ slice.name }}</text>
      <text
        x="668"
        :y="slice.y"
        class="d-mono d-muted"
        text-anchor="end"
      >{{ slice.file }}</text>
    </g>
    <text
      x="559"
      y="300"
      class="d-note"
      text-anchor="middle"
    >off: no service, no hook, no events</text>

    <path
      d="M434 188 H292"
      class="d-line"
      :marker-end="arrow"
    />
    <text
      x="360"
      y="180"
      class="d-note d-label-bg"
      text-anchor="middle"
    >answers a hook</text>
    <path
      d="M434 236 H292"
      class="d-line"
      :marker-end="arrow"
    />
    <text
      x="360"
      y="228"
      class="d-note d-label-bg"
      text-anchor="middle"
    >listens</text>
    <path
      d="M306 316 H408"
      class="d-line d-dash"
      :marker-end="arrow"
    />
    <text
      x="360"
      y="308"
      class="d-note d-label-bg"
      text-anchor="middle"
    >never imports</text>
  </svg>
</template>
