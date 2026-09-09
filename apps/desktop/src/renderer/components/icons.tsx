import styled from "styled-components";

interface IconProps {
  size?: number;
}

export function LogoMark({ size = 46 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 24" fill="none" aria-hidden="true">
      <path d="M11 2 L20 10 L15 10 L21 20 L15 20 L21 24 L1 24 L7 20 L1 20 L7 10 L2 10 Z" fill="white" />
    </svg>
  );
}

export function ChatIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H6l-3 3v-3h-.5A1.5 1.5 0 0 1 1 9.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightIcon({ size = 10 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M4 2.5L8 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolderIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3l2 2h5A1.5 1.5 0 0 1 14.5 5.5v6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function FolderOpenIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3l2 2h5A1.5 1.5 0 0 1 14.5 5.5v1l-1.6 4.2a1.5 1.5 0 0 1-1.4 1H3a1.5 1.5 0 0 1-1.5-1.5v-6.7Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

export function FileIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 1.5h6l3 3v9A1.5 1.5 0 0 1 10.5 15h-7A1.5 1.5 0 0 1 2 13.5v-10A1.5 1.5 0 0 1 3.5 2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M9 1.5v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function FilePlusIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 1.5h6l3 3v9A1.5 1.5 0 0 1 10.5 15h-7A1.5 1.5 0 0 1 2 13.5v-10A1.5 1.5 0 0 1 3.5 2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M9 1.5v3h3M8 8v4M6 10h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolderPlusIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3l2 2h5A1.5 1.5 0 0 1 14.5 5.5v6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.5v4M6 8.5h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckIcon({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CrossIcon({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export const Spinner = styled.span<{ $size?: number }>`
  display: inline-block;
  width: ${({ $size }) => $size ?? 16}px;
  height: ${({ $size }) => $size ?? 16}px;
  flex: none;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.colors.accentSoft};
  border-top-color: ${({ theme }) => theme.colors.accent};
  animation: spin 0.7s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
