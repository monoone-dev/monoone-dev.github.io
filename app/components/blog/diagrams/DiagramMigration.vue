<script setup lang="ts">
const { t } = useI18n()
const id = 'slat-migration'
const arrow = `url(#${id}-arrow)`

const steps = ['measure', 'invert', 'split', 'tiers', 'slices', 'jobs', 'actors', 'checks'] as const

const place = (i: number) => ({
  x: 16 + (i % 4) * 176,
  y: i < 4 ? 24 : 132
})
</script>

<template>
  <svg
    viewBox="0 0 720 220"
    role="img"
    :aria-label="t('blog.diagrams.migration.label')"
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
      v-for="(step, i) in steps"
      :key="step"
    >
      <rect
        :x="place(i).x"
        :y="place(i).y"
        width="152"
        height="64"
        rx="10"
        class="d-box"
        :class="{ 'd-strong': i === 2 || i === 6 }"
      />
      <text
        :x="place(i).x + 16"
        :y="place(i).y + 26"
        class="d-mono d-bold"
        :class="{ 'd-on-strong': i === 2 || i === 6 }"
      >{{ i + 1 }}</text>
      <text
        :x="place(i).x + 16"
        :y="place(i).y + 48"
        class="d-note"
        :class="{ 'd-on-strong': i === 2 || i === 6 }"
      >{{ t(`blog.diagrams.migration.${step}`) }}</text>
      <path
        v-if="i % 4 !== 3"
        :d="`M${place(i).x + 152} ${place(i).y + 32} H${place(i).x + 170}`"
        class="d-line"
        :marker-end="arrow"
      />
    </g>
    <path
      d="M620 88 V108 H92 V126"
      class="d-line"
      :marker-end="arrow"
    />
  </svg>
</template>
