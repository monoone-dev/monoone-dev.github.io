<script setup lang="ts">
const id = useId()

const ribbonA = 'M0 11 Q0 0 9.76 5.07 L100 52 L100 89 Q100 100 90.24 94.93 L0 48 Z'
const ribbonB = 'M0 48 L90.08 4.76 Q100 0 100 11 L100 52 L9.92 95.24 Q0 100 0 89 Z'
</script>

<template>
  <svg
    viewBox="-2 -2 104 104"
    class="mono-mark"
    aria-hidden="true"
  >
    <defs>
      <clipPath :id="`${id}-l`">
        <rect
          x="-2"
          y="-2"
          width="52"
          height="104"
        />
      </clipPath>
      <clipPath :id="`${id}-r`">
        <rect
          x="50"
          y="-2"
          width="52"
          height="104"
        />
      </clipPath>
      <linearGradient
        :id="`${id}-al`"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="0"
        x2="50"
        y2="74"
      >
        <stop
          offset="0"
          style="stop-color: var(--mark-ink)"
        />
        <stop
          offset="1"
          style="stop-color: var(--mark-ink-2)"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-bl`"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="100"
        x2="50"
        y2="26"
      >
        <stop
          offset="0.15"
          style="stop-color: var(--mark-ink)"
        />
        <stop
          offset="1"
          style="stop-color: var(--mark-mid)"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-ar`"
        gradientUnits="userSpaceOnUse"
        x1="50"
        y1="40"
        x2="100"
        y2="90"
      >
        <stop
          offset="0"
          style="stop-color: var(--mark-soft)"
        />
        <stop
          offset="1"
          style="stop-color: var(--mark-light)"
        />
      </linearGradient>
    </defs>

    <g
      class="mono-mark__half mono-mark__half--left"
      :clip-path="`url(#${id}-l)`"
    >
      <path
        :d="ribbonA"
        :fill="`url(#${id}-al)`"
      />
      <path
        :d="ribbonB"
        :fill="`url(#${id}-bl)`"
      />
    </g>
    <g
      class="mono-mark__half mono-mark__half--right"
      :clip-path="`url(#${id}-r)`"
    >
      <path
        :d="ribbonB"
        style="fill: var(--mark-light)"
      />
      <path
        :d="ribbonA"
        :fill="`url(#${id}-ar)`"
      />
    </g>
  </svg>
</template>
