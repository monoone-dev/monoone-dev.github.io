<script setup lang="ts">
const props = withDefaults(defineProps<{ tile?: boolean }>(), { tile: true })

const id = useId()
const paint = (name: string) => `url(#${id}-${name})`
const viewBox = computed(() => (props.tile ? '0 0 1254 1254' : '372 297 508 630'))
</script>

<template>
  <svg
    :viewBox="viewBox"
    class="block size-full overflow-visible"
    role="img"
    aria-label="SurfaceOne"
  >
    <defs>
      <linearGradient
        :id="`${id}-tile`"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
      >
        <stop stop-color="#ffffff" />
        <stop
          offset=".55"
          stop-color="#f7f8fb"
        />
        <stop
          offset="1"
          stop-color="#eef0f6"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-top`"
        gradientUnits="userSpaceOnUse"
        x1="14"
        y1="18"
        x2="50"
        y2="14"
      >
        <stop stop-color="#f7a8f0" />
        <stop
          offset=".45"
          stop-color="#f43fb4"
        />
        <stop
          offset="1"
          stop-color="#ff2a3d"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-left`"
        gradientUnits="userSpaceOnUse"
        x1="12"
        y1="18"
        x2="32"
        y2="42"
      >
        <stop stop-color="#e84ec9" />
        <stop
          offset="1"
          stop-color="#8b2fb8"
          stop-opacity=".85"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-mid`"
        gradientUnits="userSpaceOnUse"
        x1="14"
        y1="32"
        x2="52"
        y2="30"
      >
        <stop stop-color="#0d3b66" />
        <stop
          offset=".45"
          stop-color="#12a9bf"
        />
        <stop
          offset="1"
          stop-color="#5ef2cf"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-right`"
        gradientUnits="userSpaceOnUse"
        x1="32"
        y1="36"
        x2="52"
        y2="56"
      >
        <stop stop-color="#14c8e8" />
        <stop
          offset="1"
          stop-color="#2f6bff"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-bottom`"
        gradientUnits="userSpaceOnUse"
        x1="12"
        y1="46"
        x2="44"
        y2="58"
      >
        <stop stop-color="#3b8bff" />
        <stop
          offset=".6"
          stop-color="#1d2df5"
        />
        <stop
          offset="1"
          stop-color="#7c3aed"
        />
      </linearGradient>
      <filter
        :id="`${id}-tile-shadow`"
        x="-25%"
        y="-20%"
        width="150%"
        height="155%"
        color-interpolation-filters="sRGB"
      >
        <feGaussianBlur
          in="SourceAlpha"
          stdDeviation="30"
        />
        <feOffset dy="28" />
        <feComponentTransfer result="shadow-alpha">
          <feFuncA
            type="linear"
            slope=".24"
          />
        </feComponentTransfer>
        <feFlood flood-color="#55607a" />
        <feComposite
          operator="in"
          in2="shadow-alpha"
        />
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <path
      v-if="tile"
      d="M378 92H873C1045 92 1143 197 1143 362V860C1143 1035 1048 1131 874 1131H379C200 1131 109 1037 109 861V364C109 198 204 92 378 92Z"
      :fill="paint('tile')"
      :filter="paint('tile-shadow')"
    />

    <g
      transform="translate(626 612) scale(11.25) translate(-32 -32)"
      stroke-linejoin="round"
      stroke-width="2.4"
    >
      <polygon
        points="12,46 32,34.5 52,46 32,57.5"
        :fill="paint('bottom')"
        :stroke="paint('bottom')"
      />
      <polygon
        points="32,43.5 52,32 52,46 32,57.5"
        :fill="paint('right')"
        :stroke="paint('right')"
      />
      <polygon
        points="12,32 32,20.5 52,32 32,43.5"
        :fill="paint('mid')"
        :stroke="paint('mid')"
      />
      <polygon
        points="12,18 32,29.5 32,43.5 12,32"
        :fill="paint('left')"
        :stroke="paint('left')"
        opacity=".92"
      />
      <polygon
        points="12,18 32,6.5 52,18 32,29.5"
        :fill="paint('top')"
        :stroke="paint('top')"
      />
    </g>
  </svg>
</template>
