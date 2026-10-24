<script setup lang="ts">
const id = 'slat-actor'
const arrow = `url(#${id}-arrow)`

const sources = [
  { label: 'window', y: 52 },
  { label: 'process', y: 112 },
  { label: 'timer', y: 172 }
]
</script>

<template>
  <svg
    viewBox="0 0 720 340"
    role="img"
    aria-label="Actor loop: Msg, update, Effect, execute, and Snapshot to the window"
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

    <g
      v-for="source in sources"
      :key="source.label"
    >
      <rect
        x="16"
        :y="source.y"
        width="104"
        height="40"
        rx="8"
        class="d-box"
      />
      <text
        x="68"
        :y="source.y + 25"
        class="d-mono"
        text-anchor="middle"
      >{{ source.label }}</text>
      <path
        :d="`M120 ${source.y + 20} C142 ${source.y + 20} 142 132 164 132`"
        class="d-line"
        :marker-end="arrow"
      />
    </g>

    <rect
      x="170"
      y="104"
      width="130"
      height="56"
      rx="10"
      class="d-box"
    />
    <text
      x="235"
      y="128"
      class="d-mono"
      text-anchor="middle"
    >Handle.send</text>
    <text
      x="235"
      y="148"
      class="d-note"
      text-anchor="middle"
    >Msg → mailbox</text>

    <rect
      x="332"
      y="88"
      width="206"
      height="88"
      rx="12"
      class="d-box d-strong"
    />
    <text
      x="435"
      y="122"
      class="d-mono d-on-strong d-bold"
      text-anchor="middle"
    >update(&amp;mut State, Msg)</text>
    <text
      x="435"
      y="146"
      class="d-note d-on-strong"
      text-anchor="middle"
    >pure · no I/O · no async</text>
    <text
      x="435"
      y="164"
      class="d-mono d-on-strong"
      text-anchor="middle"
    >→ Vec&lt;Effect&gt;</text>

    <rect
      x="568"
      y="104"
      width="146"
      height="56"
      rx="10"
      class="d-box"
    />
    <text
      x="641"
      y="128"
      class="d-mono"
      text-anchor="middle"
    >execute</text>
    <text
      x="641"
      y="148"
      class="d-note"
      text-anchor="middle"
    >drivers · store · timers</text>

    <path
      d="M300 132 H326"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M538 132 H562"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M641 104 V60 H235 V98"
      class="d-line d-dash"
      :marker-end="arrow"
    />
    <text
      x="438"
      y="54"
      class="d-mono d-label-bg"
      text-anchor="middle"
    >result → Msg</text>

    <rect
      x="347"
      y="228"
      width="176"
      height="48"
      rx="10"
      class="d-box"
    />
    <text
      x="435"
      y="257"
      class="d-mono"
      text-anchor="middle"
    >Snapshot (watch)</text>
    <path
      d="M435 176 V222"
      class="d-line"
      :marker-end="arrow"
    />

    <rect
      x="568"
      y="228"
      width="146"
      height="48"
      rx="10"
      class="d-box"
    />
    <text
      x="641"
      y="257"
      class="d-mono"
      text-anchor="middle"
    >app/events.rs</text>
    <path
      d="M523 252 H562"
      class="d-line"
      :marker-end="arrow"
    />

    <rect
      x="568"
      y="296"
      width="146"
      height="36"
      rx="8"
      class="d-box d-strong"
    />
    <text
      x="641"
      y="319"
      class="d-mono d-on-strong"
      text-anchor="middle"
    >window</text>
    <path
      d="M641 276 V290"
      class="d-line"
      :marker-end="arrow"
    />
  </svg>
</template>
