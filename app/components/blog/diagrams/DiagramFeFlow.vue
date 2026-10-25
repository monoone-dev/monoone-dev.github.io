<script setup lang="ts">
const id = 'fe-flow'
const arrow = `url(#${id}-arrow)`
</script>

<template>
  <svg
    viewBox="0 0 720 300"
    role="img"
    aria-label="Events go up from the feature through the facade to the store and effects; state comes back down as signals"
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
      x="8"
      y="16"
      width="148"
      height="268"
      rx="12"
      class="d-lane"
    />
    <text
      x="22"
      y="40"
      class="d-note"
    >feature-work-orders</text>
    <rect
      x="176"
      y="16"
      width="536"
      height="268"
      rx="12"
      class="d-lane"
    />
    <text
      x="190"
      y="40"
      class="d-note"
    >data-access</text>

    <rect
      x="20"
      y="76"
      width="124"
      height="72"
      rx="10"
      class="d-box d-strong"
    />
    <text
      x="82"
      y="108"
      class="d-title d-on-strong"
      text-anchor="middle"
    >feature</text>
    <text
      x="82"
      y="130"
      class="d-note d-on-strong"
      text-anchor="middle"
    >component</text>

    <rect
      x="196"
      y="76"
      width="164"
      height="72"
      rx="10"
      class="d-box"
    />
    <text
      x="278"
      y="108"
      class="d-title"
      text-anchor="middle"
    >facade</text>
    <text
      x="278"
      y="130"
      class="d-note"
      text-anchor="middle"
    >open · filterBy · assign</text>

    <rect
      x="400"
      y="56"
      width="170"
      height="112"
      rx="10"
      class="d-box"
    />
    <text
      x="485"
      y="84"
      class="d-title"
      text-anchor="middle"
    >store</text>
    <rect
      x="414"
      y="96"
      width="142"
      height="28"
      rx="6"
      class="d-box d-inner"
    />
    <text
      x="485"
      y="115"
      class="d-mono"
      text-anchor="middle"
    >reducer</text>
    <rect
      x="414"
      y="130"
      width="142"
      height="28"
      rx="6"
      class="d-box d-inner"
    />
    <text
      x="485"
      y="149"
      class="d-mono"
      text-anchor="middle"
    >selectors</text>

    <rect
      x="400"
      y="210"
      width="170"
      height="56"
      rx="10"
      class="d-box"
    />
    <text
      x="485"
      y="243"
      class="d-title"
      text-anchor="middle"
    >effects</text>

    <rect
      x="600"
      y="210"
      width="100"
      height="56"
      rx="10"
      class="d-box d-ghost"
    />
    <text
      x="650"
      y="243"
      class="d-mono"
      text-anchor="middle"
    >HTTP API</text>

    <path
      d="M144 98 H194"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M194 128 H146"
      class="d-line d-dash"
      :marker-end="arrow"
    />

    <path
      d="M360 98 H398"
      class="d-line"
      :marker-end="arrow"
    />
    <text
      x="379"
      y="90"
      class="d-note d-label-bg"
      text-anchor="middle"
    >event</text>
    <path
      d="M398 140 H362"
      class="d-line d-dash"
      :marker-end="arrow"
    />
    <text
      x="379"
      y="158"
      class="d-note d-label-bg"
      text-anchor="middle"
    >signal</text>

    <path
      d="M455 170 V208"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M515 208 V170"
      class="d-line d-dash"
      :marker-end="arrow"
    />
    <text
      x="527"
      y="194"
      class="d-note d-label-bg"
    >succeeded · failed</text>

    <path
      d="M570 230 H598"
      class="d-line"
      :marker-end="arrow"
    />
    <path
      d="M598 252 H572"
      class="d-line d-dash"
      :marker-end="arrow"
    />
  </svg>
</template>
