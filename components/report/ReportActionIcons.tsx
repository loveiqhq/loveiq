import type { FC } from "react";

const FriendPlusPaths: FC = () => (
  <>
    <path
      d="M10.6673 14V12.6667C10.6673 11.9594 10.3864 11.2811 9.88627 10.781C9.38617 10.281 8.70789 10 8.00065 10H4.00065C3.29341 10 2.61513 10.281 2.11503 10.781C1.61494 11.2811 1.33398 11.9594 1.33398 12.6667V14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.00065 7.33333C7.47341 7.33333 8.66732 6.13943 8.66732 4.66667C8.66732 3.19391 7.47341 2 6.00065 2C4.52789 2 3.33398 3.19391 3.33398 4.66667C3.33398 6.13943 4.52789 7.33333 6.00065 7.33333Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12.666 5.33331V9.33331"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.666 7.33331H10.666"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

export const ShareReportIcon: FC = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M7.33398 9.33331H14.0007"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.666 2.66669H11.9993C12.353 2.66669 12.6921 2.80716 12.9422 3.05721C13.1922 3.30726 13.3327 3.6464 13.3327 4.00002V4.89602"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11.334 12L14.0007 9.33335L11.334 6.66669"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5.33268 2.66669H3.99935C3.64573 2.66669 3.30659 2.80716 3.05654 3.05721C2.80649 3.30726 2.66602 3.6464 2.66602 4.00002V13.3334C2.66602 13.687 2.80649 14.0261 3.05654 14.2762C3.30659 14.5262 3.64573 14.6667 3.99935 14.6667H11.9993C12.248 14.6667 12.4916 14.5973 12.7028 14.4662C12.9141 14.3351 13.0844 14.1475 13.1947 13.9247"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.0007 1.33331H6.00065C5.63246 1.33331 5.33398 1.63179 5.33398 1.99998V3.33331C5.33398 3.7015 5.63246 3.99998 6.00065 3.99998H10.0007C10.3688 3.99998 10.6673 3.7015 10.6673 3.33331V1.99998C10.6673 1.63179 10.3688 1.33331 10.0007 1.33331Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ReferFriendIcon: FC = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <FriendPlusPaths />
  </svg>
);

export const InviteFriendIcon: FC = () => (
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <FriendPlusPaths />
  </svg>
);
