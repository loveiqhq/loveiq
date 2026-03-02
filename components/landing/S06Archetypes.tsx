"use client";

import { useRef, useState, useEffect, useCallback, useId, type FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@/lib/analytics";

interface Archetype {
  name: string;
  tagline: string;
  color: string;
  icon: React.ReactNode;
  coreMotivation: string;
  communication: string;
  attachment: string;
  initiation: string;
  powerOrientation: string;
  riskOrientation: "Low" | "Moderate" | "High" | "Very high";
  typicalConfidence: "Low" | "Moderate" | "High";
}

const archetypes: Archetype[] = [
  {
    name: "Spark Seeker",
    tagline: '"Let\'s find the spark—then turn it into a blaze."',
    color: "#ff6a3d",
    icon: (
      <svg
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <path
          d="M47.8354 28.9232C47.8354 27.9832 47.3079 27.1207 46.4679 26.6932C44.3179 25.5982 42.0154 24.5907 39.4354 23.6107C35.1704 21.9757 32.0629 18.8207 30.4479 14.4982C29.4804 11.8757 28.4854 9.5407 27.4079 7.3607C26.9854 6.5107 26.1154 5.9707 25.1679 5.9707C24.2204 5.9707 23.3454 6.5107 22.9279 7.3632C21.8529 9.5357 20.8604 11.8707 19.8929 14.4882C18.2779 18.8182 15.1679 21.9732 10.9104 23.6057C8.31543 24.5932 6.01043 25.6007 3.86793 26.6932C3.03043 27.1182 2.50293 27.9807 2.50293 28.9207C2.50293 29.8607 3.03043 30.7232 3.87043 31.1507C6.02543 32.2457 8.32793 33.2557 10.9029 34.2307C15.1679 35.8657 18.2754 39.0207 19.8904 43.3457C20.8629 45.9782 21.8554 48.3082 22.9279 50.4807C23.3504 51.3332 24.2179 51.8732 25.1679 51.8732C26.1179 51.8732 26.9879 51.3332 27.4079 50.4807C28.4854 48.3082 29.4779 45.9732 30.4429 43.3532C32.0604 39.0232 35.1729 35.8682 39.4254 34.2357C42.0104 33.2557 44.3129 32.2482 46.4679 31.1532C47.3079 30.7257 47.8354 29.8657 47.8354 28.9232Z"
          fill="currentColor"
        />
        <path
          d="M42.7401 16.3541C43.3776 16.6791 44.0051 16.9466 44.6226 17.1816C45.1401 17.3816 45.5026 17.7516 45.6976 18.2691C45.9276 18.9016 46.1901 19.5316 46.5076 20.1766C46.9251 21.0316 47.7951 21.5766 48.7476 21.5766H48.7526C49.7026 21.5766 50.5726 21.0366 50.9926 20.1841C51.3101 19.5416 51.5701 18.9091 51.8026 18.2816C52.0026 17.7516 52.3651 17.3816 52.8726 17.1866C53.5001 16.9491 54.1251 16.6816 54.7626 16.3566C55.6026 15.9316 56.1301 15.0666 56.1301 14.1266C56.1301 13.1866 55.6001 12.3241 54.7601 11.8991C54.1251 11.5791 53.5001 11.3116 52.8801 11.0741C52.3651 10.8766 52.0026 10.5066 51.8051 9.98164C51.5701 9.34914 51.3101 8.71664 50.9901 8.07164C50.5701 7.22164 49.7001 6.68164 48.7501 6.68164H48.7451C47.7926 6.68164 46.9251 7.22414 46.5051 8.07914C46.1901 8.72164 45.9276 9.35414 45.7001 9.97414C45.5001 10.5041 45.1376 10.8741 44.6301 11.0691C44.0001 11.3091 43.3751 11.5741 42.7376 11.8991C41.8976 12.3241 41.3701 13.1866 41.3701 14.1266C41.3701 15.0666 41.8976 15.9291 42.7376 16.3541H42.7401Z"
          fill="currentColor"
        />
        <path
          d="M56.1328 42.9616C55.3403 42.5591 54.5578 42.2241 53.7878 41.9341C52.9403 41.6091 52.3228 40.9791 52.0053 40.1241C51.7128 39.3341 51.3853 38.5441 50.9903 37.7441C50.5678 36.8916 49.6978 36.3516 48.7503 36.3516C47.7978 36.3516 46.9278 36.8941 46.5103 37.7491C46.1178 38.5491 45.7903 39.3366 45.5053 40.1116C45.1803 40.9791 44.5628 41.6091 43.7278 41.9291C42.9478 42.2241 42.1628 42.5591 41.3728 42.9641C40.5353 43.3916 40.0078 44.2516 40.0078 45.1916C40.0078 46.1316 40.5353 46.9916 41.3728 47.4191C42.1628 47.8216 42.9428 48.1541 43.7203 48.4516C44.5628 48.7741 45.1803 49.4016 45.5003 50.2591C45.7903 51.0466 46.1178 51.8366 46.5128 52.6341C46.9328 53.4866 47.8003 54.0266 48.7528 54.0291C49.7028 54.0291 50.5703 53.4916 50.9928 52.6391C51.3903 51.8391 51.7178 51.0491 52.0078 50.2666C52.3278 49.4016 52.9453 48.7741 53.7878 48.4516C54.5678 48.1541 55.3453 47.8241 56.1353 47.4216C56.9753 46.9941 57.5028 46.1316 57.5028 45.1916C57.5028 44.2516 56.9753 43.3891 56.1353 42.9616H56.1328Z"
          fill="currentColor"
        />
      </svg>
    ),
    coreMotivation: "Pleasure & play",
    communication: "Charming",
    attachment: "Avoidant/secure",
    initiation: "Active",
    powerOrientation: "Switch",
    riskOrientation: "High",
    typicalConfidence: "High",
  },
  {
    name: "Sensual Connector",
    tagline: '"Touch me with presence and meet me with heart."',
    color: "#e57373",
    icon: (
      <svg
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <g clipPath="url(#clip0_sensual)">
          <path
            d="M41.8225 44.5775C43.2875 46.0425 43.2875 48.4175 41.8225 49.88C40.3575 51.345 37.9825 51.345 36.52 49.88L24.935 38.295C23.9575 37.3175 22.375 37.3175 21.4 38.295C20.4225 39.2725 20.4225 40.855 21.4 41.83L31.9275 52.3575C33.3925 53.8225 33.3925 56.1975 31.9275 57.66C30.4625 59.125 28.0875 59.125 26.625 57.66L14.9425 45.9775C7.5525 38.7675 0 29.155 0 20C0 10.35 7.29 2.5 16.25 2.5C20.6825 2.5 24.0775 4.155 26.6625 5.9925L17.565 15.0125C15.91 16.665 15 18.865 15 21.2025C15 23.54 15.91 25.7375 17.56 27.3875C19.2125 29.0425 21.41 29.9525 23.75 29.9525C24.815 29.9525 25.8425 29.74 26.8125 29.38L41.825 44.58L41.8225 44.5775ZM36.0525 21.3125L30.8225 26.5075L46.0975 41.5525C47.5625 43.0175 49.9375 43.0175 51.4 41.5525C53.64 39.3125 51.7225 36.8325 51.7225 36.8325L36.0525 21.3125ZM43.6425 2.645C39.5575 2.67 35.6775 4.445 32.6875 7.23L21.095 18.745C19.63 20.21 19.63 22.585 21.095 24.0475C22.56 25.5125 24.935 25.5125 26.3975 24.0475L32.64 17.8475C34.59 15.91 37.735 15.91 39.6875 17.8475L55.4975 33.5425C58.475 28.7375 59.995 24.2375 59.995 20.145C59.995 10.495 52.6 2.645 43.64 2.645H43.6425Z"
            fill="currentColor"
          />
        </g>
        <defs>
          <clipPath id="clip0_sensual">
            <rect width="60" height="60" fill="white" />
          </clipPath>
        </defs>
      </svg>
    ),
    coreMotivation: "Intimacy & bonding",
    communication: "Authentic",
    attachment: "Anxious",
    initiation: "Responsive",
    powerOrientation: "Switch",
    riskOrientation: "Low",
    typicalConfidence: "Moderate",
  },
  {
    name: "Power Orchestrator",
    tagline: '"I set the frame—and we play inside it."',
    color: "#ff9f1c",
    icon: (
      <svg
        viewBox="0 0 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Row 1 */}
        {/* Top-left corner */}
        <path
          transform="translate(6, 6)"
          d="M4.7533 0C2.15893 0 0 2.15906 0 4.75343V14.2326C-0.00491 15.544 1.05414 16.6113 2.3657 16.6162H2.38378H14.2511C15.5627 16.6213 16.6299 15.5622 16.6349 14.2507C16.6349 14.2447 16.6349 14.2386 16.6349 14.2326V2.3698C16.6321 1.05838 15.5668 -0.00273 14.2555 0C14.2538 0 14.2525 0 14.2511 0H4.7533Z"
          fill="currentColor"
        />
        {/* Top-middle */}
        <path
          transform="translate(27.68, 6)"
          d="M2.38376 0C1.07227 -0.005 0.00507 1.05407 0 2.36557V2.36981V14.2512C0.00527 15.5625 1.07241 16.6214 2.38376 16.6163H14.2512C15.5552 16.6111 16.6111 15.5552 16.6163 14.2512V2.36981C16.6136 1.06393 15.557 0.00522 14.2512 0H2.38376Z"
          fill="currentColor"
        />
        {/* Top-right corner */}
        <path
          transform="translate(49.36, 6)"
          d="M2.36975 0C1.05825 0.0027387 -0.0027203 1.06809 0 2.37959V2.38376V14.2512C-0.004913 15.5627 1.05421 16.6298 2.3657 16.6348H2.36975H14.2326C15.5441 16.6398 16.6112 15.5806 16.6162 14.2692C16.6162 14.2631 16.6162 14.2572 16.6162 14.2512V4.75349C16.6162 2.15892 14.462 0 11.8675 0L2.36975 0Z"
          fill="currentColor"
        />
        {/* Row 2 */}
        {/* Middle-left */}
        <path
          transform="translate(6, 27.68)"
          d="M2.38376 0C1.07227 -0.005 0.00507 1.05407 0 2.36557V2.36981V14.2512C0.00527 15.5625 1.07241 16.6214 2.38376 16.6163H14.2512C15.5552 16.6111 16.6111 15.5552 16.6163 14.2512V2.36981C16.6136 1.06393 15.557 0.00522 14.2512 0H2.38376Z"
          fill="currentColor"
        />
        {/* Center */}
        <path
          transform="translate(27.68, 27.68)"
          d="M2.38376 0C1.07227 -0.005 0.00507 1.05407 0 2.36557V2.36981V14.2512C0.00527 15.5625 1.07241 16.6214 2.38376 16.6163H14.2512C15.5552 16.6111 16.6111 15.5552 16.6163 14.2512V2.36981C16.6136 1.06393 15.557 0.00522 14.2512 0H2.38376Z"
          fill="currentColor"
        />
        {/* Middle-right */}
        <path
          transform="translate(49.36, 27.68)"
          d="M2.38376 0C1.07227 -0.005 0.00507 1.05407 0 2.36557V2.36981V14.2512C0.00527 15.5625 1.07241 16.6214 2.38376 16.6163H14.2512C15.5552 16.6111 16.6111 15.5552 16.6163 14.2512V2.36981C16.6136 1.06393 15.557 0.00522 14.2512 0H2.38376Z"
          fill="currentColor"
        />
        {/* Row 3 */}
        {/* Bottom-left corner */}
        <path
          transform="translate(6, 49.36)"
          d="M2.36516 0C1.05387 0.00527346 -0.00498044 1.07241 0 2.38369V11.8813C0 14.4759 2.15435 16.6302 4.74885 16.6302H14.2512C15.5625 16.6249 16.6214 15.5578 16.6163 14.2464V2.38369C16.6213 1.07241 15.5625 0.00527346 14.2512 0H2.36516Z"
          fill="currentColor"
        />
        {/* Bottom-middle */}
        <path
          transform="translate(27.68, 49.36)"
          d="M2.38376 0C1.07227 -0.005 0.00507 1.05407 0 2.36557V2.36981V14.2512C0.00527 15.5625 1.07241 16.6214 2.38376 16.6163H14.2512C15.5552 16.6111 16.6111 15.5552 16.6163 14.2512V2.36981C16.6136 1.06393 15.557 0.00522 14.2512 0H2.38376Z"
          fill="currentColor"
        />
        {/* Bottom-right corner */}
        <path
          transform="translate(49.36, 49.36)"
          d="M2.3838 0C1.07252 -0.00504931 0.00524621 1.05387 0 2.36516V14.228C-0.00762607 15.5394 1.04951 16.6087 2.3608 16.6164H2.3838H11.8816C14.4763 16.6164 16.6305 14.4576 16.6305 11.8628V2.36516C16.6253 1.05387 15.558 -0.00504931 14.2467 0H2.3838Z"
          fill="currentColor"
        />
      </svg>
    ),
    coreMotivation: "Power",
    communication: "Commanding",
    attachment: "Disorganized",
    initiation: "Active",
    powerOrientation: "Dominant",
    riskOrientation: "High",
    typicalConfidence: "High",
  },
  {
    name: "Approval Seeker",
    tagline: '"Tell me I\'m enough."',
    color: "#e7b3c2",
    icon: (
      <svg
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <path
          d="M18.75 26.25H11.25C9.17893 26.25 7.5 27.9289 7.5 30V48.75C7.5 50.8211 9.17893 52.5 11.25 52.5H18.75V26.25Z"
          fill="currentColor"
        />
        <path
          d="M50.625 26.25H39.375L42.1875 15.9375C42.8906 13.3594 41.4844 10.6641 38.9063 9.96094C37.6172 9.60938 36.2109 10.3125 35.625 11.4844L25.3125 25.1953C24.8438 25.8984 24.375 26.25 23.4375 26.25V48.75C23.4375 48.75 30 52.5 37.5 52.5H43.125C45.8203 52.5 48.1641 50.5078 48.6328 47.8125L52.3828 30.9375C53.0859 27.5391 50.625 26.25 50.625 26.25Z"
          fill="currentColor"
        />
      </svg>
    ),
    coreMotivation: "Validation",
    communication: "Adaptive",
    attachment: "Anxious",
    initiation: "Responsive",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    typicalConfidence: "Low",
  },
  {
    name: "Minimalist Companion",
    tagline: '"Simple is enough."',
    color: "#B5B2AD",
    icon: (
      <svg
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <circle cx="30" cy="12" r="8" fill="currentColor" />
        <circle cx="30" cy="30" r="8" fill="currentColor" />
        <circle cx="30" cy="48" r="8" fill="currentColor" />
      </svg>
    ),
    coreMotivation: "Connection",
    communication: "Calm",
    attachment: "Avoidant",
    initiation: "Passive",
    powerOrientation: "Submissive",
    riskOrientation: "Low",
    typicalConfidence: "Low",
  },
  {
    name: "Exhibitionist Performer",
    tagline: '"Watch me shine."',
    color: "#e6b65c",
    icon: (
      <svg
        viewBox="0 0 50 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Top narrow ellipse */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M24.6667 0C28.7646 0 32.4017 0.63875 34.6533 1.6625C35.2629 1.93958 35.7587 2.23417 36.0912 2.56667C36.2108 2.68625 36.3333 2.7825 36.3333 2.91667C36.3333 3.05083 36.2108 3.14708 36.0912 3.26667C35.7587 3.59917 35.2629 3.89375 34.6533 4.17083C32.4017 5.19458 28.7646 5.83333 24.6667 5.83333C20.5687 5.83333 16.9317 5.19458 14.68 4.17083C14.0704 3.89375 13.5746 3.59917 13.2421 3.26667C13.1225 3.14708 13 3.05083 13 2.91667C13 2.7825 13.1225 2.68625 13.2421 2.56667C13.5746 2.23417 14.0704 1.93958 14.68 1.6625C16.9317 0.63875 20.5687 0 24.6667 0Z"
          transform="translate(0.5, 0)"
          fill="currentColor"
        />
        {/* Middle trapezoid body */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.14356 33.7727C1.45698 34.3118 -0.41292 32.7126 0.0807525 31.0122L8.84253 0.832997C9.04467 0.136764 9.91094 -0.23658 10.5142 0.165567C12.8504 1.66473 16.3613 2.07898 21.7805 2.07898C27.1997 2.07898 30.0529 2.04446 32.3892 0.545295C33.3055 -0.0655678 34.6232 0.504754 34.9302 1.56233L43.4803 31.0122C43.9739 32.7126 42.104 34.3118 40.4175 33.7727C35.5558 32.219 28.9977 31.2457 21.7805 31.2457C14.5633 31.2457 8.00526 32.219 3.14356 33.7727Z"
          transform="translate(3, 6)"
          fill="currentColor"
        />
        {/* Bottom wide ellipse */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M24.7917 0C33.2354 0 40.7283 1.34167 45.3717 3.45333C46.7775 4.09208 47.9033 4.79208 48.6704 5.55917C49.2246 6.11333 49.5833 6.67625 49.5833 7.29167C49.5833 7.90708 49.2246 8.47 48.6704 9.02417C47.9033 9.79125 46.7775 10.4913 45.3717 11.13C40.7283 13.2417 33.2354 14.5833 24.7917 14.5833C16.3479 14.5833 8.855 13.2417 4.21167 11.13C2.80583 10.4913 1.68 9.79125 0.912917 9.02417C0.35875 8.47 0 7.90708 0 7.29167C0 6.67625 0.35875 6.11333 0.912917 5.55917C1.68 4.79208 2.80583 4.09208 4.21167 3.45333C8.855 1.34167 16.3479 0 24.7917 0Z"
          transform="translate(0, 41)"
          fill="currentColor"
        />
      </svg>
    ),
    coreMotivation: "Validation",
    communication: "Expressive",
    attachment: "Mixed",
    initiation: "Active",
    powerOrientation: "Switch",
    riskOrientation: "High",
    typicalConfidence: "High",
  },
  {
    name: "Curious Apprentice",
    tagline: '"Teach me everything."',
    color: "#6faed9",
    icon: (
      <svg
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <g clipPath="url(#clip0_curious)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M48.5812 45.7346C49.9124 45.8793 51.2109 44.9157 51.2109 43.5767V6.10006C51.2109 5.2426 50.6674 4.46989 49.8334 4.27086C44.1031 2.90346 36.3597 4.22849 32.2918 8.12654C31.935 8.46843 31.7578 8.95031 31.7578 9.44444V47.3364C31.7578 49.0497 33.8326 50.0358 35.2986 49.1492C39.1713 46.807 43.9668 45.2328 48.5812 45.7346Z"
            fill="currentColor"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M14.7499 3.75195C13.1047 3.75187 11.528 3.92504 10.1367 4.26347C9.31665 4.46294 8.78906 5.22759 8.78906 6.07151V43.576C8.78906 44.9149 10.0875 45.8786 11.4187 45.7338C16.0334 45.232 20.8287 46.806 24.7013 49.1482C26.1674 50.0349 28.2422 49.0488 28.2422 47.3355V9.43504C28.2422 8.94628 28.0688 8.46883 27.7179 8.12859C24.6467 5.15051 19.4239 3.75217 14.7499 3.75195Z"
            fill="currentColor"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M9.73676 49.648C7.54617 50.2958 5.24086 48.5525 5.27344 46.2626V13.0669C5.27344 10.7685 3.03843 9.13245 0.978398 10.1517C0.379102 10.4481 0 11.0588 0 11.7272V54.4958C0 55.0579 0.268828 55.586 0.723164 55.9168C1.17762 56.2478 1.76273 56.3412 2.2977 56.1687C4.22349 55.5473 6.1406 55.0659 8.0721 54.7244C13.5476 53.7563 15.0592 48.0388 9.73676 49.648Z"
            fill="currentColor"
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M59.0218 10.1513C56.9617 9.13202 54.7268 10.7682 54.7268 13.0667V46.2621C54.7586 48.5532 52.4543 50.295 50.2633 49.6475C44.9409 48.0385 46.4526 53.756 51.928 54.724C53.8596 55.0655 55.7767 55.5469 57.7025 56.1683C58.2373 56.3407 58.8226 56.2473 59.277 55.9165C59.7314 55.5857 60.0002 55.0575 60.0002 54.4955V11.7267C60.0002 11.0583 59.6211 10.4476 59.0218 10.1513Z"
            fill="currentColor"
          />
        </g>
        <defs>
          <clipPath id="clip0_curious">
            <rect width="60" height="60" fill="white" />
          </clipPath>
        </defs>
      </svg>
    ),
    coreMotivation: "Growth",
    communication: "Open",
    attachment: "Secure",
    initiation: "Shared",
    powerOrientation: "Switch",
    riskOrientation: "Moderate",
    typicalConfidence: "Moderate",
  },
];

const getRiskLevel = (level: "Low" | "Moderate" | "High" | "Very high"): number => {
  switch (level) {
    case "Low":
      return 1;
    case "Moderate":
      return 2;
    case "High":
    case "Very high":
      return 3;
  }
};

// Arrow icons
const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M10 12L6 8L10 4"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M6 12L10 8L6 4"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Attribute icon components
const CommunicationIcon: FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 1C3.58125 1 0 3.90937 0 7.5C0 9.05 0.66875 10.4688 1.78125 11.5844C1.39062 13.1594 0.084375 14.5625 0.06875 14.5781C0 14.65 -0.01875 14.7562 0.021875 14.85C0.0625 14.9437 0.15 15 0.25 15C2.32188 15 3.875 14.0062 4.64375 13.3937C5.66563 13.7781 6.8 14 8 14C12.4187 14 16 11.0906 16 7.5C16 3.90937 12.4187 1 8 1Z"
      fill={color}
    />
  </svg>
);

const AttachmentIcon: FC<{ color: string }> = ({ color }) => (
  <svg width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.447 0.95727C12.7345 -0.502078 10.1877 -0.239583 8.61584 1.38226L8.00023 2.01663L7.38462 1.38226C5.8159 -0.239583 3.26595 -0.502078 1.55348 0.95727C-0.408984 2.63224 -0.512107 5.63843 1.24411 7.45403L7.29087 13.6977C7.68149 14.1008 8.31585 14.1008 8.70647 13.6977L14.7532 7.45403C16.5126 5.63843 16.4094 2.63224 14.447 0.95727Z"
      fill={color}
    />
  </svg>
);

const InitiationIcon: FC<{ color: string }> = ({ color }) => (
  <svg width="9" height="14" viewBox="0 0 9 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8.3253 4.69995H5.07967L6.2778 1.04933C6.3903 0.621826 6.06686 0.199951 5.6253 0.199951H1.5753C1.2378 0.199951 0.950922 0.450264 0.905923 0.784951L0.0059225 7.53495C-0.047515 7.93995 0.267485 8.29995 0.675297 8.29995H4.01373L2.71717 13.7703C2.61592 14.1978 2.94217 14.6 3.37248 14.6C3.60873 14.6 3.83373 14.4762 3.95748 14.2625L8.90749 5.71245C9.16905 5.26526 8.84561 4.69995 8.3253 4.69995Z"
      fill={color}
    />
  </svg>
);

const PowerIcon: FC<{ color: string }> = ({ color }) => (
  <svg width="18" height="15" viewBox="0 0 18 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.85 12.6H3.15C2.9025 12.6 2.7 12.8025 2.7 13.05V13.95C2.7 14.1975 2.9025 14.4 3.15 14.4H14.85C15.0975 14.4 15.3 14.1975 15.3 13.95V13.05C15.3 12.8025 15.0975 12.6 14.85 12.6ZM16.65 3.6C15.9047 3.6 15.3 4.20469 15.3 4.95C15.3 5.14969 15.345 5.33531 15.4237 5.50688L13.3875 6.7275C12.9544 6.98625 12.3947 6.84 12.1444 6.40125L9.85219 2.39062C10.1531 2.14312 10.35 1.77187 10.35 1.35C10.35 0.604688 9.74531 0 9 0C8.25469 0 7.65 0.604688 7.65 1.35C7.65 1.77187 7.84688 2.14312 8.14781 2.39062L5.85562 6.40125C5.60531 6.84 5.04281 6.98625 4.6125 6.7275L2.57906 5.50688C2.655 5.33812 2.70281 5.14969 2.70281 4.95C2.70281 4.20469 2.09812 3.6 1.35281 3.6C0.6075 3.6 0 4.20469 0 4.95C0 5.69531 0.604688 6.3 1.35 6.3C1.42312 6.3 1.49625 6.28875 1.56656 6.2775L3.6 11.7H14.4L16.4334 6.2775C16.5037 6.28875 16.5769 6.3 16.65 6.3C17.3953 6.3 18 5.69531 18 4.95C18 4.20469 17.3953 3.6 16.65 3.6Z"
      fill={color}
    />
  </svg>
);

const ArchetypeCard: FC<{ archetype: Archetype }> = ({ archetype }) => {
  const riskLevel = getRiskLevel(archetype.riskOrientation);
  const confidenceLevel = getRiskLevel(archetype.typicalConfidence);
  const attributeColor = archetype.color;

  return (
    <div
      className="relative flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px] lg:w-[400px] bg-[#130b17] border-2 border-white/10 rounded-[20px] overflow-hidden px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 box-border isolate"
      style={{ clipPath: "inset(0 round 20px)" }}
    >
      {/* Top-right blur effect */}
      <div
        className="absolute w-[100px] h-[100px] sm:w-[150px] sm:h-[140px] lg:w-[200px] lg:h-[190px] -right-[60px] -top-[60px] sm:-right-[70px] sm:-top-[80px] lg:-right-[100px] lg:-top-[120px] rounded-full pointer-events-none blur-[40px] sm:blur-[50px] lg:blur-[60px]"
        style={{
          background: archetype.color,
        }}
        aria-hidden="true"
      />
      {/* Bottom-left blur effect */}
      <div
        className="absolute w-[100px] h-[100px] sm:w-[160px] sm:h-[140px] lg:w-[210px] lg:h-[190px] -left-[60px] -bottom-[60px] sm:-left-[60px] sm:-bottom-[90px] lg:-left-[90px] lg:-bottom-[150px] rounded-full pointer-events-none blur-[40px] sm:blur-[50px] lg:blur-[60px]"
        style={{
          background: archetype.color,
        }}
        aria-hidden="true"
      />

      {/* Header with icon and name */}
      <div className="relative flex items-center gap-2 sm:gap-4 mb-4 sm:mb-5 w-full overflow-hidden">
        <div
          className="flex-shrink-0 flex items-center justify-center w-[48px] h-[48px] sm:w-[60px] sm:h-[60px] lg:w-[68px] lg:h-[68px] rounded-xl p-2 sm:p-2.5"
          style={{ backgroundColor: archetype.color, color: "#0a0510" }}
        >
          {archetype.icon}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <h3 className="font-serif text-[16px] sm:text-[22px] lg:text-[26px] leading-tight text-white break-words">
            {archetype.name}
          </h3>
          <p className="font-serif italic text-[11px] sm:text-[13px] lg:text-[14px] leading-snug text-[#9ca3af] mt-1 break-words">
            {archetype.tagline}
          </p>
        </div>
      </div>

      {/* Behavioral Tendencies */}
      <div className="relative py-3 sm:py-4 w-full overflow-hidden">
        <p className="text-[11px] sm:text-[13px] lg:text-[14px] text-[#9ca3af] mb-3 sm:mb-4">
          Behavioral tendencies:
        </p>

        {/* Core motivation box */}
        <div
          className="flex items-center gap-2 sm:gap-3 p-2 sm:p-4 rounded-xl mb-4 sm:mb-5 w-full box-border"
          style={{ backgroundColor: "#130b17", border: `1px solid ${archetype.color}` }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center w-7 h-7 sm:w-10 sm:h-10 rounded-full"
            style={{ border: `1px solid ${archetype.color}` }}
          >
            <div
              className="flex items-center justify-center w-4 h-4 sm:w-6 sm:h-6 rounded-full"
              style={{ border: `1px solid ${archetype.color}` }}
            >
              <div
                className="w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full"
                style={{ backgroundColor: archetype.color }}
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[9px] sm:text-[11px] lg:text-[12px] font-bold"
              style={{ color: archetype.color }}
            >
              Core motivation:
            </p>
            <p className="font-serif text-[14px] sm:text-[18px] lg:text-[20px] font-medium text-white break-words">
              {archetype.coreMotivation}
            </p>
          </div>
        </div>

        {/* Attributes grid */}
        <div className="grid grid-cols-2 gap-x-2 sm:gap-x-6 lg:gap-x-8 gap-y-3 sm:gap-y-4 w-full">
          <div className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
              <CommunicationIcon color={attributeColor} />
              <span className="text-[9px] sm:text-[11px] lg:text-[12px] text-[#9ca3af]">
                Communication
              </span>
            </div>
            <p className="font-serif text-[12px] sm:text-[14px] lg:text-[16px] font-medium text-white whitespace-nowrap">
              {archetype.communication}
            </p>
          </div>
          <div className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
              <InitiationIcon color={attributeColor} />
              <span className="text-[9px] sm:text-[11px] lg:text-[12px] text-[#9ca3af]">
                Initiation
              </span>
            </div>
            <p className="font-serif text-[12px] sm:text-[14px] lg:text-[16px] font-medium text-white whitespace-nowrap">
              {archetype.initiation}
            </p>
          </div>
          <div className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
              <AttachmentIcon color={attributeColor} />
              <span className="text-[9px] sm:text-[11px] lg:text-[12px] text-[#9ca3af]">
                Attachment
              </span>
            </div>
            <p className="font-serif text-[12px] sm:text-[14px] lg:text-[16px] font-medium text-white whitespace-nowrap">
              {archetype.attachment}
            </p>
          </div>
          <div className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
              <PowerIcon color={attributeColor} />
              <span className="text-[9px] sm:text-[11px] lg:text-[12px] text-[#9ca3af] truncate">
                Power
              </span>
            </div>
            <p className="font-serif text-[12px] sm:text-[14px] lg:text-[16px] font-medium text-white whitespace-nowrap">
              {archetype.powerOrientation}
            </p>
          </div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="relative space-y-3 sm:space-y-4 mt-3 sm:mt-4 w-full">
        <div className="w-full">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[9px] sm:text-[11px] lg:text-[12px] text-[#9ca3af]">
              Risk orientation
            </span>
            <span className="font-serif text-[10px] sm:text-[13px] lg:text-[14px] font-medium text-white">
              {archetype.riskOrientation}
            </span>
          </div>
          <div className="flex gap-[3px] sm:gap-[4px] w-full">
            {[1, 2, 3].map((level) => (
              <div
                key={level}
                className="flex-1 h-[4px] sm:h-[6px] rounded-full"
                style={{
                  backgroundColor: level <= riskLevel ? archetype.color : "rgba(255,255,255,0.1)",
                }}
              />
            ))}
          </div>
        </div>
        <div className="w-full">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-[9px] sm:text-[11px] lg:text-[12px] text-[#9ca3af]">
              Typical confidence
            </span>
            <span className="font-serif text-[10px] sm:text-[13px] lg:text-[14px] font-medium text-white">
              {archetype.typicalConfidence}
            </span>
          </div>
          <div className="flex gap-[3px] sm:gap-[4px] w-full">
            {[1, 2, 3].map((level) => (
              <div
                key={level}
                className="flex-1 h-[4px] sm:h-[6px] rounded-full"
                style={{
                  backgroundColor:
                    level <= confidenceLevel ? archetype.color : "rgba(255,255,255,0.1)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const SparkleIcon: FC = () => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-6 h-6 sm:w-8 sm:h-8"
  >
    <path
      d="M25.28 15.41C25.28 14.91 24.99 14.45 24.54 14.23C23.39 13.65 22.16 13.11 20.79 12.59C18.51 11.72 16.86 10.04 15.99 7.74C15.48 6.34 14.95 5.1 14.38 3.94C14.16 3.48 13.69 3.19 13.19 3.19C12.69 3.19 12.22 3.48 12 3.94C11.43 5.1 10.9 6.34 10.39 7.74C9.52 10.04 7.86 11.72 5.59 12.59C4.21 13.11 3 13.65 1.88 14.23C1.43 14.45 1.14 14.91 1.14 15.41C1.14 15.91 1.43 16.37 1.88 16.59C3 17.17 4.21 17.71 5.59 18.23C7.86 19.1 9.52 20.78 10.39 23.08C10.9 24.48 11.43 25.72 12 26.88C12.22 27.33 12.69 27.63 13.19 27.63C13.69 27.63 14.16 27.33 14.38 26.88C14.95 25.72 15.48 24.48 15.99 23.08C16.86 20.78 18.51 19.1 20.79 18.23C22.16 17.71 23.39 17.17 24.54 16.59C24.99 16.37 25.28 15.91 25.28 15.41Z"
      fill="#fe6839"
    />
    <path
      d="M22.52 8.7C22.86 8.87 23.2 8.99 23.53 9.11C23.8 9.22 24 9.41 24.1 9.69C24.22 10.03 24.36 10.36 24.53 10.7C24.75 11.16 25.22 11.45 25.72 11.45C26.22 11.45 26.69 11.16 26.91 10.7C27.08 10.36 27.22 10.03 27.34 9.69C27.45 9.41 27.64 9.22 27.91 9.11C28.25 8.99 28.58 8.87 28.92 8.7C29.37 8.47 29.67 8.01 29.67 7.51C29.67 7.01 29.37 6.55 28.92 6.33C28.58 6.16 28.25 6.02 27.91 5.9C27.64 5.8 27.45 5.6 27.34 5.32C27.22 4.98 27.08 4.65 26.91 4.31C26.69 3.85 26.22 3.56 25.72 3.56C25.22 3.56 24.75 3.85 24.53 4.31C24.36 4.65 24.22 4.98 24.1 5.32C24 5.6 23.8 5.8 23.53 5.9C23.2 6.02 22.86 6.16 22.52 6.33C22.07 6.55 21.77 7.01 21.77 7.51C21.77 8.01 22.07 8.47 22.52 8.7Z"
      fill="#fe6839"
    />
  </svg>
);

const TeaserCard: FC = () => (
  <div
    className="relative flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px] lg:w-[400px] bg-[#130b17] border-2 border-white/10 rounded-[20px] overflow-hidden px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 box-border isolate flex flex-col items-center justify-between text-center"
    style={{ clipPath: "inset(0 round 20px)" }}
  >
    {/* Top-right glow */}
    <div
      className="absolute w-[120px] h-[120px] sm:w-[160px] sm:h-[160px] -right-[40px] -top-[40px] rounded-full pointer-events-none blur-[60px]"
      style={{ background: "rgba(168, 85, 247, 0.4)" }}
      aria-hidden="true"
    />
    {/* Bottom-left glow */}
    <div
      className="absolute w-[120px] h-[120px] sm:w-[160px] sm:h-[160px] -left-[40px] -bottom-[40px] rounded-full pointer-events-none blur-[60px]"
      style={{ background: "rgba(254, 104, 57, 0.3)" }}
      aria-hidden="true"
    />

    {/* Top section */}
    <div className="relative flex flex-col items-center">
      {/* Pill */}
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-[25px] py-[9px] backdrop-blur-sm mb-2 sm:mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-[#fe6839]" aria-hidden />
        <span className="font-sans text-[13px] font-bold leading-[13.5px] tracking-[0.9px] uppercase text-white">
          Unlock Insight
        </span>
      </div>

      {/* Title */}
      <h3 className="font-serif text-[20px] sm:text-[28px] lg:text-[32px] leading-tight text-white">
        7 more{" "}
        <span className="bg-gradient-to-r from-[#fe6839] via-[#a78bfa] to-[#e9d5ff] bg-clip-text text-transparent italic">
          archetypes
        </span>
        <br />
        to explore...
      </h3>
    </div>

    {/* Archetype name stack */}
    <div className="relative flex flex-col items-center gap-1 sm:gap-3 w-full overflow-hidden py-1 sm:py-3">
      {/* Faded outer items hidden on mobile to save space */}
      <span className="hidden sm:block font-serif sm:text-[16px] lg:text-[18px] leading-[24px] text-white/20">
        Emotional Voyeur
      </span>
      <div className="flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-[#130b17]" aria-hidden />
        <span className="h-1 w-1 rounded-full bg-white/40" aria-hidden />
        <span className="font-serif text-[13px] sm:text-[18px] lg:text-[21px] leading-[22px] sm:leading-[24px] text-white/40">
          Explorer of Edges
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 rounded-xl border border-white/10 bg-white/5 px-3 sm:px-6 py-1.5 sm:py-3 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)] backdrop-blur-sm">
        <SparkleIcon />
        <span className="font-serif text-[15px] sm:text-[22px] lg:text-[26px] leading-[26px] sm:leading-[28px] font-medium text-white">
          Spiritual Lover
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-[#130b17]" aria-hidden />
        <span className="h-1 w-1 rounded-full bg-white/40" aria-hidden />
        <span className="font-serif text-[13px] sm:text-[18px] lg:text-[21px] leading-[22px] sm:leading-[24px] text-white/40">
          Loyal Ritualist
        </span>
      </div>
      <span className="hidden sm:block font-serif sm:text-[16px] lg:text-[18px] leading-[24px] text-white/20">
        Analytical Sexualist
      </span>
    </div>

    {/* Bottom section */}
    <div className="relative flex flex-col items-center">
      <p className="font-sans text-[11px] sm:text-[14px] lg:text-[16px] font-medium leading-[15px] sm:leading-[19.5px] text-center text-[#D1D5DB] max-w-[240px] sm:max-w-[444px] mb-3 sm:mb-5">
        To explore all 14 archetypes, start our survey and discover which ones fit you best.
      </p>

      <Link
        href="/waitlist"
        aria-label="Start survey now - discover your archetype"
        className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-brand px-5 py-2.5 sm:px-6 sm:py-3 text-[12px] sm:text-[14px] font-semibold text-white shadow-pill transition hover:translate-y-[-2px] focus-visible-ring"
        onClick={() => trackStartSurvey("archetype-teaser")}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
        <span className="relative z-10 transition-colors duration-500 group-hover:text-black">
          Start survey now
        </span>
        <svg
          aria-hidden
          className="relative z-10 h-4 w-4 transition-colors duration-500 group-hover:text-black"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </Link>

      <p className="mt-1.5 sm:mt-3 font-sans text-[9px] sm:text-[10px] font-bold leading-[18px] sm:leading-[20px] tracking-[1.4px] uppercase text-white/40 text-center">
        {"\u2022"}Takes 10 minutes {"\u2022"} No account required
      </p>
    </div>
  </div>
);

const S06Archetypes: FC = () => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const directionLockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const currentTranslateRef = useRef(0);
  const startTranslateRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const animateFnRef = useRef<((timestamp: number) => void) | null>(null);

  // Card dimensions based on screen size (matching the card widths + responsive gap)
  const getCardWidth = useCallback(() => {
    if (typeof window === "undefined") return 480;
    if (window.innerWidth < 640) return 296; // 280px + 16px gap (gap-4)
    if (window.innerWidth < 768) return 352; // 320px + 32px gap (gap-8)
    if (window.innerWidth < 1024) return 392; // 360px + 32px gap (gap-8)
    return 424; // 400px + 24px gap (lg:gap-6)
  }, []);

  const [cardWidth, setCardWidth] = useState(480);
  // Each set = 7 archetype cards + 1 teaser card = 8 cards. We use 3 sets doubled = 6 sets
  const cardsPerSet = archetypes.length + 1; // 7 + 1 teaser
  const totalWidth = cardWidth * cardsPerSet * 2;

  useEffect(() => {
    const handleResize = () => {
      setCardWidth(getCardWidth());
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getCardWidth]);

  const updateActiveIndex = useCallback(() => {
    const position = Math.abs(currentTranslateRef.current);
    const index = Math.round(position / cardWidth) % cardsPerSet;
    setActiveIndex(index);
  }, [cardWidth, cardsPerSet]);

  const animate = useCallback(
    (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (!isPaused && !isDraggingRef.current) {
        currentTranslateRef.current -= delta * 0.025; // Speed: pixels per ms

        if (Math.abs(currentTranslateRef.current) >= totalWidth) {
          currentTranslateRef.current = currentTranslateRef.current + totalWidth;
        }

        if (carouselRef.current) {
          carouselRef.current.style.transform = `translateX(${currentTranslateRef.current}px)`;
        }

        updateActiveIndex();
      }

      if (animateFnRef.current) {
        animationRef.current = requestAnimationFrame(animateFnRef.current);
      }
    },
    [isPaused, totalWidth, updateActiveIndex]
  );

  useEffect(() => {
    animateFnRef.current = animate;
  }, [animate]);

  useEffect(() => {
    const startAnimation = (timestamp: number) => {
      if (animateFnRef.current) animateFnRef.current(timestamp);
    };
    animationRef.current = requestAnimationFrame(startAnimation);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const handleDragStart = (clientX: number, clientY?: number) => {
    isDraggingRef.current = true;
    startXRef.current = clientX;
    startYRef.current = clientY ?? 0;
    directionLockedRef.current = null;
    startTranslateRef.current = currentTranslateRef.current;
  };

  const handleDragMove = (clientX: number, clientY?: number, e?: React.TouchEvent) => {
    if (!isDraggingRef.current) return;

    if (clientY !== undefined && directionLockedRef.current === null) {
      const deltaX = Math.abs(clientX - startXRef.current);
      const deltaY = Math.abs(clientY - startYRef.current);
      if (deltaX > 5 || deltaY > 5) {
        directionLockedRef.current = deltaX > deltaY ? "horizontal" : "vertical";
      }
    }

    if (directionLockedRef.current === "vertical") {
      isDraggingRef.current = false;
      return;
    }

    if (directionLockedRef.current === "horizontal" && e) {
      e.preventDefault();
    }

    const diff = clientX - startXRef.current;
    currentTranslateRef.current = startTranslateRef.current + diff;

    if (currentTranslateRef.current > 0) {
      currentTranslateRef.current = -totalWidth + currentTranslateRef.current;
    } else if (Math.abs(currentTranslateRef.current) >= totalWidth) {
      currentTranslateRef.current = currentTranslateRef.current + totalWidth;
    }

    if (carouselRef.current) {
      carouselRef.current.style.transform = `translateX(${currentTranslateRef.current}px)`;
    }
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    directionLockedRef.current = null;
    lastTimeRef.current = 0;
    updateActiveIndex();
  };

  const navigateToSlide = useCallback(
    (index: number) => {
      const targetPosition = -(index * cardWidth);
      currentTranslateRef.current = targetPosition;
      if (carouselRef.current) {
        carouselRef.current.style.transition = "transform 0.4s ease-out";
        carouselRef.current.style.transform = `translateX(${targetPosition}px)`;
        setTimeout(() => {
          if (carouselRef.current) {
            carouselRef.current.style.transition = "";
          }
        }, 400);
      }
      setActiveIndex(index);
      lastTimeRef.current = 0;
    },
    [cardWidth]
  );

  const handlePrevious = useCallback(() => {
    const newIndex = activeIndex <= 0 ? cardsPerSet - 1 : activeIndex - 1;
    navigateToSlide(newIndex);
  }, [activeIndex, cardsPerSet, navigateToSlide]);

  const handleNext = useCallback(() => {
    const newIndex = activeIndex >= cardsPerSet - 1 ? 0 : activeIndex + 1;
    navigateToSlide(newIndex);
  }, [activeIndex, cardsPerSet, navigateToSlide]);

  const handleDotClick = useCallback(
    (index: number) => {
      navigateToSlide(index);
    },
    [navigateToSlide]
  );

  return (
    <section
      className="relative overflow-hidden bg-[#0A0510] py-10 sm:py-16 lg:py-20 text-text-primary"
      aria-labelledby="archetypes-heading"
    >
      {/* Background blur */}
      <div
        className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 w-[616px] h-[594px] rounded-full pointer-events-none"
        style={{
          background: "rgba(84, 20, 117, 0.5)",
          filter: "blur(200px)",
        }}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="content-shell relative text-center mb-20 sm:mb-14 lg:mb-16 px-4">
        <h2
          id="archetypes-heading"
          className="font-serif text-[36px] sm:text-[48px] lg:text-[64px] leading-tight text-white tracking-[-0.02em]"
        >
          <span className="font-normal block sm:inline">Explore Our</span>{" "}
          <span className="font-medium italic bg-gradient-to-r from-[#fe6839] via-[#a78bfa] to-[#e9d5ff] bg-clip-text text-transparent block sm:inline">
            14 Archetypes
          </span>
        </h2>
        <p className="mt-6 sm:mt-8 text-[16px] sm:text-[18px] lg:text-[20px] leading-relaxed text-[#d1d5db] max-w-[1000px] mx-auto">
          <span className="font-extrabold text-white">No one is just a single archetype.</span> We
          all express a unique mix, shaped by context, history, and relationships. That&apos;s why
          our mission is to help you explore the archetypes that resonate most with you.
        </p>
      </div>

      {/* Carousel */}
      <div className="relative w-screen max-w-none left-1/2 -translate-x-1/2 overflow-hidden pb-4 mt-10 sm:mt-0">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-24 lg:w-32 bg-gradient-to-r from-[#0a0510] to-transparent z-10"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-24 lg:w-32 bg-gradient-to-l from-[#0a0510] to-transparent z-10"
          aria-hidden
        />

        <div
          ref={carouselRef}
          className="flex w-max cursor-grab active:cursor-grabbing select-none gap-4 sm:gap-8 lg:gap-6 px-4"
          onMouseDown={(e) => {
            e.preventDefault();
            handleDragStart(e.clientX);
          }}
          onMouseMove={(e) => handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
          onMouseLeave={() => {
            handleDragEnd();
            setIsPaused(false);
          }}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientX, e.touches[0].clientY, e)}
          onTouchEnd={handleDragEnd}
          onMouseEnter={() => setIsPaused(true)}
        >
          {Array.from({ length: 6 }, (_, setIdx) => [
            ...archetypes.map((archetype, cardIdx) => (
              <ArchetypeCard key={`${archetype.name}-${setIdx}-${cardIdx}`} archetype={archetype} />
            )),
            <TeaserCard key={`teaser-${setIdx}`} />,
          ]).flat()}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 sm:gap-6 mt-6 sm:mt-8 pb-4 sm:pb-8">
        <button
          onClick={handlePrevious}
          className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#1e102e] border border-white/10 shadow-sm transition-all duration-200 hover:bg-[#2a1840] hover:border-white/20 active:scale-95"
          aria-label="Previous archetype"
        >
          <ChevronLeft />
        </button>

        <div className="flex items-center gap-2">
          {Array.from({ length: cardsPerSet }, (_, index) => (
            <button
              key={index}
              onClick={() => handleDotClick(index)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === activeIndex ? "bg-[#fe6839]" : "bg-white/20 hover:bg-white/40"
              }`}
              aria-label={`Go to card ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#1e102e] border border-white/10 shadow-sm transition-all duration-200 hover:bg-[#2a1840] hover:border-white/20 active:scale-95"
          aria-label="Next archetype"
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
};

export default S06Archetypes;
