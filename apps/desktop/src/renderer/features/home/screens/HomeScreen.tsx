import styled from "styled-components";
import { useAppSelector } from "@/renderer/store/hooks";

const Page = styled.main`
  min-height: 100vh;
  display: grid;
  place-items: center;
  color: #111111;
  background: #ffffff;
  font-family: Inter, system-ui, sans-serif;
`;

export function HomeScreen() {
  const ready = useAppSelector(state => state.home.ready);

  return (
    <Page>
      <p>Ready: {String(ready)}</p>
    </Page>
  );
}
