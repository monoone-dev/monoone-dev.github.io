<script setup lang="ts">
const BARS = 112

const bars = Array.from({ length: BARS }, (_, i) => {
  const x = i / (BARS - 1)
  const wave = Math.abs(Math.sin(x * 9.1) * 0.55 + Math.sin(x * 23.7 + 1.3) * 0.3 + Math.sin(x * 51 + 0.4) * 0.15)
  const taper = Math.sin(Math.PI * x)
  return { height: Math.max(0.06, wave * taper).toFixed(3), delay: `${((i % 12) * -0.18).toFixed(2)}s` }
})
</script>

<template>
  <div
    class="hero-backdrop"
    aria-hidden="true"
  >
    <div class="hero-backdrop__dots" />
    <div class="hero-backdrop__wave">
      <span
        v-for="(bar, i) in bars"
        :key="i"
        :style="{ '--bar': bar.height, '--bar-delay': bar.delay }"
      />
    </div>
  </div>
</template>
