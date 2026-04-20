import type { FC } from "react";

const FriendPlusPaths: FC = () => (
  <>
    <path
      d="M16 21V19C16 16.7923 14.2077 15 12 15H6C3.79234 15 2 16.7923 2 19V21"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 7C5 8.42906 5.7624 9.74957 7 10.4641C8.2376 11.1786 9.7624 11.1786 11 10.4641C12.2376 9.74957 13 8.42906 13 7C13 4.79234 11.2077 3 9 3C6.79234 3 5 4.79234 5 7H5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 8V14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 11H16"
      stroke="currentColor"
      strokeWidth="1.5"
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
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <FriendPlusPaths />
  </svg>
);

export const InviteFriendIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <FriendPlusPaths />
  </svg>
);
