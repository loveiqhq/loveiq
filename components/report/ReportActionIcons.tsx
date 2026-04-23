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
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    strokeWidth="2.66667"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M24 10.6666C26.2091 10.6666 28 8.87577 28 6.66663C28 4.45749 26.2091 2.66663 24 2.66663C21.7909 2.66663 20 4.45749 20 6.66663C20 8.87577 21.7909 10.6666 24 10.6666Z" />
    <path d="M8 20C10.2091 20 12 18.2091 12 16C12 13.7909 10.2091 12 8 12C5.79086 12 4 13.7909 4 16C4 18.2091 5.79086 20 8 20Z" />
    <path d="M24 29.3334C26.2091 29.3334 28 27.5425 28 25.3334C28 23.1242 26.2091 21.3334 24 21.3334C21.7909 21.3334 20 23.1242 20 25.3334C20 27.5425 21.7909 29.3334 24 29.3334Z" />
    <path d="M11.4534 18.0133L20.56 23.32" />
    <path d="M20.5467 8.68005L11.4534 13.9867" />
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
