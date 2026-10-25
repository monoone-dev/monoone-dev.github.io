<script setup lang="ts">
const props = withDefaults(defineProps<{ tile?: boolean }>(), { tile: true })

const id = useId()
const paint = (name: string) => `url(#${id}-${name})`
const viewBox = computed(() => (props.tile ? '0 0 1254 1254' : '306 250 635 692'))
</script>

<template>
  <svg
    :viewBox="viewBox"
    class="block size-full overflow-visible"
    role="img"
    aria-label="RigOne"
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
          stop-color="#faf8ff"
        />
        <stop
          offset="1"
          stop-color="#f3f0fb"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-upper`"
        gradientUnits="userSpaceOnUse"
        x1="437"
        y1="350"
        x2="945"
        y2="542"
      >
        <stop stop-color="#5826ff" />
        <stop
          offset=".43"
          stop-color="#9d48fb"
        />
        <stop
          offset="1"
          stop-color="#e6cafa"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-left`"
        gradientUnits="userSpaceOnUse"
        x1="457"
        y1="372"
        x2="309"
        y2="724"
      >
        <stop stop-color="#30209f" />
        <stop
          offset=".42"
          stop-color="#5922ef"
        />
        <stop
          offset="1"
          stop-color="#aa60ff"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-stem`"
        gradientUnits="userSpaceOnUse"
        x1="365"
        y1="579"
        x2="492"
        y2="916"
      >
        <stop stop-color="#963eff" />
        <stop
          offset=".4"
          stop-color="#6124ef"
        />
        <stop
          offset="1"
          stop-color="#2d109f"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-play`"
        gradientUnits="userSpaceOnUse"
        x1="560"
        y1="482"
        x2="646"
        y2="773"
      >
        <stop stop-color="#d5a0fb" />
        <stop
          offset=".44"
          stop-color="#be8af6"
        />
        <stop
          offset="1"
          stop-color="#6029fa"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-lower`"
        gradientUnits="userSpaceOnUse"
        x1="616"
        y1="722"
        x2="937"
        y2="898"
      >
        <stop stop-color="#5c29ff" />
        <stop
          offset=".5"
          stop-color="#b888f8"
        />
        <stop
          offset="1"
          stop-color="#ebd6fb"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-crease`"
        gradientUnits="userSpaceOnUse"
        x1="373"
        y1="658"
        x2="512"
        y2="491"
      >
        <stop
          stop-color="#d9b5ff"
          stop-opacity=".15"
        />
        <stop
          offset="1"
          stop-color="#efe0ff"
          stop-opacity=".9"
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
        <feFlood flood-color="#5a3fb8" />
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

    <g transform="translate(109 92) scale(1.0098) translate(-106 -86) scale(.98)">
      <path
        :fill="paint('upper')"
        d="M355 396 588 271C613 257 641 257 667 271L899 390C925 404 939 428 939 459V532C939 580 891 609 849 586L481 379C445 359 413 363 382 381Z"
      />
      <path
        :fill="paint('left')"
        d="M382 381C415 362 446 360 481 379L514 397V887C514 924 488 937 454 916L356 860C331 845 317 824 317 796V459C317 426 332 406 355 396Z"
      />
      <path
        :fill="paint('stem')"
        d="M514 488V887C514 924 488 937 454 916L356 860C331 845 317 824 317 796V751C317 725 325 705 343 684Z"
      />
      <path
        :fill="paint('play')"
        d="M515 508C515 484 538 473 561 487L737 589C767 606 768 641 738 659L540 773C527 780 519 786 515 797Z"
      />
      <path
        :fill="paint('lower')"
        d="M608 741 726 670C741 661 751 661 767 671L905 753C928 767 939 785 939 810V886C939 932 896 966 853 942L608 801C582 786 582 758 608 741Z"
      />
      <path
        :fill="paint('crease')"
        d="M343 684 513 486V490L345 686Z"
      />
    </g>
  </svg>
</template>
