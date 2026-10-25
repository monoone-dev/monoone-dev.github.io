<script setup lang="ts">
const id = 'fe-frameworks'
const arrow = `url(#${id}-arrow)`

interface Lane {
  name: string
  y: number
  boxes: { label: string, note: string }[]
}

const columns = ['feature', 'facade', 'state', 'I/O']

const lanes: Lane[] = [
  {
    name: 'Angular',
    y: 52,
    boxes: [
      { label: 'Component', note: 'standalone' },
      { label: 'WorkOrdersFacade', note: 'signals' },
      { label: 'NgRx Store', note: 'effects' },
      { label: 'HttpClient', note: 'interceptors' }
    ]
  },
  {
    name: 'Next.js',
    y: 140,
    boxes: [
      { label: 'Component', note: '\'use client\'' },
      { label: 'useWorkOrders()', note: 'values' },
      { label: 'RTK slice', note: 'listeners' },
      { label: 'fetch', note: 'server-only' }
    ]
  },
  {
    name: 'Nuxt',
    y: 228,
    boxes: [
      { label: 'SFC', note: 'script setup' },
      { label: 'useWorkOrders()', note: 'refs' },
      { label: 'Pinia store', note: 'setup store' },
      { label: '$fetch', note: 'useAsyncData' }
    ]
  }
]

const left = 112
const width = 138
const gap = 14
const x = (i: number) => left + i * (width + gap)
</script>

<template>
  <svg
    viewBox="0 0 720 370"
    role="img"
    aria-label="The same four steps in Angular, Next.js and Nuxt, all built on one framework-free model library"
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

    <text
      v-for="(column, i) in columns"
      :key="column"
      :x="x(i) + width / 2"
      y="30"
      class="d-mono d-muted"
      text-anchor="middle"
    >{{ column }}</text>

    <g
      v-for="lane in lanes"
      :key="lane.name"
    >
      <rect
        x="8"
        :y="lane.y - 10"
        width="704"
        height="76"
        rx="12"
        class="d-lane"
      />
      <text
        x="20"
        :y="lane.y + 33"
        class="d-title"
      >{{ lane.name }}</text>
      <g
        v-for="(box, i) in lane.boxes"
        :key="box.label + i"
      >
        <rect
          :x="x(i)"
          :y="lane.y"
          :width="width"
          height="56"
          rx="8"
          class="d-box"
          :class="{ 'd-strong': i === 0 }"
        />
        <text
          :x="x(i) + width / 2"
          :y="lane.y + 25"
          class="d-mono"
          :class="{ 'd-on-strong': i === 0 }"
          text-anchor="middle"
        >{{ box.label }}</text>
        <text
          :x="x(i) + width / 2"
          :y="lane.y + 43"
          class="d-note"
          :class="{ 'd-on-strong': i === 0 }"
          text-anchor="middle"
        >{{ box.note }}</text>
        <path
          v-if="i < lane.boxes.length - 1"
          :d="`M${x(i) + width} ${lane.y + 28} H${x(i + 1) - 2}`"
          class="d-line"
          :marker-end="arrow"
        />
      </g>
    </g>

    <rect
      :x="x(0)"
      y="316"
      :width="x(3) + width - x(0)"
      height="40"
      rx="8"
      class="d-box d-strong"
    />
    <text
      :x="(x(0) + x(3) + width) / 2"
      y="341"
      class="d-mono d-on-strong"
      text-anchor="middle"
    >@fleetline/maintenance/model · framework:agnostic</text>
    <path
      v-for="i in [0, 1, 2]"
      :key="`model-${i}`"
      :d="`M${x(i) + width / 2} 300 V314`"
      class="d-line d-dash"
      :marker-end="arrow"
    />
  </svg>
</template>
