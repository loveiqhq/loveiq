import type { ComponentType, CSSProperties, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export interface ReportTheme {
  archetype: string;
  accent: string;
  accentRgb: string;
  iconBackground: string;
  iconBackgroundRgb: string;
  motto: string;
  motivation: string;
  communication: string;
  initiation: string;
  attachment: string;
  powerOrientation: string;
  riskOrientation: string;
  riskSegments: 1 | 2 | 3;
  confidence: string;
  confidenceSegments: 1 | 2 | 3;
  Icon: ComponentType<IconProps>;
}

const traitIconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.7,
} as const;

// Archetype icon for: Sensual Connector
const HeartIcon = (props: IconProps) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M41.8225 44.5775C43.2875 46.0425 43.2875 48.4175 41.8225 49.88C40.3575 51.345 37.9825 51.345 36.52 49.88L24.935 38.295C23.9575 37.3175 22.375 37.3175 21.4 38.295C20.4225 39.2725 20.4225 40.855 21.4 41.83L31.9275 52.3575C33.3925 53.8225 33.3925 56.1975 31.9275 57.66C30.4625 59.125 28.0875 59.125 26.625 57.66L14.9425 45.9775C7.5525 38.7675 0 29.155 0 20C0 10.35 7.29 2.5 16.25 2.5C20.6825 2.5 24.0775 4.155 26.6625 5.9925L17.565 15.0125C15.91 16.665 15 18.865 15 21.2025C15 23.54 15.91 25.7375 17.56 27.3875C19.2125 29.0425 21.41 29.9525 23.75 29.9525C24.815 29.9525 25.8425 29.74 26.8125 29.38L41.825 44.58L41.8225 44.5775ZM36.0525 21.3125L30.8225 26.5075L46.0975 41.5525C47.5625 43.0175 49.9375 43.0175 51.4 41.5525C53.64 39.3125 51.7225 36.8325 51.7225 36.8325L36.0525 21.3125ZM43.6425 2.645C39.5575 2.67 35.6775 4.445 32.6875 7.23L21.095 18.745C19.63 20.21 19.63 22.585 21.095 24.0475C22.56 25.5125 24.935 25.5125 26.3975 24.0475L32.64 17.8475C34.59 15.91 37.735 15.91 39.6875 17.8475L55.4975 33.5425C58.475 28.7375 59.995 24.2375 59.995 20.145C59.995 10.495 52.6 2.645 43.64 2.645H43.6425Z"
      fill="#130B17"
    />
  </svg>
);

// Archetype icon for: Spark Seeker
const SparklesIcon = (props: IconProps) => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M31.8896 19.2816C31.8896 18.655 31.538 18.08 30.978 17.795C29.5446 17.065 28.0096 16.3933 26.2896 15.74C23.4463 14.65 21.3746 12.5466 20.298 9.66498C19.653 7.91665 18.9896 6.35998 18.2713 4.90665C17.9896 4.33998 17.4096 3.97998 16.778 3.97998C16.1463 3.97998 15.563 4.33998 15.2846 4.90831C14.568 6.35665 13.9063 7.91331 13.2613 9.65831C12.1846 12.545 10.1113 14.6483 7.27297 15.7366C5.54297 16.395 4.0063 17.0666 2.57797 17.795C2.01964 18.0783 1.66797 18.6533 1.66797 19.28C1.66797 19.9066 2.01964 20.4816 2.57964 20.7666C4.0163 21.4966 5.5513 22.17 7.26797 22.82C10.1113 23.91 12.183 26.0133 13.2596 28.8966C13.908 30.6516 14.5696 32.205 15.2846 33.6533C15.5663 34.2216 16.1446 34.5816 16.778 34.5816C17.4113 34.5816 17.9913 34.2216 18.2713 33.6533C18.9896 32.205 19.6513 30.6483 20.2946 28.9016C21.373 26.015 23.448 23.9116 26.283 22.8233C28.0063 22.17 29.5413 21.4983 30.978 20.7683C31.538 20.4833 31.8896 19.91 31.8896 19.2816Z"
      fill="#130B17"
    />
    <path
      d="M28.4934 10.9034C28.9184 11.1201 29.3367 11.2984 29.7484 11.4551C30.0934 11.5884 30.3351 11.8351 30.4651 12.1801C30.6184 12.6017 30.7934 13.0217 31.0051 13.4517C31.2834 14.0217 31.8634 14.3851 32.4984 14.3851H32.5017C33.1351 14.3851 33.7151 14.0251 33.9951 13.4567C34.2067 13.0284 34.3801 12.6067 34.5351 12.1884C34.6684 11.8351 34.9101 11.5884 35.2484 11.4584C35.6667 11.3001 36.0834 11.1217 36.5084 10.9051C37.0684 10.6217 37.4201 10.0451 37.4201 9.41841C37.4201 8.79174 37.0667 8.21675 36.5067 7.93341C36.0834 7.72008 35.6667 7.54174 35.2534 7.38341C34.9101 7.25174 34.6684 7.00508 34.5367 6.65508C34.3801 6.23341 34.2067 5.81174 33.9934 5.38174C33.7134 4.81508 33.1334 4.45508 32.5001 4.45508H32.4967C31.8617 4.45508 31.2834 4.81674 31.0034 5.38674C30.7934 5.81508 30.6184 6.23674 30.4667 6.65008C30.3334 7.00341 30.0917 7.25008 29.7534 7.38008C29.3334 7.54008 28.9167 7.71675 28.4917 7.93341C27.9317 8.21675 27.5801 8.79174 27.5801 9.41841C27.5801 10.0451 27.9317 10.6201 28.4917 10.9034H28.4934Z"
      fill="#130B17"
    />
    <path
      d="M37.4219 28.6415C36.8935 28.3732 36.3719 28.1499 35.8585 27.9565C35.2935 27.7399 34.8819 27.3199 34.6702 26.7499C34.4752 26.2232 34.2569 25.6965 33.9935 25.1632C33.7119 24.5949 33.1319 24.2349 32.5002 24.2349C31.8652 24.2349 31.2852 24.5965 31.0069 25.1665C30.7452 25.6999 30.5269 26.2249 30.3369 26.7415C30.1202 27.3199 29.7085 27.7399 29.1519 27.9532C28.6319 28.1499 28.1085 28.3732 27.5819 28.6432C27.0235 28.9282 26.6719 29.5015 26.6719 30.1282C26.6719 30.7549 27.0235 31.3282 27.5819 31.6132C28.1085 31.8815 28.6285 32.1032 29.1469 32.3015C29.7085 32.5165 30.1202 32.9349 30.3335 33.5065C30.5269 34.0315 30.7452 34.5582 31.0085 35.0899C31.2885 35.6582 31.8669 36.0182 32.5019 36.0199C33.1352 36.0199 33.7135 35.6615 33.9952 35.0932C34.2602 34.5599 34.4785 34.0332 34.6719 33.5115C34.8852 32.9349 35.2969 32.5165 35.8585 32.3015C36.3785 32.1032 36.8969 31.8832 37.4235 31.6149C37.9835 31.3299 38.3352 30.7549 38.3352 30.1282C38.3352 29.5015 37.9835 28.9265 37.4235 28.6415H37.4219Z"
      fill="#130B17"
    />
  </svg>
);

// Archetype icon for: Relational Nurturer
const SproutIcon = (props: IconProps) => (
  <svg width="59" height="59" viewBox="0 0 59 59" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M9.85032 1.96479C9.80382 0.861201 10.7107 -0.0450258 11.8142 0.00164054C23.9703 0.515674 29.1096 5.90834 29.4217 18.3737L29.4511 18.3885C29.7586 5.91339 34.8957 0.515878 47.0585 0.00163464C48.1621 -0.0450247 49.069 0.8612 49.0225 1.96479C48.5266 13.7314 43.4744 18.9307 31.8897 19.5453V24.5239C31.8897 25.8789 30.7913 26.9773 29.4364 26.9773C28.0814 26.9773 26.983 25.8789 26.983 24.5239V19.5453C15.3984 18.9307 10.3462 13.7314 9.85032 1.96479ZM57.5126 32.5231C56.2344 30.7473 54.2668 29.6298 52.1079 29.4579C49.9612 29.2713 47.839 30.0621 46.3891 31.5185L41.7032 35.8215V39.2576C41.7032 43.3199 38.401 46.6257 34.3431 46.6257H22.0763V41.7136H34.3431C35.6974 41.7136 36.7965 40.6133 36.7965 39.2576V33.8894C36.7965 32.7848 35.901 31.8894 34.7965 31.8894H21.6151C14.4096 31.8894 7.63094 34.7016 2.53287 39.8028L2.36872 39.9673C0.877235 41.4619 0.0371031 43.4855 0.0314878 45.597L0.0014267 56.9007C-0.00151631 58.0073 0.894772 58.906 2.00142 58.906H27.7681C34.505 58.906 40.9598 56.4033 45.9426 51.862L56.5362 42.1975C59.1613 39.5621 59.5832 35.404 57.5126 32.5231Z"
      fill="#130B17"
    />
  </svg>
);

// Archetype icon for: Exhibitionist Performer
const SpotlightIcon = (props: IconProps) => (
  <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M34.9987 7.2915C39.0966 7.2915 42.7337 7.93025 44.9854 8.954C45.5949 9.23109 46.0908 9.52567 46.4233 9.85817C46.5429 9.97775 46.6654 10.074 46.6654 10.2082C46.6654 10.3423 46.5429 10.4386 46.4233 10.5582C46.0908 10.8907 45.5949 11.1853 44.9854 11.4623C42.7337 12.4861 39.0966 13.1248 34.9987 13.1248C30.9008 13.1248 27.2637 12.4861 25.012 11.4623C24.4024 11.1853 23.9066 10.8907 23.5741 10.5582C23.4545 10.4386 23.332 10.3423 23.332 10.2082C23.332 10.074 23.4545 9.97775 23.5741 9.85817C23.9066 9.52567 24.4024 9.23109 25.012 8.954C27.2637 7.93025 30.9008 7.2915 34.9987 7.2915Z"
      fill="#130B17"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M34.9987 48.125C43.4425 48.125 50.9354 49.4667 55.5787 51.5783C56.9845 52.2171 58.1104 52.9171 58.8774 53.6842C59.4316 54.2383 59.7904 54.8013 59.7904 55.4167C59.7904 56.0321 59.4316 56.595 58.8774 57.1492C58.1104 57.9163 56.9845 58.6163 55.5787 59.255C50.9354 61.3667 43.4425 62.7083 34.9987 62.7083C26.5549 62.7083 19.062 61.3667 14.4187 59.255C13.0129 58.6163 11.887 57.9163 11.1199 57.1492C10.5658 56.595 10.207 56.0321 10.207 55.4167C10.207 54.8013 10.5658 54.2383 11.1199 53.6842C11.887 52.9171 13.0129 52.2171 14.4187 51.5783C19.062 49.4667 26.5549 48.125 34.9987 48.125Z"
      fill="#130B17"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M16.4185 47.7434C14.7319 48.2825 12.862 46.6833 13.3557 44.9829L22.1174 14.8037C22.3196 14.1075 23.1858 13.7341 23.7891 14.1363C26.1253 15.6354 29.6362 16.0497 35.0554 16.0497C40.4746 16.0497 43.3278 16.0152 45.6641 14.516C46.5804 13.9051 47.8981 14.4755 48.2051 15.533L56.7552 44.9829C57.2489 46.6833 55.379 48.2825 53.6924 47.7434C48.8307 46.1897 42.2726 45.2164 35.0554 45.2164C27.8382 45.2164 21.2802 46.1897 16.4185 47.7434Z"
      fill="#130B17"
    />
  </svg>
);

// Archetype icon for: Explorer of Edges
const TargetIcon = (props: IconProps) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0_2663_316)">
      <path
        d="M30 60C46.4777 60 60 46.4777 60 30C60 21.7036 56.3912 13.7111 50.3024 8.07375C49.8955 7.69605 49.3377 7.52438 48.7935 7.6343C48.2493 7.73215 47.7824 8.0823 47.5352 8.57672L44.9495 13.7479C44.1792 15.2885 44.5165 17.1261 45.5422 18.5098C47.9251 21.7242 49.3359 25.7004 49.3359 30C49.3359 40.6618 40.6618 49.3359 30 49.3359C19.3382 49.3359 10.5469 40.6618 10.5469 30C10.5469 19.3382 19.3382 10.6641 30 10.6641C31.5263 10.6641 33.0097 10.845 34.4324 11.1846C37.168 11.8376 40.3244 10.3862 40.7869 7.61193L41.4104 3.87152C41.5495 3.03902 41.0757 2.22352 40.2809 1.93172C36.9935 0.72832 33.5345 0 30 0C13.5223 0 0 13.5223 0 30C0 46.4777 13.5223 60 30 60Z"
        fill="#130B17"
      />
      <path
        d="M37.8175 21.0255C38.3204 20.7732 38.6723 20.2977 38.765 19.7415L38.7837 19.6298C39.034 18.1277 38.4282 16.574 37.071 15.8834C34.9437 14.8008 32.5478 14.1797 30 14.1797C21.2762 14.1797 14.0625 21.2762 14.0625 30C14.0625 38.7238 21.2762 45.8203 30 45.8203C38.7238 45.8203 45.8203 38.7238 45.8203 30C45.8203 27.4822 45.2077 25.1186 44.1415 23.0168C43.2935 21.3452 41.0234 21.6004 40.1852 23.2768C39.7409 24.1653 38.8328 24.7266 37.8395 24.7266H33.5156C33.0487 24.7266 32.6024 24.912 32.2729 25.2416C32.0828 25.4316 31.7578 25.297 31.7578 25.0282V24.4021C31.7578 24.1896 31.8779 23.9953 32.068 23.9002L37.8175 21.0255Z"
        fill="#130B17"
      />
    </g>
    <defs>
      <clipPath id="clip0_2663_316">
        <rect width="60" height="60" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

// Archetype icon for: Curious Apprentice
const BookIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H18v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5Z" {...traitIconProps} />
    <path d="M19 3v16" {...traitIconProps} />
    <path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H18" {...traitIconProps} />
  </svg>
);

// Archetype icon for: Spiritual Lover
const LeafIcon = (props: IconProps) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M11.3906 3.75001C11.2674 3.74958 11.1453 3.77354 11.0314 3.8205C10.9174 3.86746 10.8139 3.9365 10.7268 4.02364C10.6396 4.11078 10.5706 4.2143 10.5236 4.32823C10.4767 4.44217 10.4527 4.56427 10.4531 4.68751V18.0844C10.4633 28.2018 14.4862 37.9021 21.6395 45.0571C28.7927 52.212 38.492 56.2374 48.6094 56.25C48.7326 56.2504 48.8547 56.2265 48.9687 56.1795C49.0826 56.1326 49.1861 56.0635 49.2732 55.9764C49.3604 55.8892 49.4294 55.7857 49.4764 55.6718C49.5233 55.5578 49.5473 55.4357 49.5469 55.3125V41.9156C49.5368 31.7982 45.5138 22.0979 38.3606 14.943C31.2073 7.78798 21.508 3.76262 11.3906 3.75001ZM42.0469 46.8563C42.0454 46.9989 42.0117 47.1394 41.9484 47.2672C41.885 47.395 41.7935 47.5068 41.6808 47.5942C41.5681 47.6817 41.4371 47.7425 41.2975 47.7722C41.158 47.8019 41.0135 47.7997 40.875 47.7656C34.31 46.0493 28.4992 42.2051 24.3517 36.8345C20.2042 31.464 17.954 24.87 17.9531 18.0844V13.1438C17.9524 13.0004 17.9851 12.8588 18.0485 12.7303C18.112 12.6017 18.2045 12.4897 18.3188 12.4031C18.4319 12.3164 18.5631 12.2562 18.7027 12.227C18.8422 12.1978 18.9866 12.2003 19.125 12.2344C25.69 13.9507 31.5008 17.7949 35.6483 23.1655C39.7959 28.536 42.0461 35.13 42.0469 41.9156V46.8563Z"
      fill="#130B17"
    />
    <path
      d="M19.8275 14.3813C18.7406 28.4993 26.4925 41.402 40.1714 45.6188C41.2581 31.5009 33.5062 18.5981 19.8275 14.3813Z"
      fill="#130B17"
    />
  </svg>
);

// Archetype icon for: Minimalist Companion
const DotsIcon = (props: IconProps) => (
  <svg width="17" height="60" viewBox="0 0 17 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8.13084" cy="8.13084" r="8.13084" fill="#130B17" />
    <circle cx="8.13084" cy="30" r="8.13084" fill="#130B17" />
    <circle cx="8.13084" cy="51.8691" r="8.13084" fill="#130B17" />
  </svg>
);

// Archetype icon for: Emotional Voyeur
const MirrorIcon = (props: IconProps) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0_2673_851)">
      <path
        d="M30 7.14844C30.9716 7.14844 31.7578 6.36223 31.7578 5.39062V1.75781C31.7578 0.786211 30.9716 0 30 0C29.0284 0 28.2422 0.786211 28.2422 1.75781V5.39062C28.2422 6.36223 29.0284 7.14844 30 7.14844Z"
        fill="#130B17"
      />
      <path
        d="M28.2422 15.9375C28.2422 16.9091 29.0284 17.6953 30 17.6953C30.9716 17.6953 31.7578 16.9091 31.7578 15.9375V12.4219C31.7578 11.4503 30.9716 10.6641 30 10.6641C29.0284 10.6641 28.2422 11.4503 28.2422 12.4219V15.9375Z"
        fill="#130B17"
      />
      <path
        d="M28.2422 26.4844C28.2422 27.456 29.0284 28.2422 30 28.2422C30.9716 28.2422 31.7578 27.456 31.7578 26.4844V22.9688C31.7578 21.9971 30.9716 21.2109 30 21.2109C29.0284 21.2109 28.2422 21.9971 28.2422 22.9688V26.4844Z"
        fill="#130B17"
      />
      <path
        d="M28.2422 37.0312C28.2422 38.0029 29.0284 38.7891 30 38.7891C30.9716 38.7891 31.7578 38.0029 31.7578 37.0312V33.5156C31.7578 32.544 30.9716 31.7578 30 31.7578C29.0284 31.7578 28.2422 32.544 28.2422 33.5156V37.0312Z"
        fill="#130B17"
      />
      <path
        d="M28.2422 47.5781C28.2422 48.5497 29.0284 49.3359 30 49.3359C30.9716 49.3359 31.7578 48.5497 31.7578 47.5781V44.0625C31.7578 43.0909 30.9716 42.3047 30 42.3047C29.0284 42.3047 28.2422 43.0909 28.2422 44.0625V47.5781Z"
        fill="#130B17"
      />
      <path
        d="M28.2422 58.2422C28.2422 59.2138 29.0284 60 30 60C30.9716 60 31.7578 59.2138 31.7578 58.2422V54.6094C31.7578 53.6378 30.9716 52.8516 30 52.8516C29.0284 52.8516 28.2422 53.6378 28.2422 54.6094V58.2422Z"
        fill="#130B17"
      />
      <path
        d="M1.01285 49.1694C1.63195 49.461 2.36121 49.3628 2.88398 48.9291L24.0949 31.3509C24.4948 31.0162 24.7266 30.5218 24.7266 30C24.7266 29.4781 24.4948 28.9837 24.0948 28.649L2.88387 11.0709C2.35687 10.6349 1.62902 10.5405 1.01273 10.8306C0.394805 11.119 0 11.7404 0 12.4219V47.5781C0 48.2596 0.394805 48.881 1.01285 49.1694Z"
        fill="#130B17"
      />
      <path
        d="M58.9871 10.8306C58.3778 10.5422 57.643 10.6349 57.116 11.0709L35.9051 28.6491C35.5052 28.9838 35.2734 29.4782 35.2734 30C35.2734 30.5218 35.5052 31.0163 35.9052 31.3509L57.1161 48.9291C57.6449 49.3677 58.3753 49.4576 58.9873 49.1694C59.6052 48.881 60 48.2596 60 47.5781V12.4219C60 11.7404 59.6052 11.119 58.9871 10.8306Z"
        fill="#130B17"
      />
    </g>
    <defs>
      <clipPath id="clip0_2673_851">
        <rect width="60" height="60" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

// Archetype icon for: Power Orchestrator
const GridIcon = (props: IconProps) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M6.2533 1.51417C3.65893 1.51417 1.50002 3.67322 1.50002 6.26759V15.7468C1.49509 17.0582 2.55414 18.1255 3.8657 18.1304H3.88378H15.7511C17.0627 18.1355 18.1299 17.0764 18.1349 15.7648C18.1349 15.7588 18.1349 15.7528 18.1349 15.7468V3.88396C18.1321 2.57254 17.0668 1.51143 15.7555 1.51417C15.7538 1.51417 15.7525 1.51417 15.7511 1.51417H6.2533Z"
      fill="#130B17"
    />
    <path
      d="M3.88076 21.6919C2.57489 21.6971 1.5183 22.7558 1.51562 24.0617V35.9431C1.52083 37.2471 2.57673 38.303 3.88076 38.3082H15.7668C17.0708 38.303 18.1267 37.2471 18.1319 35.9431V24.0617C18.1293 22.7558 17.0727 21.6971 15.7668 21.6919H3.88076Z"
      fill="#130B17"
    />
    <path
      d="M24.0713 1.50002C22.7598 1.49495 21.6926 2.55407 21.6875 3.8655V3.88378V15.7512C21.6825 17.0627 22.7417 18.1298 24.0531 18.1348H24.0713H35.9387C37.25 18.1295 38.3088 17.0625 38.3038 15.7512V3.88378C38.3089 2.57242 37.25 1.50529 35.9387 1.50002H24.0713Z"
      fill="#130B17"
    />
    <path
      d="M24.0713 21.6919C22.7598 21.6868 21.6926 22.746 21.6875 24.0575V24.0617V35.9431C21.6928 37.2544 22.7599 38.3133 24.0713 38.3082H35.9387C37.2427 38.303 38.2986 37.2471 38.3038 35.9431V24.0617C38.3011 22.7558 37.2445 21.6971 35.9387 21.6919H24.0713Z"
      fill="#130B17"
    />
    <path
      d="M24.0713 41.8696C22.7598 41.8646 21.6926 42.9237 21.6875 44.2351V44.2533V56.1161C21.6825 57.4276 22.7416 58.4948 24.053 58.4998H24.0713H35.9387C37.25 58.4946 38.3089 57.4274 38.3038 56.1161V44.2533C38.3088 42.9421 37.25 41.8749 35.9387 41.8696H24.0713Z"
      fill="#130B17"
    />
    <path
      d="M44.2487 1.5C42.9372 1.50274 41.8762 2.56809 41.8789 3.87959V3.88376V15.7512C41.874 17.0627 42.9331 18.1298 44.2446 18.1348H44.2487H56.1115C57.423 18.1398 58.4902 17.0806 58.4952 15.7692C58.4952 15.7631 58.4952 15.7572 58.4952 15.7512V6.25349C58.4951 3.65892 56.3409 1.5 53.7464 1.5L44.2487 1.5Z"
      fill="#130B17"
    />
    <path
      d="M44.2486 21.6919C42.941 21.6946 41.8816 22.754 41.8789 24.0617V35.9431C41.8841 37.2489 42.9428 38.3055 44.2486 38.3082H56.1115C57.4228 38.3132 58.4899 37.2543 58.4951 35.9431V24.0617C58.4925 22.7502 57.4271 21.6892 56.1156 21.6919C56.1142 21.6919 56.1129 21.6919 56.1115 21.6919H44.2486Z"
      fill="#130B17"
    />
    <path
      d="M44.2549 41.8838C42.9436 41.8787 41.8763 42.9377 41.8711 44.2489V56.1118C41.8635 57.4232 42.9206 58.4925 44.2319 58.5002H44.2549H53.7527C56.3473 58.5002 58.5016 56.3414 58.5016 53.7466V44.2489C58.4964 42.9377 57.4291 41.8787 56.1178 41.8838H44.2549Z"
      fill="#130B17"
    />
    <path
      d="M3.88078 41.8696C2.56949 41.8749 1.51064 42.942 1.51564 44.2533V53.7509C1.51564 56.3455 3.66997 58.4998 6.26448 58.4998H15.7668C17.0782 58.4946 18.137 57.4274 18.1319 56.1161V44.2533C18.1369 42.942 17.0781 41.8749 15.7668 41.8696H3.88078Z"
      fill="#130B17"
    />
  </svg>
);

// Archetype icon for: Loyal Ritualist
const RepeatIcon = (props: IconProps) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M25.5674 55.5675C24.784 55.5675 24.0476 55.2625 23.4936 54.7084L16.8471 48.0618C16.2932 47.5079 15.9881 46.7715 15.9881 45.9881C15.9881 45.2047 16.2932 44.4683 16.8472 43.9144L23.4937 37.268C24.0476 36.7141 24.784 36.4091 25.5674 36.4091C26.3507 36.4091 27.0872 36.7141 27.641 37.2681C28.7844 38.4116 28.7844 40.2721 27.6409 41.4152L26.0007 43.0555H41.0824C48.2796 43.0555 54.1349 37.1988 54.1349 30C54.1349 26.702 52.8866 23.5475 50.6198 21.1178C49.517 19.9355 49.5816 18.0761 50.7637 16.973C51.3089 16.4646 52.0192 16.1848 52.7639 16.1848C53.5744 16.1848 54.3562 16.5245 54.9088 17.1171C58.1918 20.6367 60 25.212 60 30.0001C60 40.433 51.5136 48.9209 41.0824 48.9209H26.0005L27.641 50.5614C28.7844 51.7045 28.7844 53.565 27.641 54.7085C27.0872 55.2625 26.3509 55.5675 25.5674 55.5675ZM7.23621 43.8185C6.42562 43.8185 5.64387 43.4788 5.09121 42.8863C1.8082 39.3668 0 34.7904 0 30.0001C0 19.5689 8.48777 11.0825 18.9209 11.0825H34.0027L32.359 9.43887C31.2156 8.2957 31.2156 6.43523 32.359 5.29172C32.9128 4.73777 33.6492 4.43262 34.4326 4.43262C35.216 4.43262 35.9524 4.73766 36.5064 5.29172L43.1561 11.9414C43.71 12.4954 44.015 13.2319 44.015 14.0153C44.0148 14.7991 43.7097 15.5357 43.1555 16.0893L36.5058 22.7358C35.9518 23.2893 35.2155 23.5941 34.4326 23.5941C33.649 23.5941 32.9123 23.2889 32.3585 22.7346C31.8048 22.1807 31.5 21.4443 31.5001 20.6607C31.5004 19.8775 31.8055 19.1411 32.3597 18.5873L34.0002 16.9474H18.9209C11.7219 16.9474 5.86523 22.8028 5.86523 29.9999C5.86523 33.3 7.11351 36.4556 9.38027 38.8854C9.91453 39.458 10.1939 40.2047 10.1667 40.9875C10.1394 41.7704 9.80895 42.4957 9.23625 43.0301C8.69121 43.5386 7.98105 43.8185 7.23621 43.8185Z"
      fill="#130B17"
    />
  </svg>
);

// Archetype icon for: Approval Seeker
const ThumbsUpIcon = (props: IconProps) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10.625 20H4.375C1.9625 20 0 21.9625 0 24.375V53.125C0 55.5375 1.9625 57.5 4.375 57.5H10.625C13.0375 57.5 15 55.5375 15 53.125V24.375C15 21.9625 13.0375 20 10.625 20Z"
      fill="#130B17"
    />
    <path
      d="M50.0025 21.875H38.2025C38.2025 21.875 40.0775 18.125 40.0775 11.875C40.0775 4.375 34.4525 1.875 31.9525 1.875C29.4525 1.875 28.2025 3.125 28.2025 9.375C28.2025 15.315 22.45 20.095 18.75 22.5575V53.5275C22.7525 55.38 30.765 58.125 43.2025 58.125H47.2025C52.0775 58.125 56.2275 54.625 57.0525 49.825L59.8525 33.575C60.9025 27.45 56.2025 21.875 50.0025 21.875Z"
      fill="#130B17"
    />
  </svg>
);

// Archetype icon for: Analytical Sexualist
const MoleculeIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <circle cx="12" cy="5" r="2" {...traitIconProps} />
    <circle cx="6" cy="10" r="2" {...traitIconProps} />
    <circle cx="18" cy="10" r="2" {...traitIconProps} />
    <circle cx="8" cy="18" r="2" {...traitIconProps} />
    <circle cx="16" cy="18" r="2" {...traitIconProps} />
    <path d="M10.4 6.3 7.6 8.7" {...traitIconProps} />
    <path d="m13.6 6.3 2.8 2.4" {...traitIconProps} />
    <path d="m7 12 1 4" {...traitIconProps} />
    <path d="m17 12-1 4" {...traitIconProps} />
    <path d="M8.8 17h6.4" {...traitIconProps} />
    <path d="M8 10h8" {...traitIconProps} />
  </svg>
);

// Archetype icon for: Quiet Withdrawer
const FadeIcon = (props: IconProps) => (
  <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0_2673_811)">
      <path
        d="M51.3824 8.95722C51.8249 9.40688 52.0588 10.0175 52.0588 10.6484V49.3513C52.0588 49.9822 51.8249 50.5929 51.3823 51.0426C49.9419 52.5061 47.647 51.3797 47.647 49.3262V10.6736C47.647 8.6201 49.9419 7.49369 51.3824 8.95722ZM55.5882 28.498C55.5882 24.462 59.6044 23.6584 59.9118 27.6826C59.9703 28.4474 60 29.2202 60 29.9999C60 30.7797 59.9703 31.5525 59.9118 32.3173C59.6044 36.3415 55.5882 35.5378 55.5882 31.5019V28.498ZM31.7647 2.57254C31.7647 1.20422 32.9325 0.110166 34.287 0.30398C35.4019 0.463508 36.1765 1.44323 36.1765 2.5695V57.4305C36.1765 58.5568 35.4019 59.5365 34.287 59.696C32.9325 59.8898 31.7647 58.7958 31.7647 57.4274V2.57254ZM24.034 0.593188C26.2888 0.138234 28.2353 1.98956 28.2353 4.28976V55.7102C28.2353 58.0104 26.2888 59.8617 24.034 59.4068C10.3237 56.6402 0 44.5256 0 29.9999C0 15.4742 10.3237 3.3596 24.034 0.593188ZM39.7059 4.97556C39.7059 3.32272 41.3395 2.16754 42.8331 2.87543C43.6369 3.2564 44.1177 4.07804 44.1177 4.96755V55.0322C44.1177 55.9217 43.6369 56.7434 42.8331 57.1243C41.3395 57.8322 39.7059 56.677 39.7059 55.0242V4.97556Z"
        fill="black"
      />
    </g>
    <defs>
      <clipPath id="clip0_2673_811">
        <rect width="60" height="60" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

const MESSAGE_ICON = (props: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 1C3.58125 1 0 3.90937 0 7.5C0 9.05 0.66875 10.4688 1.78125 11.5844C1.39062 13.1594 0.084375 14.5625 0.06875 14.5781C0 14.65 -0.01875 14.7562 0.021875 14.85C0.0625 14.9437 0.15 15 0.25 15C2.32188 15 3.875 14.0062 4.64375 13.3937C5.66563 13.7781 6.8 14 8 14C12.4187 14 16 11.0906 16 7.5C16 3.90937 12.4187 1 8 1Z"
      fill="#FF6A3D"
    />
  </svg>
);

const BOLT_ICON = (props: IconProps) => (
  <svg width="9" height="14" viewBox="0 0 9 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0_4474_4051)">
      <path
        d="M8.3253 4.69995H5.07967L6.2778 1.04933C6.3903 0.621826 6.06686 0.199951 5.6253 0.199951H1.5753C1.2378 0.199951 0.950922 0.450264 0.905923 0.784951L0.0059225 7.53495C-0.047515 7.93995 0.267485 8.29995 0.675297 8.29995H4.01373L2.71717 13.7703C2.61592 14.1978 2.94217 14.6 3.37248 14.6C3.60873 14.6 3.83373 14.4762 3.95748 14.2625L8.90749 5.71245C9.16905 5.26526 8.84561 4.69995 8.3253 4.69995Z"
        fill="#FF6A3D"
      />
    </g>
    <defs>
      <clipPath id="clip0_4474_4051">
        <rect width="9" height="14" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

const CROWN_ICON = (props: IconProps) => (
  <svg width="18" height="15" viewBox="0 0 18 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.85 12.6H3.15C2.9025 12.6 2.7 12.8025 2.7 13.05V13.95C2.7 14.1975 2.9025 14.4 3.15 14.4H14.85C15.0975 14.4 15.3 14.1975 15.3 13.95V13.05C15.3 12.8025 15.0975 12.6 14.85 12.6ZM16.65 3.6C15.9047 3.6 15.3 4.20469 15.3 4.95C15.3 5.14969 15.345 5.33531 15.4237 5.50688L13.3875 6.7275C12.9544 6.98625 12.3947 6.84 12.1444 6.40125L9.85219 2.39062C10.1531 2.14312 10.35 1.77187 10.35 1.35C10.35 0.604688 9.74531 0 9 0C8.25469 0 7.65 0.604688 7.65 1.35C7.65 1.77187 7.84688 2.14312 8.14781 2.39062L5.85562 6.40125C5.60531 6.84 5.04281 6.98625 4.6125 6.7275L2.57906 5.50688C2.655 5.33812 2.70281 5.14969 2.70281 4.95C2.70281 4.20469 2.09812 3.6 1.35281 3.6C0.6075 3.6 0 4.20469 0 4.95C0 5.69531 0.604688 6.3 1.35 6.3C1.42312 6.3 1.49625 6.28875 1.56656 6.2775L3.6 11.7H14.4L16.4334 6.2775C16.5037 6.28875 16.5769 6.3 16.65 6.3C17.3953 6.3 18 5.69531 18 4.95C18 4.20469 17.3953 3.6 16.65 3.6Z"
      fill="#FF6A3D"
    />
  </svg>
);

export const TraitIcons = {
  communication: MESSAGE_ICON,
  initiation: BOLT_ICON,
  attachment: HeartIcon,
  powerOrientation: CROWN_ICON,
} as const;

function hexToRgbTriplet(hex: string) {
  const clean = hex.replace("#", "");
  const normalized =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : clean;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `${red} ${green} ${blue}`;
}

function makeTheme(theme: Omit<ReportTheme, "accentRgb" | "iconBackgroundRgb">): ReportTheme {
  return {
    ...theme,
    accentRgb: hexToRgbTriplet(theme.accent),
    iconBackgroundRgb: hexToRgbTriplet(theme.iconBackground),
  };
}

export const reportThemes: Record<string, ReportTheme> = {
  "Sensual Connector": makeTheme({
    archetype: "Sensual Connector",
    accent: "#EB7A84",
    iconBackground: "#E97C84",
    motto: '"Touch me with presence and meet me with heart."',
    motivation: "Intimacy & bonding",
    communication: "Authentic",
    initiation: "Responsive",
    attachment: "Secure",
    powerOrientation: "Switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: HeartIcon,
  }),
  "Spark Seeker": makeTheme({
    archetype: "Spark Seeker",
    accent: "#FF6A3D",
    iconBackground: "#FF6A3D",
    motto: '"Let\'s find the spark\u2014then turn it into a blaze."',
    motivation: "Pleasure & play",
    communication: "Charming",
    initiation: "Active",
    attachment: "Avoidant/secure",
    powerOrientation: "Switch",
    riskOrientation: "High",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    Icon: SparklesIcon,
  }),
  "Relational Nurturer": makeTheme({
    archetype: "Relational Nurturer",
    accent: "#8EB9AA",
    iconBackground: "#8EB9AA",
    motto: '"Your comfort and pleasure matter\u2014so do mine."',
    motivation: "Healing",
    communication: "Gentle",
    initiation: "Responsive",
    attachment: "Secure",
    powerOrientation: "Submissive/switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: SproutIcon,
  }),
  "Exhibitionist Performer": makeTheme({
    archetype: "Exhibitionist Performer",
    accent: "#E5B85A",
    iconBackground: "#E5B85A",
    motto: '"Watch me shine."',
    motivation: "Validation",
    communication: "Expressive",
    initiation: "Active",
    attachment: "Mixed",
    powerOrientation: "Switch",
    riskOrientation: "High",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    Icon: SpotlightIcon,
  }),
  "Explorer of Edges": makeTheme({
    archetype: "Explorer of Edges",
    accent: "#FF3D76",
    iconBackground: "#FF3D76",
    motto: '"Let\'s find the edge\u2014and keep going."',
    motivation: "Intensity & transformation",
    communication: "Honest",
    initiation: "Active",
    attachment: "Disorganized",
    powerOrientation: "Dominant/Switch",
    riskOrientation: "Very high",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    Icon: TargetIcon,
  }),
  "Curious Apprentice": makeTheme({
    archetype: "Curious Apprentice",
    accent: "#78B7E8",
    iconBackground: "#78B7E8",
    motto: '"Teach me everything."',
    motivation: "Growth",
    communication: "Open",
    initiation: "Shared",
    attachment: "Secure",
    powerOrientation: "Switch",
    riskOrientation: "Moderate",
    riskSegments: 2,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: BookIcon,
  }),
  "Spiritual Lover": makeTheme({
    archetype: "Spiritual Lover",
    accent: "#9D8AD7",
    iconBackground: "#9D8AD7",
    motto: '"Make love to my soul."',
    motivation: "Meaning",
    communication: "Deep",
    initiation: "Responsive",
    attachment: "Secure",
    powerOrientation: "Switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: LeafIcon,
  }),
  "Minimalist Companion": makeTheme({
    archetype: "Minimalist Companion",
    accent: "#BDB9B4",
    iconBackground: "#BDB9B4",
    motto: '"Simple is enough."',
    motivation: "Connection",
    communication: "Calm",
    initiation: "Passive",
    attachment: "Avoidant",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Low",
    confidenceSegments: 1,
    Icon: DotsIcon,
  }),
  "Emotional Voyeur": makeTheme({
    archetype: "Emotional Voyeur",
    accent: "#34EAE4",
    iconBackground: "#34EAE4",
    motto: '"I feel more from observing."',
    motivation: "Emotional fantasy",
    communication: "Reserved",
    initiation: "Passive",
    attachment: "Avoidant",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Low",
    confidenceSegments: 1,
    Icon: MirrorIcon,
  }),
  "Power Orchestrator": makeTheme({
    archetype: "Power Orchestrator",
    accent: "#F3A62A",
    iconBackground: "#F3A62A",
    motto: '"I set the frame\u2014and we play inside it."',
    motivation: "Power",
    communication: "Commanding",
    initiation: "Active",
    attachment: "Disorganized",
    powerOrientation: "Dominant",
    riskOrientation: "High",
    riskSegments: 3,
    confidence: "High",
    confidenceSegments: 3,
    Icon: GridIcon,
  }),
  "Loyal Ritualist": makeTheme({
    archetype: "Loyal Ritualist",
    accent: "#2AFD96",
    iconBackground: "#2AFD96",
    motto: '"Routine is intimacy."',
    motivation: "Stability",
    communication: "Consistent",
    initiation: "Shared",
    attachment: "Secure",
    powerOrientation: "Switch",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: RepeatIcon,
  }),
  "Approval Seeker": makeTheme({
    archetype: "Approval Seeker",
    accent: "#E7B6C8",
    iconBackground: "#E2AEC2",
    motto: '"Tell me I\'m enough."',
    motivation: "Validation",
    communication: "Adaptive",
    initiation: "Responsive",
    attachment: "Anxious",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Low",
    confidenceSegments: 1,
    Icon: ThumbsUpIcon,
  }),
  "Analytical Sexualist": makeTheme({
    archetype: "Analytical Sexualist",
    accent: "#7A17FF",
    iconBackground: "#7A17FF",
    motto: '"Explain the system."',
    motivation: "Mastery",
    communication: "Precise",
    initiation: "Shared",
    attachment: "Avoidant",
    powerOrientation: "Switch",
    riskOrientation: "Moderate",
    riskSegments: 2,
    confidence: "Moderate",
    confidenceSegments: 2,
    Icon: MoleculeIcon,
  }),
  "Quiet Withdrawer": makeTheme({
    archetype: "Quiet Withdrawer",
    accent: "#C7F3F1",
    iconBackground: "#C7F3F1",
    motto: '"I disappear to survive."',
    motivation: "Avoidance",
    communication: "Reserved",
    initiation: "None",
    attachment: "Avoidant",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    riskSegments: 1,
    confidence: "Low",
    confidenceSegments: 1,
    Icon: FadeIcon,
  }),
};

const fallbackTheme = reportThemes["Spark Seeker"];

export function getReportTheme(archetype: string) {
  return reportThemes[archetype] ?? fallbackTheme;
}

export function getReportThemeStyle(theme: ReportTheme): CSSProperties {
  return {
    ["--report-accent" as string]: theme.accent,
    ["--report-accent-rgb" as string]: theme.accentRgb,
    ["--report-icon-bg" as string]: theme.iconBackground,
    ["--report-icon-bg-rgb" as string]: theme.iconBackgroundRgb,
  };
}
