<script setup lang="ts">
import { upcoming } from '~/data/site'

const { t } = useI18n()

const redactions = [[3, 2], [2, 3, 1], [2, 2]]
const split = (name: string) => (name.endsWith('One') ? [name.slice(0, -3), 'One'] : [name, ''])
</script>

<template>
  <div class="grid gap-6 md:grid-cols-2">
    <Reveal
      v-for="(product, i) in upcoming"
      :key="product.name"
      :delay="i * 120"
    >
      <article class="upcoming relative overflow-hidden rounded-3xl border border-default bg-default p-6 sm:p-10">
        <div
          class="upcoming__grid"
          aria-hidden="true"
        />
        <div class="relative flex items-start justify-between gap-4">
          <span class="mono-index text-sm">{{ String(i + 1).padStart(2, '0') }}</span>
          <UBadge
            :label="t('lineup.soon')"
            icon="i-lucide-lock"
            color="neutral"
            variant="outline"
            class="rounded-full font-mono"
          />
        </div>

        <div class="upcoming__icon relative mx-auto mt-6 w-32 sm:w-40">
          <ProductMark :mark="product.mark" />
        </div>

        <h3 class="wordmark relative mt-8 text-center text-3xl text-highlighted sm:text-4xl">
          <b>{{ split(product.name)[0] }}</b><span>{{ split(product.name)[1] }}</span>
        </h3>

        <div
          class="relative mx-auto mt-6 flex max-w-xs flex-col items-center gap-2.5"
          aria-hidden="true"
        >
          <div
            v-for="(line, row) in redactions"
            :key="row"
            class="flex justify-center gap-2"
            :style="{ width: `${100 - row * 15}%` }"
          >
            <span
              v-for="(width, col) in line"
              :key="col"
              class="upcoming__redaction"
              :style="{ flexGrow: width, '--shimmer-delay': `${(row + col) * 160}ms` }"
            />
          </div>
        </div>
      </article>
    </Reveal>
  </div>
</template>
