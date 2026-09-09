import { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
  html,
  body,
  #root {
    margin: 0;
    height: 100%;
  }

  body {
    background: ${({ theme }) => theme.colors.bgDeep};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.font.sans};
    font-size: 15px;
    line-height: 1.6;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  * {
    box-sizing: border-box;
  }

  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.scrollbar};
    border: 2px solid transparent;
    background-clip: content-box;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${({ theme }) => theme.colors.borderStrong};
    background-clip: content-box;
    border: 2px solid transparent;
  }

  button {
    font-family: inherit;
  }

  input,
  textarea {
    font-family: inherit;
  }

  h1,
  h2,
  h3,
  h4,
  p {
    margin: 0;
  }
`;
