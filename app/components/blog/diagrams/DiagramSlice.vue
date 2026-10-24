<script setup lang="ts">
const id = 'slat-slice'
const arrow = `url(#${id}-arrow)`

const appFiles = [
  { name: 'mod.rs', y: 92 },
  { name: 'commands.rs', y: 140 },
  { name: 'dto.rs', y: 188 },
  { name: 'events.rs', y: 236 }
]

const coreFiles = [
  { name: 'mod.rs', y: 92 },
  { name: 'service.rs', y: 140 },
  { name: 'model.rs', y: 188 },
  { name: 'actor/', y: 236 }
]

const pureFiles = [
  { name: 'logic.rs', y: 116 },
  { name: 'store.rs', y: 164 }
]
</script>

<template>
  <svg
    viewBox="0 0 720 300"
    role="img"
    aria-label="One slice: app/recording and core/recording with their fixed files"
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
      y="20"
      width="232"
      height="260"
      rx="12"
      class="d-box d-strong"
    />
    <text
      x="36"
      y="54"
      class="d-mono d-on-strong d-bold"
    >app/recording/</text>
    <g
      v-for="file in appFiles"
      :key="file.name"
    >
      <rect
        x="36"
        :y="file.y - 22"
        width="192"
        height="34"
        rx="7"
        class="d-box d-on-strong-box"
      />
      <text
        x="52"
        :y="file.y"
        class="d-mono"
      >{{ file.name }}</text>
    </g>

    <rect
      x="312"
      y="20"
      width="392"
      height="260"
      rx="12"
      class="d-box"
    />
    <text
      x="332"
      y="54"
      class="d-mono d-bold"
    >core/recording/</text>
    <g
      v-for="file in coreFiles"
      :key="file.name"
    >
      <rect
        x="332"
        :y="file.y - 22"
        width="168"
        height="34"
        rx="7"
        class="d-box d-inner"
      />
      <text
        x="348"
        :y="file.y"
        class="d-mono"
      >{{ file.name }}</text>
    </g>
    <g
      v-for="file in pureFiles"
      :key="file.name"
    >
      <rect
        x="532"
        :y="file.y - 22"
        width="152"
        height="34"
        rx="7"
        class="d-box d-inner"
      />
      <text
        x="548"
        :y="file.y"
        class="d-mono"
      >{{ file.name }}</text>
    </g>

    <path
      d="M228 135 H326"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M326 183 H228"
      class="d-line d-dash"
      :marker-end="arrow"
    />
    <path
      d="M326 231 H228"
      class="d-line d-dash"
      :marker-end="arrow"
    />
    <path
      d="M500 128 C516 128 512 111 526 111"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M500 140 C518 140 512 159 526 159"
      class="d-line"
      :marker-end="arrow"
    />
  </svg>
</template>
