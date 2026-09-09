import { useAppSelector } from "@renderer/store/hooks";
export function Login() {
  const models = useAppSelector(state => state.login.models);
  return <div>hello {models}</div>;
}
