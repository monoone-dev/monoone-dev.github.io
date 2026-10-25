<script setup lang="ts">
const id = useId()
const paint = (name: string) => `url(#${id}-${name})`
</script>

<template>
  <svg
    viewBox="42 27 1171 1171"
    class="block size-full overflow-visible"
    role="img"
    aria-label="SomaOne"
  >
    <defs>
      <linearGradient
        :id="`${id}-tile`"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
      >
        <stop stop-color="#fff" />
        <stop
          offset=".65"
          stop-color="#faf9f6"
        />
        <stop
          offset="1"
          stop-color="#ecebe7"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-left`"
        x1="260"
        y1="280"
        x2="570"
        y2="650"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#9aff87" />
        <stop
          offset=".35"
          stop-color="#16db9c"
        />
        <stop
          offset="1"
          stop-color="#00afc4"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-leftFold`"
        x1="290"
        y1="420"
        x2="570"
        y2="690"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#007f65" />
        <stop
          offset=".55"
          stop-color="#00ad98"
        />
        <stop
          offset="1"
          stop-color="#28e9c6"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-right`"
        x1="580"
        y1="420"
        x2="980"
        y2="300"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#00bba6" />
        <stop
          offset=".5"
          stop-color="#18e4cd"
        />
        <stop
          offset="1"
          stop-color="#73fff0"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-rightFold`"
        x1="780"
        y1="450"
        x2="960"
        y2="570"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#005d70" />
        <stop
          offset="1"
          stop-color="#00b3c6"
        />
      </linearGradient>
      <radialGradient
        :id="`${id}-core`"
        cx=".2"
        cy=".15"
        r="1"
      >
        <stop stop-color="#6fff8c" />
        <stop
          offset=".5"
          stop-color="#00cba9"
        />
        <stop
          offset="1"
          stop-color="#00788f"
        />
      </radialGradient>
      <linearGradient
        :id="`${id}-front`"
        x1="460"
        y1="460"
        x2="720"
        y2="790"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#32f0ce" />
        <stop
          offset=".45"
          stop-color="#08c7df"
        />
        <stop
          offset="1"
          stop-color="#0086df"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-lower`"
        x1="685"
        y1="650"
        x2="510"
        y2="1000"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#0077cd" />
        <stop
          offset=".5"
          stop-color="#008ee9"
        />
        <stop
          offset="1"
          stop-color="#28c8fc"
        />
      </linearGradient>
      <linearGradient
        :id="`${id}-lowerFold`"
        x1="610"
        y1="790"
        x2="720"
        y2="960"
        gradientUnits="userSpaceOnUse"
      >
        <stop stop-color="#0054a6" />
        <stop
          offset="1"
          stop-color="#0097ee"
        />
      </linearGradient>
      <filter
        :id="`${id}-shadow`"
        x="-20%"
        y="-20%"
        width="140%"
        height="150%"
      >
        <feDropShadow
          dx="0"
          dy="24"
          stdDeviation="20"
          flood-color="#222b30"
          flood-opacity=".2"
        />
      </filter>
    </defs>

    <rect
      x="135"
      y="120"
      width="984"
      height="985"
      rx="238"
      :fill="paint('tile')"
      stroke="#fff"
      stroke-width="6"
      :filter="paint('shadow')"
    />

    <path
      d="M271 377 C245 335 253 284 294 274 C365 251 444 342 514 415 C557 458 593 480 633 479 C695 478 747 408 812 342 C867 286 924 253 968 275 C1011 296 1003 355 987 396 C962 410 932 412 902 423 C840 446 792 484 754 529 C712 578 689 610 668 644 C610 648 560 615 515 579 C455 531 397 484 334 448 C305 431 280 412 271 377Z"
      :fill="paint('right')"
    />

    <path
      d="M271 377 C245 335 253 284 294 274 C365 251 444 342 514 415 C550 452 568 465 593 475 C529 455 481 432 432 421 C364 405 300 419 271 377Z"
      :fill="paint('left')"
    />

    <path
      d="M271 377 C294 415 356 404 432 421 C477 432 517 451 553 474 C509 499 498 538 518 579 C544 631 568 676 563 727 C552 672 518 645 473 624 C405 593 344 563 310 508 C289 473 274 421 271 377Z"
      :fill="paint('leftFold')"
    />

    <path
      d="M432 421 C474 432 517 451 553 474 C516 504 511 542 531 582 C562 641 589 665 563 727 C564 669 526 632 481 602 C429 564 408 527 412 482 C413 460 420 437 432 421Z"
      fill="#00b69d"
      opacity=".55"
    />

    <path
      d="M754 529 C818 457 906 413 964 392 C986 384 993 393 982 426 C967 481 926 568 878 636 C908 571 911 530 885 507 C849 476 798 508 754 549Z"
      :fill="paint('rightFold')"
    />

    <circle
      cx="629"
      cy="356"
      r="88"
      :fill="paint('core')"
    />

    <path
      d="M553 474 C607 493 674 542 717 594 C750 632 766 670 777 705 C756 685 728 677 695 695 C650 721 593 773 549 821 C516 858 489 889 475 922 C448 882 463 833 503 783 C540 736 574 702 563 665 C552 628 511 590 503 552 C495 520 515 490 553 474Z"
      :fill="paint('front')"
    />

    <path
      d="M717 594 C773 649 793 714 779 765 C765 822 705 873 645 925 C600 963 568 987 533 1010 C514 1025 489 1000 475 972 C451 923 468 887 509 839 C559 780 607 743 654 706 C692 677 715 644 717 594Z"
      :fill="paint('lower')"
    />

    <path
      d="M717 594 C748 631 765 671 768 708 C772 755 726 798 682 832 C626 875 578 917 570 955 C567 972 571 985 574 982 L533 1010 C510 1027 487 994 477 973 C458 928 477 887 514 845 C562 791 612 748 654 706 C695 666 711 630 717 594Z"
      :fill="paint('lowerFold')"
      opacity=".8"
    />

    <path
      d="M271 377 C294 415 356 404 432 421 C474 432 517 451 553 474 C607 493 674 542 717 594"
      fill="none"
      stroke="#c6fff2"
      stroke-opacity=".7"
      stroke-width="1.6"
    />

    <path
      d="M754 529 C818 457 906 413 964 392 C976 388 984 389 987 396"
      fill="none"
      stroke="#affffa"
      stroke-opacity=".8"
      stroke-width="1.6"
    />
  </svg>
</template>
