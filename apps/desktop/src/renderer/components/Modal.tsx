import type { ReactNode } from "react";
import styled from "styled-components";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ title, onClose, children, footer, wide = false }: ModalProps) {
  return (
    <Overlay onClick={onClose}>
      <Card $wide={wide} onClick={(event) => event.stopPropagation()}>
        <Title>{title}</Title>
        <Body>{children}</Body>
        {footer && <Footer>{footer}</Footer>}
      </Card>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
`;

const Card = styled.div<{ $wide?: boolean }>`
  width: ${({ $wide }) => ($wide ? "560px" : "360px")};
  max-width: calc(100vw - 48px);
  padding: ${({ theme }) => theme.spaces["6"]};
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

const Title = styled.div`
  margin-bottom: ${({ theme }) => theme.spaces["4"]};
  color: ${({ theme }) => theme.colors.text};
  font-size: 16px;
  font-weight: 700;
`;

const Body = styled.div`
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spaces["2"]};
  margin-top: ${({ theme }) => theme.spaces["4"]};
`;
