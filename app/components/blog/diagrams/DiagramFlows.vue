<script setup lang="ts">
const id = 'slat-flows'
const arrow = `url(#${id}-arrow)`

interface Lane {
  name: string
  y: number
  boxes: { label: string, strong?: boolean }[]
  back?: string
}

const lanes: Lane[] = [
  { name: 'Query', y: 34, boxes: [{ label: 'window', strong: true }, { label: 'commands.rs' }, { label: 'service.rs' }, { label: 'store.rs' }], back: 'dto' },
  { name: 'Command', y: 140, boxes: [{ label: 'window', strong: true }, { label: 'commands.rs' }, { label: 'Handle' }, { label: 'update' }, { label: 'Effect' }] },
  { name: 'Event', y: 246, boxes: [{ label: 'actor' }, { label: 'Snapshot' }, { label: 'events.rs' }, { label: 'emit' }, { label: 'window', strong: true }] }
]

const left = 128
const width = 102
const gap = 18
const x = (i: number) => left + i * (width + gap)
</script>

<template>
  <svg
    viewBox="0 0 720 330"
    role="img"
    aria-label="Query, Command and Event flows"
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
      v-for="lane in lanes"
      :key="lane.name"
    >
      <rect
        x="8"
        :y="lane.y - 22"
        width="704"
        height="92"
        rx="12"
        class="d-lane"
      />
      <text
        x="24"
        :y="lane.y + 28"
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
          height="44"
          rx="8"
          class="d-box"
          :class="{ 'd-strong': box.strong }"
        />
        <text
          :x="x(i) + width / 2"
          :y="lane.y + 27"
          class="d-mono"
          :class="{ 'd-on-strong': box.strong }"
          text-anchor="middle"
        >{{ box.label }}</text>
        <path
          v-if="i < lane.boxes.length - 1"
          :d="`M${x(i) + width} ${lane.y + 22} H${x(i + 1) - 2}`"
          class="d-line"
          :marker-end="arrow"
        />
      </g>
      <g v-if="lane.back">
        <path
          :d="`M${x(lane.boxes.length - 1) + width / 2} ${lane.y + 44} V${lane.y + 60} H${x(0) + width / 2} V${lane.y + 48}`"
          class="d-line d-dash"
          :marker-end="arrow"
        />
        <text
          :x="(x(0) + x(lane.boxes.length - 1) + width) / 2"
          :y="lane.y + 58"
          class="d-note d-label-bg"
          text-anchor="middle"
        >{{ lane.back }}</text>
      </g>
    </g>
  </svg>
</template>
