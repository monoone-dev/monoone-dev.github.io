<script setup lang="ts">
const id = 'slat-platform'
const arrow = `url(#${id}-arrow)`

const files = [
  { name: 'unix.rs', note: 'unix', y: 36, later: false },
  { name: 'macos.rs', note: 'macos', y: 96, later: false },
  { name: 'linux.rs', note: 'linux', y: 156, later: true },
  { name: 'windows.rs', note: 'windows', y: 216, later: true },
  { name: 'unsupported.rs', note: 'not(macos)', y: 276, later: false }
]
</script>

<template>
  <svg
    viewBox="0 0 720 340"
    role="img"
    aria-label="Platform layout: only drivers/src/platform knows the operating system"
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
      y="126"
      width="150"
      height="88"
      rx="10"
      class="d-box"
    />
    <text
      x="91"
      y="160"
      class="d-title"
      text-anchor="middle"
    >core</text>
    <text
      x="91"
      y="184"
      class="d-note"
      text-anchor="middle"
    >open_path · secret::*</text>
    <text
      x="91"
      y="200"
      class="d-note"
      text-anchor="middle"
    >ProcessGroup</text>

    <rect
      x="222"
      y="126"
      width="182"
      height="88"
      rx="10"
      class="d-box d-strong"
    />
    <text
      x="313"
      y="160"
      class="d-mono d-on-strong d-bold"
      text-anchor="middle"
    >drivers::platform</text>
    <text
      x="313"
      y="186"
      class="d-mono d-on-strong"
      text-anchor="middle"
    >mod.rs</text>
    <text
      x="313"
      y="204"
      class="d-note d-on-strong"
      text-anchor="middle"
    >one API · no logic</text>

    <path
      d="M166 170 H216"
      class="d-line"
      :marker-end="arrow"
    />

    <g
      v-for="file in files"
      :key="file.name"
    >
      <rect
        x="466"
        :y="file.y"
        width="238"
        height="44"
        rx="8"
        class="d-box"
        :class="{ 'd-ghost': file.later }"
      />
      <text
        x="482"
        :y="file.y + 27"
        class="d-mono"
        :class="{ 'd-muted': file.later }"
      >{{ file.name }}</text>
      <text
        x="690"
        :y="file.y + 27"
        class="d-note"
        text-anchor="end"
      >{{ file.note }}</text>
      <path
        :d="`M404 170 C434 170 434 ${file.y + 22} 460 ${file.y + 22}`"
        class="d-line"
        :class="{ 'd-dash': file.later }"
        :marker-end="arrow"
      />
    </g>
  </svg>
</template>
