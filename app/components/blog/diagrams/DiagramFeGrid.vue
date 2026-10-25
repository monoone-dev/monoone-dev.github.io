<script setup lang="ts">
const id = 'fe-grid'
const arrow = `url(#${id}-arrow)`

const columns = [
  { name: 'maintenance', shared: false },
  { name: 'fleet', shared: false },
  { name: 'booking', shared: false },
  { name: 'billing', shared: false },
  { name: 'shared', shared: true }
]

const rows = [
  { type: 'api', label: 'api' },
  { type: 'feature', label: 'feature-*' },
  { type: 'ui', label: 'ui-*' },
  { type: 'data-access', label: 'data-access' },
  { type: 'model', label: 'model' },
  { type: 'util', label: 'util-*' }
]

const left = 112
const width = 100
const gap = 20
const top = 64
const height = 38
const step = 48

const x = (column: number) => left + column * (width + gap)
const y = (row: number) => top + row * step
const absent = (column: { shared: boolean }, row: { type: string }) =>
  column.shared && (row.type === 'api' || row.type === 'feature')
</script>

<template>
  <svg
    viewBox="0 0 720 380"
    role="img"
    aria-label="Domains as columns, library types as rows; domains reach each other only through their api library"
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
      v-for="(column, c) in columns"
      :key="column.name"
      :x="x(c) + width / 2"
      y="44"
      class="d-mono d-bold"
      text-anchor="middle"
    >{{ column.name }}</text>

    <rect
      v-for="(column, c) in columns"
      :key="`lane-${column.name}`"
      :x="x(c) - 4"
      y="24"
      :width="width + 8"
      height="340"
      rx="10"
      class="d-lane"
    />

    <g
      v-for="(row, r) in rows"
      :key="row.type"
    >
      <text
        x="16"
        :y="y(r) + 24"
        class="d-mono d-muted"
      >{{ row.type }}</text>
      <g
        v-for="(column, c) in columns"
        :key="`${row.type}-${column.name}`"
      >
        <rect
          :x="x(c)"
          :y="y(r)"
          :width="width"
          :height="height"
          rx="7"
          class="d-box"
          :class="{
            'd-strong': row.type === 'api' && !column.shared,
            'd-inner': row.type !== 'api',
            'd-ghost': absent(column, row)
          }"
        />
        <text
          v-if="!absent(column, row)"
          :x="x(c) + width / 2"
          :y="y(r) + 24"
          class="d-mono"
          :class="{ 'd-on-strong': row.type === 'api' && !column.shared }"
          text-anchor="middle"
        >{{ row.label }}</text>
      </g>
    </g>

    <path
      :d="`M${x(0) + width} ${y(1) + 19} C${x(0) + width + 14} ${y(1) + 19} ${x(1) - 14} ${y(0) + 19} ${x(1) - 2} ${y(0) + 19}`"
      class="d-line"
      :marker-end="arrow"
    />

    <path
      :d="`M${x(4) - 2} ${y(3) + 19} H${x(3) + width + 2}`"
      class="d-line d-dash"
      :marker-start="arrow"
    />
  </svg>
</template>
