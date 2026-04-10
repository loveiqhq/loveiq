import type { FC, ReactNode } from "react";

interface FragmentProps {
  children: ReactNode;
  height: number;
  viewBox: string;
  width: number;
  x: number;
  y: number;
}

const FigmaFragment: FC<FragmentProps> = ({ children, height, viewBox, width, x, y }) => (
  <svg
    x={x}
    y={y}
    width={width}
    height={height}
    viewBox={viewBox}
    fill="none"
    overflow="visible"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const ShareReportIcon: FC = () => (
  <svg viewBox="0 0 11.1 12.6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <FigmaFragment x={0} y={0} width={2.667} height={2.229} viewBox="0 0 4 4">
      <path
        d="M0.5 0.5H1.83333C2.18696 0.5 2.52609 0.640476 2.77614 0.890524C3.02619 1.14057 3.16667 1.47971 3.16667 1.83333V2.72933"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FigmaFragment>
    <FigmaFragment x={0.833} y={4.667} width={5.333} height={2.667} viewBox="0 0 7 4">
      <path
        d="M5.16667 0.5H1.16667C0.798477 0.5 0.5 0.798477 0.5 1.16667V2.5C0.5 2.86819 0.798477 3.16667 1.16667 3.16667H5.16667C5.53486 3.16667 5.83333 2.86819 5.83333 2.5V1.16667C5.83333 0.798477 5.53486 0.5 5.16667 0.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FigmaFragment>
    <FigmaFragment x={0} y={0} width={10.529} height={12} viewBox="0 0 12 13">
      <path
        d="M3.16667 0.5H1.83333C1.47971 0.5 1.14057 0.640476 0.890524 0.890524C0.640476 1.14057 0.5 1.47971 0.5 1.83333V11.1667C0.5 11.5203 0.640476 11.8594 0.890524 12.1095C1.14057 12.3595 1.47971 12.5 1.83333 12.5H9.83333C10.0819 12.5001 10.3256 12.4306 10.5368 12.2995C10.7481 12.1684 10.9184 11.9808 11.0287 11.758"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FigmaFragment>
    <FigmaFragment x={2.167} y={7.833} width={6.667} height={1} viewBox="0 0 8 1">
      <path
        d="M0.5 0.5H7.16667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FigmaFragment>
    <FigmaFragment x={8.167} y={4.667} width={2.667} height={5.333} viewBox="0 0 4 7">
      <path
        d="M0.5 5.83333L3.16667 3.16667L0.5 0.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FigmaFragment>
  </svg>
);

const FriendBaseIcon: FC = () => (
  <>
    <FigmaFragment x={0} y={0} width={5.333} height={5.333} viewBox="0 0 7 7">
      <path
        d="M3.16667 5.83333C4.63943 5.83333 5.83333 4.63943 5.83333 3.16667C5.83333 1.69391 4.63943 0.5 3.16667 0.5C1.69391 0.5 0.5 1.69391 0.5 3.16667C0.5 4.63943 1.69391 5.83333 3.16667 5.83333Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FigmaFragment>
    <FigmaFragment x={0.333} y={1} width={9.333} height={4} viewBox="0 0 11 5">
      <path
        d="M9.83333 4.5V3.16667C9.83333 2.45942 9.55238 1.78115 9.05228 1.28105C8.55219 0.780952 7.87391 0.5 7.16667 0.5H3.16667C2.45942 0.5 1.78115 0.780952 1.28105 1.28105C0.780952 1.78115 0.5 2.45942 0.5 3.16667V4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FigmaFragment>
    <FigmaFragment x={5.833} y={3.167} width={4} height={1} viewBox="0 0 5 1">
      <path d="M4.5 0.5H0.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </FigmaFragment>
    <FigmaFragment x={7.833} y={1.167} width={1} height={4} viewBox="0 0 1 5">
      <path d="M0.5 0.5V4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </FigmaFragment>
  </>
);

export const ReferFriendIcon: FC = () => (
  <svg viewBox="0 0 9.9 5.9" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <FriendBaseIcon />
  </svg>
);

export const InviteFriendIcon: FC = () => (
  <svg viewBox="0 0 9.9 5.9" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <FriendBaseIcon />
  </svg>
);
